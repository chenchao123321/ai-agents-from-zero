# 23 - LangGraph API：图与状态

---

**本章课程目标：**

- 理解 **Graph API 里的 Graph（图）** 到底是什么，知道 `StateGraph`、`START`、`END`、`compile()`、`invoke()` 分别负责什么。
- 理解 **State（状态）** 和 **Reducer（规约函数）** 的分工，知道为什么 LangGraph 不是靠“函数之间手动传一堆参数”，而是靠“共享状态 + 按规则合并更新”来驱动工作流。
- 掌握 **TypedDict / Pydantic / dataclass** 这些 State Schema 写法、**state_schema / input_schema / output_schema** 的边界，以及 **默认覆盖、`add_messages`、`operator.add`、`operator.mul`、自定义 Reducer** 这些常见状态合并方式。
- 能运行并理解本章全部案例，为后续 [第 24 章 LangGraph API：节点、边与进阶](24-LangGraphAPI：节点、边与进阶.md) 打基础。

**学习建议：** 本章建议按 **“Graph 是什么 → 怎么构建一张完整图 → State 为什么是核心 → State Schema 怎么定义 → 输入/输出 Schema 怎么收口 → Reducer 怎么决定状态合并”** 的顺序学习。不要一上来死记所有 Reducer 名字，先把“**节点只返回局部更新，State 负责承载数据，Reducer 负责决定这些更新怎么合并回状态**”这件事想清楚，后面的 `add_messages`、`operator.add`、自定义 Reducer 才会真正串起来。

**官方文档与资源**：详见 [工具导航与参考资料索引 - LangGraph](工具导航与参考资料索引.md#LangGraph)。

---

## 1、Graph API 之 Graph（图）

### 1.1 定义

在 LangGraph 的 **Graph API** 里，**Graph（图）** 可以先理解成：**由节点和有向边组成的一张可执行工作流结构图**。节点负责“这一站做什么”，边负责“这一站执行完后下一步往哪走”，`START` 和 `END` 分别表示图的入口和出口。

这里的“图”不是只画给人看的流程图，而是**真的会被编译、运行、调度的程序结构**。当你把状态、节点和边定义好，再调用 `compile()`，LangGraph 会把这个图构建器编译成一个真正可运行的应用对象；之后就可以用 `invoke(...)`、`stream(...)` 等方式执行这张图。

![有向图在工作流中的含义示意](images/23/23-1-1-1.jpeg)

这张图可以这样看：左侧 **Start** 是入口，右侧 **End** 是出口，中间 `node 1 ~ node 5` 是不同业务步骤，箭头是执行方向。多条箭头从 Start 指向不同节点，说明流程可以分支或并行；多条路径最终汇聚到 End，说明不同路线最后可以收束到统一出口。后面你在 LangGraph 里写 `add_edge(START, "node_a")`、`add_edge("node_a", "node_b")`，本质上就是在把这种“有向工作流结构”落到代码里。

### 1.2 为什么这一章还要单独讲 Graph

[第 22 章](22-LangGraph概述与快速入门.md) 已经讲过 LangGraph 四要素了，那为什么这一章还要把 Graph 单独拎出来？原因是：**上一章主要帮你建立“图能跑起来”的直觉，这一章要开始把“图构建器、状态接口、状态合并规则”讲得更工程化。**

真实项目里，Graph 这一层最容易踩坑的往往不是“节点函数怎么写”，而是下面这些问题：

- 图的入口和出口到底怎么约定？哪些节点只是内部步骤，哪些字段应该暴露给外部调用方？
- 节点之间到底共享哪一份状态？某个节点只返回了一小段更新后，框架是覆盖旧值、追加列表，还是做自定义合并？
- 当流程越来越复杂时，怎么让“控制结构本身”仍然清楚，而不是把跳转逻辑散落在一堆 Python 函数和 `if/while` 里？

所以这一章不是重复“图由节点和边组成”这句话，而是要把 **Graph 负责控制结构，State 负责数据流转，而 State 又可以继续拆成 Schema 和 Reducer 两层机制** 这条主线讲清楚。

### 1.3 构建一张完整 Graph，最小流程还是这 5 步

如果先不看条件边、`Send`、`Command`、`Runtime` 等进阶能力（这些在 [第 24 章](24-LangGraphAPI：节点、边与进阶.md) 系统讲），构建一张最基础的 `StateGraph`，最核心的流程还是下面 5 步：

1. **定义 State Schema**：先说明这张图内部要维护哪些状态字段。
2. **创建 `StateGraph` 构建器**：`builder = StateGraph(MyState)`。
3. **注册节点并连接边**：`add_node(...)`、`add_edge(...)`，并用 `START` / `END` 明确入口和出口。
4. **编译图**：`graph = builder.compile()`，把构建器变成可运行对象。
5. **执行图**：`graph.invoke(initial_state)`，传入初始状态，拿到最终状态。

这里要特别强调一个很容易忽略的点：**节点函数通常不需要返回完整 State，只需要返回“本节点想更新的那几个字段”就行。** 这些局部更新会按 State 上定义的 Reducer 规则合并回全局状态。也就是说，**Graph 管执行顺序，State 管共享数据，而 State 内部又是靠 Schema 和 Reducer 一起工作。**

再补充一个更贴近运行时的理解：**LangGraph 图并不是单纯“按文件里写的顺序一行行往下跑”**。当你执行 `compile()` 之后，底层运行时会按“步骤 / superstep”的方式推进图：某一步里哪些节点该执行、哪些状态更新会在下一步生效，都是由运行时调度出来的。  
在入门阶段，先不需要钻进底层实现细节，你只要先记住：**多条边从同一个节点发散时，后续节点并不一定是“串行排队”执行；图会按运行时规则调度这些节点，并把它们产生的状态更新合并回 State。** 这也是后面你看到“并行分支”和“同一步多个节点同时写状态”时，不会觉得奇怪的原因。

### 1.4 案例：构建一个完整的固定流程图

这个案例用 `input → process → output` 三个节点连成一条固定路径，重点不是业务逻辑本身，而是让你看清楚：**同一份 `process_data` 是怎么沿着节点一步步传下去，又是怎么被后续节点更新的。**

**这个案例重点看什么：**

- `StateGraph(GraphState)` 是怎么把“这张图内部的状态结构”绑定到图构建器上的。
- `add_node("input", input_node)`、`add_edge(START, "input")` 这类写法是怎么把函数注册成节点、再把节点串起来的。
- 为什么 `input_node`、`process_node`、`output_node` 都是“接收当前 state，返回局部更新 dict”。
- 为什么最终 `process_data` 只保留了 `{"process": "process_value9527"}`，而不是把初始输入和前面节点写入内容全都自动合并起来。答案就在后面的 **默认 Reducer = 覆盖更新**。

【案例源码】`案例与源码-3-LangGraph框架/02-graph/BuildWholeGraphSummary.py`

[BuildWholeGraphSummary.py](案例与源码-3-LangGraph框架/02-graph/BuildWholeGraphSummary.py ":include :type=code")

### 1.5 真实项目里设计 Graph 结构时，先想这几个问题

本章案例里的图都很小，但真实项目一旦变复杂，Graph 结构设计就不能只靠“想到哪就加哪”。动手写图之前，建议先想清楚这几个问题：

- **哪些步骤应该拆成独立节点？** 如果某段逻辑需要单独调试、单独复用、单独观察耗时，通常适合拆成节点；如果只是一个很小的局部计算，不一定非要硬拆。
- **哪些流程是固定边，哪些流程应该交给条件边？** 例如“先检索再总结”通常可以是固定边，“如果检索结果不够就重新查询，否则进入回答生成”就更适合条件边。
- **哪些数据应该放进 State，哪些只是节点内部临时变量？** 需要跨节点传递、需要持久化恢复、需要给后续节点继续用的数据，应该进 State；只在当前函数里用一下的临时计算结果，不必都塞进 State。
- **对外暴露的输入输出接口要不要和内部完整状态分开？** 如果这张图将来要被别的服务调用，通常不希望外部直接看到所有内部字段，这就要考虑 `input_schema` 和 `output_schema`。

这些问题会自然引出第二部分：**State 到底怎么定义，更新又怎么合并。**

---

## 2、Graph API 之 State（状态）

### 2.1 定义

在 LangGraph 中，**State（状态）** 是贯穿整张图执行过程的一份**共享数据快照**。每个节点都会接收当前 State，执行自己的逻辑，然后返回一份“状态更新”；LangGraph 再根据每个字段对应的 **Reducer（规约函数）**，把这份更新合并回全局 State。

所以在入门阶段，最值得先记住的是这句话：

**State = Schema（模式） + Reducer（规约函数）**

- **Schema** 负责定义“状态里有哪些字段、每个字段是什么类型”；放到本章语境里，主要指的就是 **State Schema**。
- **Reducer** 负责定义“某个节点返回了这个字段的新值时，应该怎么和旧状态合并”。

如果没有统一 State，节点之间就很容易退回到“你手动从 A 函数拿一堆返回值，再自己拼给 B 函数”的写法，流程一复杂就会乱。LangGraph 把 State 放在中心位置，本质上是在帮你建立一个**单一事实来源（Single Source of Truth）**：所有节点都围着同一份状态读写，而不是各自维护一套容易打架的私有数据。

接下来这部分可以按两层去学：

- 先看 **State Schema**：状态里到底有哪些字段、字段类型是什么；
- 再看 **Reducer**：节点返回了字段更新后，这些更新最终怎么合并回 State。

### 2.2 案例：用最小 State 例子理解“进图、出图、原样透传”

这个案例故意不写任何业务节点，只连了一条 `START → END` 的边，用来验证一件事：**`invoke(initial_state)` 传进去的就是 State 的初始值，如果中间没有节点更新它，最终就会原样返回。**

这个案例很适合先建立两个基础直觉：

- `TypedDict` 不是业务逻辑，而是在声明“这张图的状态长什么样”。
- `invoke()` 的核心输入是一整个状态字典，不是给每个字段单独传一堆位置参数。

【案例源码】`案例与源码-3-LangGraph框架/03-state/DefState.py`

[DefState.py](案例与源码-3-LangGraph框架/03-state/DefState.py ":include :type=code")

### 2.3 State Schema 怎么选

根据 LangGraph 官方 Graph API 文档，State Schema 常见可以用 **TypedDict**、**Pydantic BaseModel**，也可以用 **dataclass**。本仓库主线案例主要用 `TypedDict`，因为它轻量、直接，和“状态就是一份 dict 快照”这件事最贴近。

| State Schema 写法      | 可以先怎么理解                   | 优点                                             | 更适合的场景                                     |
| ---------------------- | -------------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| **TypedDict**          | 带类型标注的字典结构             | 轻量、写法简单、性能开销低、很适合教学和流程状态 | 大多数 LangGraph 状态建模起步场景                |
| **Pydantic BaseModel** | 带运行时校验和字段约束的数据模型 | 能做更强的数据校验、默认值、嵌套模型、字段说明   | 对外接口更严格、数据结构更复杂、希望失败尽早暴露 |
| **dataclass**          | Python 数据类                    | 适合需要默认值、字段写起来更像对象属性的场景     | 需要默认值，但不想引入 Pydantic 校验成本         |

**怎么选更贴近真实项目？**

- 如果你还在设计工作流主线，优先用 **TypedDict**，因为它最轻，改起来也快。
- 如果这张图已经要作为稳定服务对外暴露，且输入输出字段必须强校验，可以考虑把边界层做成 **Pydantic**。
- 如果只是想给 State 字段加默认值，**dataclass** 也可以考虑。
- 不要为了“显得更工程化”一上来把所有内部状态都做成复杂嵌套模型。LangGraph 状态最怕的不是“不够高级”，而是“字段太多、边界不清、谁在改什么看不出来”。

### 2.4 State 不只有一种 Schema：state_schema、input_schema、output_schema

很多人第一次看 `StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)` 会有点懵：既然已经有 `OverallState` 了，为什么还要额外写 `input_schema` 和 `output_schema`？

原因是：**图内部真正维护的完整状态，和这张图对外暴露的输入输出接口，不一定是一回事。**

| 名称              | 作用                                          | 直观理解方式                                         |
| ----------------- | --------------------------------------------- | ---------------------------------------------------- |
| **state_schema**  | 定义图内部完整状态空间，节点通常围绕它读写    | “图内部完整工作台上有哪些数据”                       |
| **input_schema**  | 限制调用方 `invoke(...)` 进图时允许传哪些字段 | “外部用户进门时只能带什么材料”                       |
| **output_schema** | 限制图执行结束后最终对外返回哪些字段          | “最终只把哪些结果交给调用方，不把内部草稿全暴露出去” |

这里可以顺手把术语关系记成一条线：

- **Schema** 是总称，表示“数据结构的定义方式”
- **State Schema** 是本章最核心的 Schema，专门描述图内部状态
- `state_schema`、`input_schema`、`output_schema` 是代码层面的具体参数名

如果不显式指定 `input_schema` 和 `output_schema`，默认通常就和 `state_schema` 一致；但一旦这张图要变成一个对外服务接口，**把“内部状态”和“外部契约”拆开，会比直接把整个 State 暴露出去更稳。**

这里再补充一个很实用的工程理解：`state_schema` 规定的是图的完整状态空间，不代表每个节点都必须读写的字段一样多。真实项目里，某个节点往往只关心很少几键（例如检索节点主要读 `query`，汇总节点主要读 `rag_result` / `web_search_result`）。**运行时**节点仍会收到当前完整 state（dict），但你可以在**类型标注**上用更小的 `TypedDict`、或只注解为 `dict` 并在文档/命名上约定“本节点只使用某几键”，让依赖关系可读、重构时好判断影响面。

### 2.5 案例：用 input_schema / output_schema 收紧图的对外接口

这个案例就是在演示 2.4 这件事：**调用方只需要传 `question`，最终只拿到 `answer`；至于图内部是不是还保留了别的字段，那是内部实现细节，不一定要暴露出去。**

**这个案例重点看什么：**

- `InputState`、`OutputState`、`OverallState` 三个 schema 是怎么分层的。
- `StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)` 这行代码到底在声明什么。
- 为什么 `answer_node(state)` 虽然只依赖 `question`，但返回时可以同时返回 `{"answer": ..., "question": ...}`；最后对外结果仍然只剩 `{"answer": ...}`，因为出图前会按 `output_schema` 过滤。
- 这种写法很适合真实项目里的“**内部状态很多，但服务 API 只想暴露少数字段**”场景。

【案例源码】`案例与源码-3-LangGraph框架/03-state/schema/StateSchema.py`

[StateSchema.py](案例与源码-3-LangGraph框架/03-state/schema/StateSchema.py ":include :type=code")

学完 `State Schema` 和 `input_schema / output_schema` 之后，State 的“字段长什么样”这一半就比较清楚了。接下来要补上的，就是另一半：**字段更新时到底怎么合并。** 这正是 Reducer 负责的事。

## 3、State 的更新机制：Reducer（规约函数）

这里把 Reducer 单独提成一个二级标题，不是说它脱离了 State，而是为了让结构更清楚。概念上它仍然属于 State，只是值得单独展开。你可以把前后关系理解成：

- `Graph` 负责描述流程结构
- `State` 负责描述共享数据
- `Schema` 负责描述 State 里有哪些字段
- `Reducer` 负责描述这些字段更新时怎么合并

也可以把它记成一句更顺的话：**Schema 决定字段长什么样，Reducer 决定字段更新时怎么合并。**

### 3.1 定义

前面已经说过，节点一般只返回“局部状态更新”，那这些更新到底怎么和旧状态合并？答案就是 **Reducer（规约函数）**。

对某个 State 字段来说，Reducer 本质上就是一个“**旧值 + 新增更新 → 合并后新值**”的函数。不同字段可以有不同 Reducer；如果某个字段没有显式指定 Reducer，LangGraph 默认就按**覆盖更新**处理，也就是节点返回的新值直接替换这个字段原来的旧值。

在 `TypedDict` 里，指定 Reducer 的常见写法是 `Annotated[字段类型, reducer函数]`，例如：

```python
import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages


class MyState(TypedDict):
    messages: Annotated[list, add_messages]
    tags: Annotated[list[str], operator.add]
    count: Annotated[int, operator.add]
    latest_answer: str
```

这段定义可以这样理解：

- `messages` 用 `add_messages` 合并，适合聊天历史这种“新增消息追加到列表里”的场景。
- `tags` 和 `count` 用 `operator.add`，分别表示列表拼接和数值累加。
- `latest_answer` 没写 Reducer，所以默认覆盖，后写入的新答案会替换旧答案。

### 3.2 案例一：默认覆盖更新

如果一个字段没有写 `Annotated[..., reducer]`，默认就是**覆盖更新**。这个行为本身没问题，反而非常适合“这个字段永远只关心最新值”的场景，比如 `current_step`、`latest_answer`、`final_summary`。

这个案例里，`node1` 先把 `foo` 改成 `22`，`node2` 再把 `bar` 改成新列表。因为 `foo`、`bar` 都没声明特殊 Reducer，所以它们都是按默认覆盖规则更新。

【案例源码】`案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_Default.py`

[StateReducer_Default.py](案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_Default.py ":include :type=code")

### 3.3 案例二：add_messages 追加消息列表

如果你把对话历史存在 `messages` 字段里，通常不希望每个节点一返回新消息就把整段历史覆盖掉，而是希望**把新消息追加到旧消息后面**。这时就适合用 `add_messages`。

和普通 `operator.add` 相比，`add_messages` 更适合聊天消息场景，因为它不仅会追加新消息，还能根据 **message id** 更新已有消息，并且会把输入里的消息数据反序列化成 LangChain 的 `Message` 对象。官方 `add_messages` 文档也明确说明：它会合并两组 messages，如果消息 ID 相同就更新旧消息；如果是新消息，就追加到列表后面。

【案例源码】`案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_AddMessages.py`

[StateReducer_AddMessages.py](案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_AddMessages.py ":include :type=code")

这个案例还有一个细节很值得记住：调用 `graph.invoke(...)` 时，`messages` 里既可以传 `HumanMessage(...)` 这种对象，也可以传 `{"role": "...", "content": "..."}` 这类字典格式；如果 State 上用了 `add_messages`，运行时会尽量把它们转换成 LangChain Message 对象。因此，在节点里读正文时，通常应该用 `state["messages"][-1].content`，而不是把最后一条消息当普通字符串。

### 3.4 案例三：operator.add 用在列表、字符串、数值上

`operator.add` 是一个很常见的内置合并策略，但它对不同数据类型的语义不一样：

- 对 **列表** 来说，是列表拼接，效果类似 `current + update`。
- 对 **字符串** 来说，是字符串连接。
- 对 **数值** 来说，是数值相加。

这意味着 `operator.add` 很适合下面这些业务场景：

- 多个节点各自产生一批标签、文档片段、候选结果，最后合并成一个列表。
- 多个节点依次生成文案片段，最后拼成完整文本。
- 多个节点分别贡献分数、计数、成本增量，最后累加出总值。

**列表追加案例：**

【案例源码】`案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_OperatorAdd.py`

[StateReducer_OperatorAdd.py](案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_OperatorAdd.py ":include :type=code")

**字符串连接案例：**

【案例源码】`案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_OperatorAdd2.py`

[StateReducer_OperatorAdd2.py](案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_OperatorAdd2.py ":include :type=code")

**数值累加案例：**

【案例源码】`案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_OperatorAdd3.py`

[StateReducer_OperatorAdd3.py](案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_OperatorAdd3.py ":include :type=code")

### 3.5 案例四：operator.mul 为什么容易踩坑

这个案例建议你不要只看“代码能不能跑”，而要重点理解**为什么结果会变成 0.0**。原因在于：对带 Reducer 的字段来说，LangGraph 合并更新时会有“旧值”和“新值”的规约过程；当字段类型是 `float` 且用 `operator.mul` 做乘法规约时，如果初始阶段参与规约的旧值是 `0.0`，那第一次就会变成 `0.0 * update = 0.0`，后面再乘什么都还是 0.0。

所以这个案例真正想提醒你的不是“`operator.mul` 永远不能用”，而是：**乘法这类对单位元敏感的规约逻辑，不能只看 reducer 函数本身，还要认真处理初始值和首次合并边界。** 在真实项目里，如果这类边界不好直接靠内置函数表达，就应该写自定义 Reducer。

【案例源码】`案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_OperatorMul.py`

[StateReducer_OperatorMul.py](案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_OperatorMul.py ":include :type=code")

### 3.6 案例五：自定义 Reducer

当默认覆盖、`add_messages`、`operator.add` 这些现成策略都不够用时，就可以自定义 Reducer。自定义 Reducer 的核心不是“写法有多复杂”，而是把这个签名记住：

```python
def my_reducer(current_value, update_value):
    return merged_value
```

也就是说，**Reducer 拿到的是当前旧值和本次节点更新值，返回的是合并后的新值。**

这个案例用 `MyOperatorMul(current, update)` 专门处理乘法第一次规约时 `current == 0.0` 的问题：如果判断这是第一次合并，就把它当作从乘法单位元 `1.0` 开始；否则正常做 `current * update`。

【案例源码】`案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_Custom.py`

[StateReducer_Custom.py](案例与源码-3-LangGraph框架/03-state/reducers/StateReducer_Custom.py ":include :type=code")

### 3.7 案例六：同一个 State 里可以给不同字段配置不同合并策略

真实业务里的状态通常不会只有一个字段。更常见的情况是：**聊天消息要追加，标签列表要拼接，评分要累加，最新结论要覆盖。** 这就意味着同一个 State 里，不同字段本来就应该有不同 Reducer。

这个案例把三种策略放在了一起：

- `messages: Annotated[List, add_messages]`：对话消息追加合并。
- `tags: Annotated[List[str], operator.add]`：标签列表拼接。
- `score: Annotated[float, operator.add]`：数值分数累加。

同时它还演示了一个很有实际价值的结构：**从 `START` 同时连到多个节点，让多个分支分别产出不同状态更新，最后由各字段自己的 Reducer 负责合并。** 这正是后面学习并行分支、复杂 Agent 图时很重要的基础。

【案例源码】`案例与源码-3-LangGraph框架/03-state/reducers/StateReducersMyChatBot.py`

[StateReducersMyChatBot.py](案例与源码-3-LangGraph框架/03-state/reducers/StateReducersMyChatBot.py ":include :type=code")

### 3.8 Reducer 怎么选，才更贴近真实项目

学完这些案例后，最重要的不是“背住每个 Reducer 名字”，而是能根据业务字段语义选对合并方式。

| 业务字段类型                                         | 更适合的 Reducer                      | 典型例子                                             |
| ---------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| 只关心最新结果                                       | 默认覆盖                              | `latest_answer`、`current_route`、`final_summary`    |
| 聊天消息历史                                         | `add_messages`                        | `messages`、Agent 轨迹、人工修正后的消息状态         |
| 候选列表 / 标签列表 / 文档片段列表                   | `operator.add` 或自定义去重版 Reducer | `retrieved_docs`、`tags`、`candidate_items`          |
| 计数 / 分数 / token 成本累计                         | `operator.add`                        | `retry_count`、`total_score`、`token_cost`           |
| 乘积、最大值、去重合并、按时间戳保留最新值等特殊逻辑 | 自定义 Reducer                        | 风险分数聚合、按 ID 合并对象列表、保留优先级最高结果 |

**几个实践建议：**

- **不要把所有字段都默认覆盖，也不要把所有列表都无脑 `operator.add`。** 先问清楚这个字段的业务语义：是“最新值”，还是“历史累积”，还是“需要按 ID 合并”。
- **消息历史优先考虑 `add_messages`，而不是普通列表相加。** 因为聊天消息往往涉及消息对象格式转换、按 ID 更新旧消息、人机介入修正等问题。
- **自定义 Reducer 里一定要认真处理首次合并、空值、重复值、顺序稳定性这些边界。** 很多状态 bug 不是节点逻辑错了，而是 Reducer 合并规则没设计清楚。
- **State 字段不要无限膨胀。** 如果一个字段只是临时中间变量，而且后续节点根本不再用，不一定非要长期留在全局 State 里；否则图运行久了，状态会越来越难读。

还有一个经常被忽略、但在真实项目里很重要的点：**State 不只是“一次 `invoke()` 里的临时变量”**。
当后面你开始学习 `checkpointer`、`thread_id`、状态历史、故障恢复时，就会发现 LangGraph 的 State 其实还承担着“可持久化工作流上下文”的角色。也就是说：

- 同一个 `thread_id` 下，多次调用可以继续沿用同一份状态上下文；
- 图执行中途报错时，只要状态已经被持久化，就有机会从上一次检查点恢复；
- `get_state()` / `get_state_history()` 这类能力，本质上也是围绕 State 快照展开的。

这一层内容在本章先建立概念就够了，完整展开会放到后面的高级特性章节；你现在只需要先记住：**State 既是图运行时的共享数据结构，也是后续持久化、短期记忆和故障恢复的基础。**

---

**章节思考题：**

1. 为什么说 State 是 LangGraph 的中心数据结构，而不只是普通参数容器？

   **答案：** 因为 State 不只是把几个参数装在一起，它决定了图里每个节点读什么、写什么、哪些信息会被后续节点继承，以及冲突时如何合并。它实际上是整张图的数据契约中心。

2. `state_schema`、`input_schema`、`output_schema` 三者为什么要分开设计？

   **答案：** 因为输入、内部运行状态和最终输出面向的是不同对象：`input_schema` 约束外部调用者传什么，`state_schema` 管内部流转和累计，`output_schema` 决定最终对外暴露什么。分开设计能让图更稳定，也更容易演进。

3. Reducer 真正决定的是什么，为什么它和字段业务语义强相关？

   **答案：** Reducer 决定的是同一个字段在多次更新或并行汇合时如何合并，比如覆盖、追加还是自定义合并。它之所以和业务语义强相关，是因为“消息列表要追加”和“状态标记要覆盖”显然不是同一种合并规则。

4. 如果你要为一个“多轮处理 + 中间状态累计 + 最终汇总输出”的图设计状态，你会如何划分字段和 Reducer？

   **答案：** 我会把状态分成三类：输入类字段放原始请求，过程类字段放中间分类结果、检索片段、执行日志，输出类字段放最终结论；其中消息列表、候选结果这类可累计字段配追加型 Reducer，阶段标记、最终答案这类单值字段用覆盖型 Reducer。

5. 当图越来越复杂时，你会如何判断哪些字段应该只留在内部 State，哪些字段才应该暴露到输入输出契约？

   **答案：** 判断标准是：只为图内部协作服务、对外不需要暴露的字段就留在内部 State，比如调试日志、中间候选集；只有外部调用者真正要传入或拿走的字段，才放到输入输出契约里。这样可以减少耦合，也让接口更稳定。

**本章小结：**

- **Graph** 是可执行的有向工作流结构，`StateGraph` 负责构建图，`START` / `END` 定义入口出口，`compile()` 把构建器变成可运行图，`invoke()` 负责执行。
- **State 是 LangGraph 的中心数据结构**，不是普通“函数参数传来传去”的替代品，而是整张图的共享状态快照和单一事实来源。
- **State = Schema + Reducer**：Schema 定义字段结构，Reducer 定义字段更新怎么和旧状态合并；把两者放在一起看，才是完整的 State 设计。
- **`state_schema`、`input_schema`、`output_schema` 要分清楚**：内部完整状态是一回事，对外输入输出契约是另一回事。
- **Reducer 选择要跟业务语义对齐**：默认覆盖适合最新值，`add_messages` 适合消息历史，`operator.add` 适合拼接/累加，自定义 Reducer 适合更复杂的合并规则。
- 从掌握结果看，学完本章后，你至少应该：能说清 **Graph、State、Schema、Reducer** 四层关系，知道它们不是同一层东西；知道 `state_schema`、`input_schema`、`output_schema` 各自负责什么边界；能根据字段语义选择默认覆盖、`add_messages`、`operator.add` 或自定义 Reducer。

**建议下一步：** 先按顺序跑一遍 `BuildWholeGraphSummary.py`、`DefState.py`、`StateSchema.py` 和 `03-state/reducers` 目录下所有 Reducer 案例，然后自己做两个小练习：把 `BuildWholeGraphSummary.py` 的 `process_data` 改成用 `operator.add` 追加历史记录；把 `StateReducersMyChatBot.py` 再加一个 `latest_summary` 字段，用默认覆盖保存最新摘要。做完后进入 [第 24 章 - LangGraph API：节点、边与进阶](24-LangGraphAPI：节点、边与进阶.md)，继续学习节点、普通边、条件边和 `Command` / `Send` / `Runtime`。
