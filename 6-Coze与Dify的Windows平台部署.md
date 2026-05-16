# 6 - Coze 与 Dify 的 Windows 平台部署

本章偏**实操部署**：在 Windows 上把常见低代码智能体平台跑起来。我们先完成 Docker Desktop 这类公共环境准备，再分别部署 **Coze Studio** 和 **Dify**；最后补充 **Coze Loop（扣子罗盘）**，用于提示词评测、实验对比和运行追踪。

---

**本章课程目标：**

- 理解 Coze 开源后，为什么它在私有化、B 端交付、内网场景里有现实价值。
- 分清三个部署对象：**Coze Studio** 负责开发与调试，**Dify** 负责工作流、知识库和应用发布，**Coze Loop** 负责评测、实验、Trace 和运维。
- 完成 **Coze Studio** 在 Windows 上的最小部署：Docker 环境 -> 获取代码 -> 配置模型 -> `docker compose` 启动 -> 浏览器访问。
- 完成 **Dify** 在 Windows 上的最小部署：Docker 环境 -> 获取代码 -> 配置 `.env` -> `docker compose up -d` -> 浏览器访问。
- 理解两条常见模型接入路线：**云端 API 模型** 与 **本地 Ollama 模型**，知道它们分别适合什么场景。

**学习建议：** 第一次学习时，建议按第 2 节先把 Docker Desktop 装好。想体验 Coze，就看第 3 节；想体验 Dify，就看第 4 节；Coze Loop 属于进阶能力，可以等 Studio 跑通后再看第 5 节。Coze 的模型配置是核心：选火山方舟，需要创建 API Key 和 Endpoint；选 Ollama，需要先安装 Ollama 并拉取本地模型。

---

## 1、整体概述

### 1.1 为什么要关注本地部署

在云端平台上搭建智能体很方便，但企业项目往往还会关心三件事：

- **数据边界**：业务数据是否必须留在内网或企业自有环境中。
- **交付方式**：是否需要把平台、模型和业务系统一起交付给客户。
- **运维可控性**：是否能自己控制版本、日志、网络和资源。

Coze 开源后，本地部署多了一条选择。以前很多 B 端交付会优先考虑 Dify、n8n 等可私有化部署的平台；现在如果团队已经熟悉 Coze 的智能体、插件和工作流体系，也可以把开源版 Coze 纳入技术选型。

从学习和交付角度看，开源版 Coze 的吸引力主要在三点：

- **许可友好**：采用 Apache 2.0 协议，便于商用和二次开发。
- **链路更完整**：覆盖 Agent 开发、评测运维和部署相关能力。
- **硬件门槛较低**：普通电脑也能完成最小体验，不一定要从高规格 GPU 服务器起步。

这里不必把它理解成“谁替代谁”。更合适的理解是：**云端平台适合快速验证，本地部署适合安全、集成和交付要求更高的场景。**

### 1.2 本章通用部署主线

不管部署的是 Coze Studio、Dify，还是 Coze Loop，第一次跑通时都围绕同一条主线：

| 阶段          | 要完成的事                      | 容易出错的地方                             |
| ------------- | ------------------------------- | ------------------------------------------ |
| 1. 环境准备   | 安装 Docker，必要时安装 Git、Go | Docker 未启动、网络代理或镜像源不可用      |
| 2. 获取代码   | 下载或克隆官方仓库              | GitHub 慢、目录层级找错                    |
| 3. 修改配置   | 配置模型、端口或 `.env`         | API Key、Endpoint、端口、文件位置写错      |
| 4. 启动服务   | 执行 Docker Compose 命令        | 没在正确目录执行、镜像拉取失败、端口被占用 |
| 5. 浏览器验证 | 打开本地地址并完成初始化        | 页面能打开但模型不可用，或服务未完全启动   |

本章后面的步骤都会沿着这条线展开。只要这条线顺了，部署类问题就会好排查很多。

### 1.4 云端模型和本地模型怎么选

模型配置是本章真正的核心。Docker 跑起来只是第一步，模型接通后，平台才真的能创建和运行智能体。

| 配置方式         | 优点                                 | 缺点                                             | 更适合谁                           |
| ---------------- | ------------------------------------ | ------------------------------------------------ | ---------------------------------- |
| 云端 API 模型    | 能力强、响应快、配置相对直接         | 需要联网，通常有调用成本，数据会经过云端服务商   | 学习、测试、快速验证               |
| 本地 Ollama 模型 | 数据更可控，离线可用，不依赖外部 API | 对本机硬件要求更高，模型能力和速度取决于本地资源 | 内网、隐私敏感、想完全掌控模型的人 |

如果目标是尽快跑通流程，优先选择云端 API；如果更在意私有化和数据可控，再考虑 Ollama。

> **关键提醒：** 如果页面能打开，但看不到模型、调不了应用，优先检查模型配置文件里的 `api_key`、`model`、`endpoint`，以及本地 Ollama 服务是否正常，而不是一上来就怀疑前端页面。

## 2、公共环境：Docker Desktop 安装与网络配置

### 2.1 安装 Docker Desktop（环境准备）

**Docker Desktop 是本章的公共前置条件。** Coze Studio、Dify 和 Coze Loop 都会通过 Docker / Docker Compose 启动一组服务，而不是只运行一个单独程序。

如果你对镜像、容器、Compose、volume、端口映射这些概念还不熟，可以先看 [第 8 章 Docker 入门与 Dify 部署常见问题](8-Docker入门与Dify部署常见问题.md)。本章只保留部署必需步骤。

### 2.2 下载 Docker Desktop

- Docker 官网下载地址：https://www.docker.com/products/docker-desktop/

![Docker Desktop 官方下载页面](images/6/6-2-2-1.png)

### 2.3 安装并启动 Docker Desktop

安装时按提示完成即可。

![Docker Desktop 安装设置界面](images/6/6-2-3-1.png)

安装完成后打开 Docker Desktop，确认状态栏显示 **Running**。

![Docker Desktop 成功启动后的主界面](images/6/6-2-3-2.png)

> 个别首次安装的同学会被 Windows 系统提示需要安装`适用于Linux的Windows子系统`。这里选择确认安装。稍等片刻后会完成安装。

### 2.4 处理镜像拉取慢的问题

默认镜像源在国外，国内网络环境下可能会出现访问慢、拉取失败等情况。部署前建议先确认 Docker 代理或镜像加速器配置。

本章不展开 Docker 网络排障，遇到问题时优先参考：[第 8 章 - 网络慢或镜像拉取失败](8-Docker入门与Dify部署常见问题.md#_12、网络慢或镜像拉取失败)。

## 3、Coze Studio 的安装和配置

![Coze Studio 本地部署四阶段流程总览图](images/6/6-3-0-1.png)

### 3.1 获取 Coze Studio 项目

Coze Studio 可以通过 Git 克隆，也可以直接下载 ZIP 包。两种方式选一种即可。

```bash
git clone https://github.com/coze-dev/coze-studio.git
```

在 Docker Desktop 终端中执行：

![在 Docker Desktop 终端中克隆 Coze Studio 仓库的界面](images/6/6-3-1-1.png)

> 如果本机还没有安装 Git，可从 https://git-scm.com/downloads 下载并安装。安装完成后重新打开终端，再执行 `git clone`。

### 3.2 配置模型

首次启动 Coze Studio 开源版之前，需要先配置模型服务。否则即使页面能打开，创建 Agent 或工作流时也无法选择可用模型。

进入 `coze-studio` 根目录，在地址栏输入 `cmd` 并按回车：

![在 Coze Studio 根目录地址栏输入 cmd 的界面](images/6/6-3-2-1.png)

先复制火山方舟豆包模型的模板文件：

```bash
copy backend\conf\model\template\model_template_ark_doubao-seed-1.6.yaml backend\conf\model\ark_doubao-seed-1.6.yaml
```

配置文件里关键的是三个字段：

| 字段                       | 说明                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `id`                       | Coze Studio 中的模型 ID，由开发者自定义，必须是非零整数且全局唯一 |
| `meta.conn_config.api_key` | 在线模型服务的 API Key                                            |
| `meta.conn_config.model`   | 在线模型服务的模型 ID；以火山方舟为例，这里填写 Endpoint ID       |

> 模型上线后不要随意修改 `id`。如果只是学习测试，可以先按示例给一个 5 位以上纯数字。

#### 3.2.1 方案一：云端 API 模型（以火山方舟为例）

云端 API 路线适合先把平台功能跑通。它不消耗本地推理资源，但需要联网，并且通常会产生调用费用。

**第一步：创建 API Key**

进入火山引擎官网 https://www.volcengine.com ，打开控制台。

![火山引擎控制台首页界面](images/6/6-3-2-2.png)

搜索并进入“火山方舟”，在“API Key 管理”中点击“创建 API Key”。

![火山方舟创建 API Key 的界面](images/6/6-3-2-3.png)

点击小眼睛查看 API Key，并复制备用。

![火山方舟查看 API Key 的界面](images/6/6-3-2-4.png)

**第二步：创建 Endpoint**

进入“在线推理”页面，选择“自定义推理接入点”，点击“创建推理接入点”。

![火山方舟创建推理接入点的界面](images/6/6-3-2-5.png)

输入接入点名称，建议按模型命名，然后点击“添加模型”。

![火山方舟设置推理接入点名称并添加模型的界面](images/6/6-3-2-6.png)

模型可选择豆包、DeepSeek、Kimi、Qwen 等。这里以豆包 1.6 为例。

![火山方舟选择豆包模型接入点的界面](images/6/6-3-2-7.png)

也可以从下面这个入口添加模型：

![火山方舟添加模型的备选入口界面](images/6/6-3-2-8.png)

勾选协议，点击“开通模型并接入”。

![火山方舟勾选协议并开通模型接入的界面](images/6/6-3-2-9.png)

如果是首次开通模型，平台可能会要求实名认证，按页面提示完成即可。

创建完成后复制 Endpoint ID。注意：模型名称下方的 ID 就是后面要填入配置文件的 Endpoint。

![火山方舟复制 Endpoint ID 的界面](images/6/6-3-2-10.png)

**第三步：写入 Coze Studio 配置文件**

打开前面复制出来的 `backend\conf\model\ark_doubao-seed-1.6.yaml`。

先把 `id` 改成任意 5 位以上纯数字。

![编辑 Coze Studio 模型配置文件的界面](images/6/6-3-2-11.png)

再把 API Key 和 Endpoint 写入对应位置，保存并关闭文件。

![在 Coze Studio 模型配置文件中填写 API Key 和 Endpoint 的界面](images/6/6-3-2-12.png)

#### 3.2.2 方案二：本地 Ollama 模型

Ollama 路线适合更关注私有化、离线可用和数据可控的场景。不过它对本机硬件要求更高，模型速度和效果也取决于你拉取的模型以及电脑资源。

先在本机安装 Ollama，并拉取一个模型，例如：

```bash
ollama pull qwen2.5:7b
```

![本地安装 Ollama 并准备拉取模型的界面](images/6/6-3-2-13.png)

然后在 Coze Studio 项目中找到 Ollama 模型配置模板 `model_template_ollama.yaml`，复制并重命名为 `model_ollama.yaml`，放到 `backend/conf/model/` 目录下。

![复制 Ollama 模型配置模板文件的界面](images/6/6-3-2-14.png)

修改配置文件中的：

- `base_url`：通常填写 `http://host.docker.internal:11434`
- `model`：填写你通过 Ollama 拉取的模型名，例如 `qwen2.5:7b`

![修改 Ollama 模型配置文件 base_url 和 model 的界面](images/6/6-3-2-15.png)

### 3.3 启动 Coze Studio

模型配置完成后，进入项目中的 `docker` 目录。

![Coze Studio 项目中 docker 目录位置的界面](images/6/6-3-3-1.png)

先在终端输入 `docker` 并回车。如果能看到类似帮助信息，说明 Docker 命令可用。

![在终端中验证 Docker 是否安装成功的界面](images/6/6-3-3-2.png)

接着复制环境配置文件：

```bash
copy .env.example .env
```

> Windows 下使用 `copy`；Linux / macOS 下可使用 `cp .env.example .env`。

![将 Coze Studio 的 .env.example 复制为 .env 的界面](images/6/6-3-3-3.jpeg)

在 `coze-studio\docker` 目录中执行：

```bash
docker compose --profile '*' up -d
```

![在 Docker 中启动 Coze Studio 的命令行界面](images/6/6-3-3-4.png)

这条命令会通过 Compose 启用所有 profile，并在后台启动服务。`docker compose up -d` 的通用含义见 [第 8 章](8-Docker入门与Dify部署常见问题.md#_3、compose-到底做了什么)。

首次启动可能需要 5-10 分钟，具体取决于网络和镜像拉取速度。看到类似下面的结果，说明服务已经启动。

![Coze Studio 启动成功后的日志界面](images/6/6-3-3-5.png)

启动后查看运行状态：

```bash
docker compose ps
```

也可以打开 Docker Desktop，在容器列表中确认相关服务是否处于运行状态。

![查看 Coze Studio 容器运行状态的界面](images/6/6-3-3-6.png)

### 3.4 访问 Coze Studio

浏览器访问：

```text
http://localhost:8888/
```

![浏览器访问 Coze Studio 时的登录界面](images/6/6-3-4-1.png)

登录后即可进入 Coze Studio 主界面。

![登录后的 Coze Studio 主界面](images/6/6-3-4-2.png)

开源版的功能与商业版不完全一致，学习时重点关注：能否登录、能否看到模型、能否创建 Agent 或工作流。

## 4、Dify 的安装和启动

Dify 的 Windows 本地部署比 Coze Studio 更直接。它不需要先在代码里配置模型文件，核心流程就是：**获取项目 -> 进入 `docker` 目录 -> 复制 `.env` -> 启动 Compose -> 浏览器访问**。

本节只讲最小部署流程。Docker 通用概念、镜像拉取失败、容器状态异常、数据位置、备份升级和数据库连接，统一放在 [第 8 章 Docker 入门与 Dify 部署常见问题](8-Docker入门与Dify部署常见问题.md)。

### 4.1 部署前准备

Windows 本地部署 Dify，核心依赖只有两个：

- **Docker Desktop**：前面第 2 节已经安装完成。
- **Dify 项目代码**：后续真正操作的是仓库里的 `docker` 目录。

Dify 不是单一程序，而是一整套协同服务。启动后通常会包含 Web 前端、API 服务、Worker、数据库、Redis、向量数据库等容器。

### 4.2 获取 Dify 项目

GitHub 地址：https://github.com/langgenius/Dify

> **注意：** 后面真正操作的目录，不是仓库根目录，而是仓库里的 `docker` 目录。

### 4.3 复制 .env.example 为 .env

官方 Docker Compose 部署文档也会要求先准备 `.env`：

https://docs.dify.ai/zh-hans/getting-started/install-self-hosted/docker-compose

进入 Dify 仓库下的 `docker` 目录，将 `.env.example` 复制并就和 Dify 云平台基本一致了重命名为 `.env`。

然后按需修改 `.env` 中的配置，例如端口。

![修改 Dify .env 端口配置的界面](images/6/6-4-3-1.png)

第一次部署最常改的是端口。如果本机 `80` 端口被其他程序占用，可以改成 `8100`、`8080` 或其他未被占用端口。

可以把 `.env` 理解为这套部署环境的运行参数表。Docker / Compose / 数据卷的关系，以及 Dify 场景下的排障方式，见 [第 8 章](8-Docker入门与Dify部署常见问题.md)。

### 4.4 启动 Dify

以下操作可在 Windows 命令行、PowerShell 或 Docker Desktop 自带终端里完成。

进入 Dify 仓库下的 `docker` 目录：

![在终端中进入 Dify docker 目录的界面](images/6/6-4-4-1.png)

执行：

```bash
docker compose up -d
```

![执行 docker compose up -d 启动 Dify 的界面](images/6/6-4-4-2.png)

首次启动时，它会自动拉取镜像、创建容器并初始化服务，这个过程可能比较慢。

安装完成后：

![Dify 首次安装完成后的命令行界面](images/6/6-4-4-3.png)

后续再次执行 `docker compose up -d`，通常就是启动已有服务。

也可以在 Docker Desktop 的 Containers 页面查看当前运行的容器。

![Docker Desktop 中查看 Dify 容器运行状态的界面](images/6/6-4-4-4.png)

### 4.5 浏览器访问 Dify

浏览器访问：

- 默认端口：`http://localhost`
- 如果你把端口改成了 `8100`：`http://localhost:8100`

首次访问需要设置管理员用户名与密码。

![Dify 首次访问时设置管理员账户的界面](images/6/6-4-5-1.png)

进入后，本地版的使用方式就和 Dify 云平台基本一致了。

## 5、Coze Loop（扣子罗盘）指南

### 5.1 Coze Loop 解决什么问题

![Coze Loop 产品介绍界面](images/6/6-5-1-1.png)

Coze Loop 更偏“效果管理”和“运行观测”。它可以帮助开发者做 Prompt 调试、评测集管理、实验对比、Trace 追踪和自动化评测。

如果说 Coze Studio 解决的是“把智能体做出来”，那么 Coze Loop 解决的是“上线前后怎么评估、追踪和持续优化”。因此它不是第一天必须安装，但在真实项目里很有价值。

### 5.2 部署前准备

安装 Coze Loop 开源版前，请确认以下环境：

**1. Go 语言环境**

需要安装 Go SDK，版本为 1.23.4 及以上。安装后配置 GOPATH，并将 `${GOPATH}/bin` 加入系统环境变量 PATH，方便系统找到 Go 安装的二进制工具。

Go 语言官网：https://go.dev/dl/

![Go 语言官网下载页面](images/6/6-5-2-1.png)

下载完成后双击运行安装程序。

![Go 安装程序启动界面](images/6/6-5-2-2.png)

按提示一路点击“Next”即可。

安装完成后，确保 Go 安装目录下的 `bin` 目录，或 `GOPATH/bin`，已加入环境变量 PATH。

![Go 安装完成后的环境变量配置示意图](images/6/6-5-2-3.png)

**2. Docker 环境**

提前安装 Docker、Docker Compose，并启动 Docker 服务。

**3. 模型服务**

准备 OpenAI、火山方舟等在线模型服务。后面需要在配置文件中填写 API Key 和模型 ID。

### 5.3 获取 Coze Loop 项目

```bash
git clone https://gitee.com/shkstart/coze-loop.git
```

![通过 Gitee 克隆 Coze Loop 仓库的界面](images/6/6-5-3-1.png)

### 5.4 配置模型与端口

编辑下面这个文件：

```text
coze-loop-main\release\deployment\docker-compose\conf\model_config.yaml
```

以火山方舟为例，需要修改：

- `api_key`：火山方舟 API Key，可参考前面 Coze Studio 的创建方式。
- `model`：火山方舟模型接入点的 Endpoint ID。

![配置 Coze Loop model_config.yaml 的界面](images/6/6-5-4-1.png)

接着打开：

```text
coze-loop-main\release\deployment\docker-compose\.env
```

将 `COZE_LOOP_APP_OPENAPI_PORT` 改为 `8889` 或其他未被占用端口。

![修改 Coze Loop .env 端口配置的界面](images/6/6-5-4-2.png)

再打开同目录下的 `docker-compose.yml`，确认引用 `${COZE_LOOP_APP_OPENAPI_PORT}` 的端口与 `.env` 中保持一致。

![修改 Coze Loop docker-compose 端口映射的界面](images/6/6-5-4-3.png)

### 5.5 启动并访问 Coze Loop

进入：

```text
coze-loop-main\release\deployment\docker-compose
```

执行：

```cmd
docker compose -f docker-compose.yml --env-file .env --profile "*" up -d
```

如果希望在前台查看完整日志，可去掉 `-d`。首次启动建议先前台运行，方便观察启动过程：

```cmd
docker compose -f docker-compose.yml --env-file .env --profile "*" up
```

首次启动需要拉取镜像、构建本地镜像，可能耗时较久。看到以下日志，说明部署基本完成。

![Coze Loop 首次启动时的日志界面](images/6/6-5-5-1.png)

![Coze Loop 启动完成后的日志界面](images/6/6-5-5-2.png)

在 Docker Desktop 的容器列表中，除 `xxx-init` 这类初始化容器执行完后自动退出外，其余服务容器应保持运行状态。

浏览器访问：

```text
http://localhost:8082
```

![Docker Desktop 中 Coze Loop 容器运行状态的界面](images/6/6-5-5-3.png)

注册完成后即可进入应用详情页。

![浏览器访问 Coze Loop 开源版时的界面](images/6/6-5-5-4.png)

### 5.6 Coze Loop 主要功能速览

下面以在线版 `https://www.coze.cn/loop` 的 Demo 空间为例，看一下 Coze Loop 的核心功能。开源版和在线版界面可能略有差异，但功能理解是一致的。

![Coze Loop 在线版 Demo 空间界面](images/6/6-5-6-1.png)

#### 5.6.1 Prompt 开发

用于提示词预览与调试。

![Coze Loop 的 Prompt 开发模块界面](images/6/6-5-6-2.png)

点击详情：

![Coze Loop Prompt 开发详情入口界面](images/6/6-5-6-3.png)

![Coze Loop Prompt 开发详情页界面](images/6/6-5-6-4.png)

#### 5.6.2 Playground

Playground 和 Prompt 开发类似，但更适合做自由对比。

![Coze Loop Playground 模块界面](images/6/6-5-6-5.png)

Demo 空间中无法开启自由对比模式，可切换到个人空间使用。

![Coze Loop 在 Demo 空间中的 Playground 界面](images/6/6-5-6-6.png)

![Coze Loop 切换到个人空间的界面](images/6/6-5-6-7.png)

![Coze Loop 自由对比模式的界面](images/6/6-5-6-8.png)

#### 5.6.3 评测集

评测集用于管理测试样本，是后续实验和自动化评测的基础。

![Coze Loop 评测集模块界面](images/6/6-5-6-9.png)

![Coze Loop 评测集详情界面](images/6/6-5-6-10.png)

![Coze Loop 新建评测集的界面](images/6/6-5-6-11.png)

#### 5.6.4 评估器

该模块用于构建评估**Prompt 开发**实例的工具，本质上也是添加了提示词的大模型。

![Coze Loop 评估器模块界面](images/6/6-5-6-12.png)

![Coze Loop 新建评估器的界面](images/6/6-5-6-13.png)

![Coze Loop 评估器配置详情界面](images/6/6-5-6-14.png)

#### 5.6.5 实验

实验用于把评测集、评测对象和评估器串起来，做版本对比和效果分析。

![Coze Loop 实验模块界面](images/6/6-5-6-15.png)

Demo 空间无权创建实验，切换到个人空间即可。

![Coze Loop 切换到个人空间创建实验的界面](images/6/6-5-6-16.png)

实验详情如下：

![Coze Loop 实验详情页界面](images/6/6-5-6-17.png)

指标统计模块会以可视化方式展示评估结果。

![Coze Loop 实验指标统计界面](images/6/6-5-6-18.png)

新建实验时，依次设置基础信息、评测集、评测对象和评估器即可。

![Coze Loop 新建实验的界面](images/6/6-5-6-19.png)

#### 5.6.6 Trace

Trace 用于记录运行链路里的详细信息，适合排查模型调用、工具调用和执行步骤。

![Coze Loop Trace 模块界面](images/6/6-5-6-20.png)

![Coze Loop Trace 详情界面](images/6/6-5-6-21.png)

![Coze Loop Trace 运行明细界面](images/6/6-5-6-22.png)

#### 5.6.7 统计与自动化任务

统计模块用于查看空间整体运行情况；自动化任务用于周期性执行评测。

![Coze Loop 自动化任务模块界面](images/6/6-5-6-23.png)

详情页：

![Coze Loop 自动化任务详情页界面](images/6/6-5-6-24.png)

![Coze Loop 自动化任务配置明细界面](images/6/6-5-6-25.png)

## 6、部署失败时先查哪里

部署类问题不要只盯着浏览器页面。建议按下面顺序排查：

1. **环境是否正常**：Docker Desktop 是否 Running，终端里 `docker` 和 `docker compose` 是否可用。
2. **目录是否正确**：执行命令时是否在对应项目的 `docker` 或 `release\deployment\docker-compose` 目录。
3. **配置是否完整**：`.env`、模型配置文件、API Key、Endpoint、端口是否写对。
4. **镜像是否拉取成功**：如果卡在下载镜像，优先处理代理和镜像源。
5. **容器是否在运行**：用 `docker compose ps` 或 Docker Desktop 查看状态。
6. **日志里有没有明确报错**：重点看 API、Web、数据库、模型服务相关日志。

本章只负责跑通最小链路。更系统的 Docker 命令、Dify 数据位置、升级备份和数据库连接，继续看 [第 8 章 Docker 入门与 Dify 部署常见问题](8-Docker入门与Dify部署常见问题.md)。

---

**章节思考题：**

1. Coze Studio、Dify 和 Coze Loop 在定位上最大的区别是什么？

   **答案：** Coze Studio 更偏智能体开发，用来搭 Agent、工作流和模型配置；Dify 更偏应用平台和工作流编排，适合知识库、API 调用和私有化应用发布；Coze Loop 更偏运维和评测，用来做 Prompt 实验、数据集评估、Trace 和生命周期管理。

2. 为什么说本地部署平台不等于问题就都解决了，模型接入和运维仍然是关键环节？

   **答案：** 因为平台只是壳，真正能不能跑起来还取决于模型是否接通、配置是否正确、容器是否稳定、资源是否够用。本地部署解决的是可控性和私有化，不会自动替你解决模型可用性和运维问题。

3. 在模型配置时，云端 API 路线和 Ollama 路线最大的差异分别体现在哪？

   **答案：** 云端 API 路线的核心是配置好服务商的 Key 和 Endpoint，由远端提供算力；Ollama 路线的核心是模型在本机运行，需要本地拉取模型、关注硬件资源和推理性能。一个偏“接服务”，一个偏“自己跑模型”。

4. 如果你要向团队解释“为什么有了云端平台，还要看本地部署”，你会如何从数据、安全、交付方式三个角度说明？

   **答案：** 可以这样解释：本地部署的价值主要在于数据更可控、安全边界更清晰、交付方式更适合内网或私有化场景；同时它能让企业把平台、模型和业务系统整合成自己的基础设施，而不是完全依赖外部云平台。

5. 如果部署失败，你会如何按环境、代码或 `.env`、模型配置、容器状态四个层次做排查？

   **答案：** 我会按四层排查：先看环境是否满足 Docker、网络和端口条件；再看代码目录、`.env` 或模型配置文件是否放对、改对；然后检查模型服务是否真的可连、参数是否正确；最后看容器日志和运行状态，确认到底是启动失败、模型不可用还是前端访问问题。

**本章小结：**

- **本地部署意义**：Coze 和 Dify 的本地部署让智能体平台不只停留在云端体验，也能进入更强调数据安全和私有化交付的场景。
- **核心组件**：Coze Studio 负责智能体开发，Dify 负责工作流、知识库和应用发布，Coze Loop 更偏评测、实验、Trace 和运维。
- **实操主线**：这章最关键的不是记住所有截图，而是掌握一条部署逻辑：**准备环境 -> 获取代码 -> 修改配置 -> 启动服务 -> 浏览器验证**。

**建议下一步：** 如果你要继续看 Dify 部署后的 Docker 概念、数据位置、升级备份和排障，进入 [第 8 章 Docker 入门与 Dify 部署常见问题](8-Docker入门与Dify部署常见问题.md)；如果你要继续看更完整的企业部署链路，再进入 [第 7 章 企业级大模型部署](7-企业级大模型部署.md)。
