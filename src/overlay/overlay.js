(() => {
  if (globalThis.__shotRecorderRegionActive) return;
  globalThis.__shotRecorderRegionActive = true;

  const host = document.createElement("div");
  host.id = "shot-recorder-region";
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .layer { position: fixed; inset: 0; cursor: crosshair; }
      .selection { position: absolute; border: 2px solid #fff; box-shadow: 0 0 0 1px #111, 0 0 0 9999px rgba(0,0,0,.45); }
      .handle { position: absolute; width: 10px; height: 10px; background: #fff; border: 1px solid #111; box-sizing: border-box; }
      .toolbar { position: absolute; display: flex; gap: 6px; padding: 6px; background: #1b1f24; border-radius: 10px; }
      button { font: 13px system-ui, sans-serif; color: #fff; background: transparent; border: 1px solid rgba(255,255,255,.35); border-radius: 8px; padding: 6px 10px; cursor: pointer; }
      button.primary { background: #1f6feb; border-color: #1f6feb; }
      .error { color: #ffb4a8; font: 12px system-ui, sans-serif; align-self: center; }
    </style>
    <div class="layer">
      <div class="selection" hidden></div>
      <div class="toolbar" hidden>
        <button type="button" data-action="capture" class="primary">Capture</button>
        <button type="button" data-action="copy">Copy</button>
        <button type="button" data-action="cancel">Cancel</button>
        <span class="error" hidden></span>
      </div>
    </div>
  `;
  document.documentElement.append(host);

  const layer = shadow.querySelector(".layer");
  const selection = shadow.querySelector(".selection");
  const toolbar = shadow.querySelector(".toolbar");
  const error = shadow.querySelector(".error");
  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  for (const name of handles) {
    const handle = document.createElement("div");
    handle.className = "handle";
    handle.dataset.handle = name;
    handle.style.cursor = `${name}-resize`;
    selection.append(handle);
  }

  const port = chrome.runtime.connect({ name: "region" });
  let rect = null;
  let drag = null;
  let busy = false;

  layer.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });

  layer.addEventListener("pointerdown", (event) => {
    if (busy || event.button !== 0 || event.target.closest(".toolbar")) return;
    const point = pointOf(event);
    const handle = event.target.dataset?.handle;
    if (handle && rect) {
      drag = { kind: "resize", handle, start: point, rect: { ...rect } };
    } else if (rect && inside(point, rect) && event.target !== layer) {
      drag = { kind: "move", start: point, rect: { ...rect } };
    } else {
      drag = { kind: "draw", start: point, rect: { x: point.x, y: point.y, width: 0, height: 0 } };
      toolbar.hidden = true;
    }
    layer.setPointerCapture(event.pointerId);
  });

  layer.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const point = pointOf(event);
    if (drag.kind === "draw") {
      rect = box(drag.start, point);
    } else if (drag.kind === "move") {
      rect = {
        x: drag.rect.x + point.x - drag.start.x,
        y: drag.rect.y + point.y - drag.start.y,
        width: drag.rect.width,
        height: drag.rect.height,
      };
    } else {
      rect = resize(drag.rect, drag.handle, point.x - drag.start.x, point.y - drag.start.y);
    }
    paint();
  });

  layer.addEventListener("pointerup", () => {
    if (!drag) return;
    drag = null;
    if (!rect || rect.width < 4 || rect.height < 4) {
      rect = null;
      selection.hidden = true;
      toolbar.hidden = true;
      return;
    }
    toolbar.hidden = false;
    error.hidden = true;
    placeToolbar();
  });

  toolbar.addEventListener("click", async (event) => {
    const action = event.target.dataset?.action;
    if (!action || busy) return;
    if (action === "cancel") {
      remove();
      return;
    }
    busy = true;
    error.hidden = true;
    host.style.visibility = "hidden";
    await frames(2);
    port.postMessage({
      type: "action",
      action,
      rect,
      viewportWidth: window.innerWidth,
      dpr: window.devicePixelRatio || 1,
    });
  });

  port.onMessage.addListener(async (message) => {
    if (message.type === "done") {
      remove();
      return;
    }
    if (message.type === "png") {
      try {
        const blob = pngBlob(message.dataUrl);
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        remove();
      } catch {
        showFailure("Copy failed. Press Copy again.");
      }
      return;
    }
    if (message.type === "failed") showFailure(message.error || "Capture failed.");
  });

  port.onDisconnect.addListener(remove);
  window.addEventListener("keydown", onKey, true);

  function onKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      remove();
    }
  }

  function showFailure(text) {
    busy = false;
    host.style.visibility = "visible";
    error.hidden = false;
    error.textContent = text;
  }

  function paint() {
    if (!rect) return;
    selection.hidden = false;
    selection.style.left = `${rect.x}px`;
    selection.style.top = `${rect.y}px`;
    selection.style.width = `${rect.width}px`;
    selection.style.height = `${rect.height}px`;
    for (const handle of selection.querySelectorAll(".handle")) {
      const name = handle.dataset.handle;
      const left = name.includes("w") ? -5 : name.includes("e") ? rect.width - 5 : rect.width / 2 - 5;
      const top = name.includes("n") ? -5 : name.includes("s") ? rect.height - 5 : rect.height / 2 - 5;
      handle.style.left = `${left}px`;
      handle.style.top = `${top}px`;
    }
    if (!toolbar.hidden) placeToolbar();
  }

  function placeToolbar() {
    const width = toolbar.offsetWidth || 220;
    const height = toolbar.offsetHeight || 40;
    let top = rect.y + rect.height + 8;
    if (top + height > window.innerHeight) top = Math.max(8, rect.y - height - 8);
    let left = rect.x + rect.width - width;
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  function pointOf(event) {
    return { x: event.clientX, y: event.clientY };
  }

  function inside(point, area) {
    return point.x >= area.x && point.y >= area.y && point.x <= area.x + area.width && point.y <= area.y + area.height;
  }

  function box(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
  }

  function resize(start, handle, dx, dy) {
    let x = start.x;
    let y = start.y;
    let width = start.width;
    let height = start.height;
    if (handle.includes("w")) { x += dx; width -= dx; }
    if (handle.includes("e")) width += dx;
    if (handle.includes("n")) { y += dy; height -= dy; }
    if (handle.includes("s")) height += dy;
    const normalized = box({ x, y }, { x: x + width, y: y + height });
    return {
      x: normalized.x,
      y: normalized.y,
      width: Math.max(8, normalized.width),
      height: Math.max(8, normalized.height),
    };
  }

  function pngBlob(dataUrl) {
    const comma = dataUrl.indexOf(",");
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: "image/png" });
  }

  function frames(count) {
    return new Promise((resolve) => {
      const step = (left) => {
        if (left <= 0) resolve();
        else requestAnimationFrame(() => step(left - 1));
      };
      step(count);
    });
  }

  function remove() {
    window.removeEventListener("keydown", onKey, true);
    host.remove();
    globalThis.__shotRecorderRegionActive = false;
    try { port.disconnect(); } catch { /* Already disconnected. */ }
  }
})();
