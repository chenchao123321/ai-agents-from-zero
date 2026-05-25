(function (root, factory) {
  var api = factory(root);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root && typeof root === "object") {
    root.DocsifyMermaidViewer = api;
  }
})(
  typeof window !== "undefined" ? window : globalThis,
  function (root) {
    var DEFAULTS = {
      minScale: 0.5,
      maxScale: 5,
      zoomStep: 1.2,
    };
    var mermaidRenderIndex = 0;

    function withDefaults(options) {
      return Object.assign({}, DEFAULTS, options || {});
    }

    function createTransform() {
      return { scale: 1, x: 0, y: 0 };
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function zoomAt(transform, nextScale, origin, options) {
      var config = withDefaults(options);
      var scale = clamp(nextScale, config.minScale, config.maxScale);
      var ratio = scale / transform.scale;
      var point = origin || { x: 0, y: 0 };

      return {
        scale: scale,
        x: point.x - (point.x - transform.x) * ratio,
        y: point.y - (point.y - transform.y) * ratio,
      };
    }

    function zoomBy(transform, factor, options) {
      return zoomAt(transform, transform.scale * factor, { x: 0, y: 0 }, options);
    }

    function panBy(transform, deltaX, deltaY) {
      return {
        scale: transform.scale,
        x: transform.x + deltaX,
        y: transform.y + deltaY,
      };
    }

    function resetTransform() {
      return createTransform();
    }

    function icon(paths) {
      return (
        '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round">' +
        paths +
        "</svg>"
      );
    }

    var ICONS = {
      windowFullscreen: icon(
        '<rect x="4" y="5" width="16" height="14" rx="2"></rect>' +
          '<path d="M8 9h3"></path><path d="M8 9v3"></path>' +
          '<path d="M16 15h-3"></path><path d="M16 15v-3"></path>'
      ),
      fullscreen: icon(
        '<path d="M8 3H5a2 2 0 0 0-2 2v3"></path>' +
          '<path d="M16 3h3a2 2 0 0 1 2 2v3"></path>' +
          '<path d="M8 21H5a2 2 0 0 1-2-2v-3"></path>' +
          '<path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>'
      ),
      zoomIn: icon(
        '<circle cx="11" cy="11" r="8"></circle>' +
          '<path d="m21 21-4.35-4.35"></path>' +
          '<path d="M11 8v6"></path><path d="M8 11h6"></path>'
      ),
      zoomOut: icon(
        '<circle cx="11" cy="11" r="8"></circle>' +
          '<path d="m21 21-4.35-4.35"></path>' +
          '<path d="M8 11h6"></path>'
      ),
      reset: icon(
        '<path d="M21 12a9 9 0 1 1-2.64-6.36"></path>' +
          '<path d="M21 3v6h-6"></path>'
      ),
    };

    function makeButton(label, html, onClick) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "mermaid-viewer__button";
      button.setAttribute("aria-label", label);
      button.title = label;
      button.innerHTML = html;
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return button;
    }

    function setWindowFullscreenState(viewer, pageElement, active) {
      viewer.classList.toggle("is-window-fullscreen", active);
      pageElement.classList.toggle("mermaid-viewer-open", active);
    }

    function setTransform(svg, transform) {
      svg.style.transform =
        "translate(" +
        transform.x +
        "px, " +
        transform.y +
        "px) scale(" +
        transform.scale +
        ")";
      svg.style.transformOrigin = "0 0";
    }

    function closeWindowFullscreen(exceptViewer) {
      document
        .querySelectorAll(".mermaid-viewer.is-window-fullscreen")
        .forEach(function (viewer) {
          if (viewer !== exceptViewer) {
            setWindowFullscreenState(viewer, document.documentElement, false);
          }
        });
    }

    function toggleWindowFullscreen(viewer) {
      var active = !viewer.classList.contains("is-window-fullscreen");
      closeWindowFullscreen(active ? viewer : null);
      setWindowFullscreenState(viewer, document.documentElement, active);
    }

    function toggleNativeFullscreen(viewer) {
      if (document.fullscreenElement === viewer) {
        document.exitFullscreen().catch(function () {
          toggleWindowFullscreen(viewer);
        });
        return;
      }

      closeWindowFullscreen();

      if (viewer.requestFullscreen) {
        viewer.requestFullscreen().catch(function () {
          toggleWindowFullscreen(viewer);
        });
        return;
      }

      toggleWindowFullscreen(viewer);
    }

    function buildViewer(mermaidBlock, options) {
      if (mermaidBlock.dataset.mermaidViewer === "true") return;

      var svg = mermaidBlock.querySelector("svg");
      if (!svg) return;

      var config = withDefaults(options);
      var transform = createTransform();
      var dragging = false;
      var lastPointer = null;

      mermaidBlock.dataset.mermaidViewer = "true";
      mermaidBlock.classList.add("mermaid-viewer");

      var canvas = document.createElement("div");
      canvas.className = "mermaid-viewer__canvas";
      mermaidBlock.insertBefore(canvas, svg);
      canvas.appendChild(svg);

      var toolbar = document.createElement("div");
      toolbar.className = "mermaid-viewer__toolbar";

      var apply = function () {
        setTransform(svg, transform);
        mermaidBlock.classList.toggle("is-zoomed", transform.scale !== 1);
      };

      toolbar.appendChild(
        makeButton("浏览器窗口内全屏查看 Mermaid 图", ICONS.windowFullscreen, function () {
          toggleWindowFullscreen(mermaidBlock);
        })
      );
      toolbar.appendChild(
        makeButton("显示器全屏查看 Mermaid 图", ICONS.fullscreen, function () {
          toggleNativeFullscreen(mermaidBlock);
        })
      );
      toolbar.appendChild(
        makeButton("缩小 Mermaid 图", ICONS.zoomOut, function () {
          transform = zoomAt(transform, transform.scale / config.zoomStep, {
            x: canvas.clientWidth / 2,
            y: canvas.clientHeight / 2,
          }, config);
          apply();
        })
      );
      toolbar.appendChild(
        makeButton("放大 Mermaid 图", ICONS.zoomIn, function () {
          transform = zoomAt(transform, transform.scale * config.zoomStep, {
            x: canvas.clientWidth / 2,
            y: canvas.clientHeight / 2,
          }, config);
          apply();
        })
      );
      toolbar.appendChild(
        makeButton("重置 Mermaid 图", ICONS.reset, function () {
          transform = resetTransform();
          apply();
        })
      );
      mermaidBlock.appendChild(toolbar);

      canvas.addEventListener(
        "wheel",
        function (event) {
          event.preventDefault();

          var rect = canvas.getBoundingClientRect();
          var factor = event.deltaY < 0 ? config.zoomStep : 1 / config.zoomStep;
          transform = zoomAt(
            transform,
            transform.scale * factor,
            {
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            },
            config
          );
          apply();
        },
        { passive: false }
      );

      canvas.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        dragging = true;
        lastPointer = { x: event.clientX, y: event.clientY };
        if (canvas.setPointerCapture) {
          canvas.setPointerCapture(event.pointerId);
        }
        mermaidBlock.classList.add("is-dragging");
      });

      canvas.addEventListener("pointermove", function (event) {
        if (!dragging || !lastPointer) return;
        transform = panBy(
          transform,
          event.clientX - lastPointer.x,
          event.clientY - lastPointer.y
        );
        lastPointer = { x: event.clientX, y: event.clientY };
        apply();
      });

      ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) {
        canvas.addEventListener(name, function () {
          dragging = false;
          lastPointer = null;
          mermaidBlock.classList.remove("is-dragging");
        });
      });

      canvas.addEventListener("dblclick", function () {
        toggleWindowFullscreen(mermaidBlock);
      });

      apply();
    }

    function renderMermaidBlock(mermaidBlock) {
      if (mermaidBlock.dataset.mermaidViewer === "true") {
        return Promise.resolve();
      }
      if (mermaidBlock.dataset.mermaidRendered === "true") {
        return Promise.resolve();
      }
      if (mermaidBlock.querySelector("svg")) {
        mermaidBlock.dataset.mermaidRendered = "true";
        return Promise.resolve();
      }

      var mermaidApi = root && root.mermaid;
      if (!mermaidApi || typeof mermaidApi.render !== "function") {
        return Promise.resolve();
      }

      var source = (mermaidBlock.textContent || "").trim();
      if (!source) return Promise.resolve();

      var id = "mermaid-svg-" + mermaidRenderIndex++;
      var renderResult;
      try {
        renderResult = mermaidApi.render(id, source);
      } catch (error) {
        mermaidBlock.dataset.mermaidError = "true";
        mermaidBlock.classList.add("mermaid-error");
        if (root && root.console && root.console.error) {
          root.console.error("Mermaid render failed:", error);
        }
        return Promise.resolve();
      }

      return Promise.resolve(renderResult)
        .then(function (result) {
          mermaidBlock.innerHTML =
            (typeof result === "string" ? result : result && result.svg) || "";
          mermaidBlock.dataset.mermaidRendered = "true";
          mermaidBlock.classList.remove("mermaid-error");
        })
        .catch(function (error) {
          mermaidBlock.dataset.mermaidError = "true";
          mermaidBlock.classList.add("mermaid-error");
          if (root && root.console && root.console.error) {
            root.console.error("Mermaid render failed:", error);
          }
        });
    }

    function renderMermaidBlocks(scope) {
      var rootNode = scope || document;
      var blocks = Array.prototype.slice.call(
        rootNode.querySelectorAll(".mermaid")
      );

      return Promise.all(blocks.map(renderMermaidBlock));
    }

    function initAll(scope, options) {
      var rootNode = scope || document;
      rootNode.querySelectorAll(".mermaid").forEach(function (block) {
        buildViewer(block, options);
      });
    }

    function initAllAsync(scope, options) {
      return renderMermaidBlocks(scope).then(function () {
        initAll(scope, options);
      });
    }

    function syncFullscreenClass() {
      document.querySelectorAll(".mermaid-viewer").forEach(function (viewer) {
        viewer.classList.toggle(
          "is-native-fullscreen",
          document.fullscreenElement === viewer
        );
      });
      document.documentElement.classList.toggle(
        "mermaid-viewer-open",
        Boolean(
          document.fullscreenElement ||
            document.querySelector(".mermaid-viewer.is-window-fullscreen")
        )
      );
    }

    function registerDocsifyPlugin() {
      if (!root || !root.document) return;

      root.$docsify = root.$docsify || {};

      var plugin = function (hook) {
        hook.doneEach(function () {
          initAllAsync(root.document, root.$docsify.mermaidViewer);
        });
      };

      root.$docsify.plugins = [].concat(root.$docsify.plugins || [], plugin);

      root.document.addEventListener("fullscreenchange", syncFullscreenClass);
      root.document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        if (root.document.fullscreenElement) return;

        closeWindowFullscreen();
        syncFullscreenClass();
      });

      root.addEventListener("DOMContentLoaded", function () {
        initAllAsync(root.document, root.$docsify.mermaidViewer);
      });
      root.addEventListener("hashchange", function () {
        root.setTimeout(function () {
          initAllAsync(root.document, root.$docsify.mermaidViewer);
        }, 0);
      });
    }

    var api = {
      buildViewer: buildViewer,
      createTransform: createTransform,
      initAll: initAll,
      initAllAsync: initAllAsync,
      panBy: panBy,
      renderMermaidBlocks: renderMermaidBlocks,
      resetTransform: resetTransform,
      setWindowFullscreenState: setWindowFullscreenState,
      zoomAt: zoomAt,
      zoomBy: zoomBy,
    };

    registerDocsifyPlugin();

    return api;
  }
);
