import { getCapture } from "../lib/db.js";
import { canvasToBlob, downloadBlob } from "../lib/download.js";
import { formatShotName, imageExtension } from "../lib/filename.js";
import { fitToWidth, normalizeRect, resizeWithAspect } from "../lib/geometry.js";
import { getSettings, saveSettings } from "../lib/settings.js";
import { iconElement } from "./icons.js";
import { FONTS, annotationBounds, blurRegion, clampStepStart, drawAnnotations, hitAnnotation, nextStepNumber, paintSteps, renumberSteps, strokeOpacity, translateAnnotation } from "./tools.js";

const params = new URLSearchParams(location.search);
const stage = document.querySelector("#stage");
const wrap = document.querySelector("#wrap");
const base = document.querySelector("#base");
const overlay = document.querySelector("#overlay");
const status = document.querySelector("#status");
const tools = document.querySelector("#tools");
const options = document.querySelector("#tool-options");
const textEditor = document.querySelector("#text-editor");
const textArea = textEditor.querySelector("textarea");
const textSubmit = textEditor.querySelector("button");
const missing = document.querySelector("#missing");

const ACTIONS = [
  ["download", "Download"],
  ["copy", "Copy"],
  ["print", "Print"],
  ["undo", "Undo"],
  ["redo", "Redo"],
];

const STROKE_COLORS = [
  ["Red", "#e23b2f"],
  ["Orange", "#f0883e"],
  ["Yellow", "#f5c518"],
  ["Green", "#2da44e"],
  ["Blue", "#1f6feb"],
  ["Black", "#111111"],
  ["White", "#ffffff"],
];

const TEXT_COLORS = [
  ["Black", "#111111"],
  ["White", "#ffffff"],
  ["Red", "#e23b2f"],
  ["Blue", "#1f6feb"],
  ["Green", "#2da44e"],
  ["Orange", "#f0883e"],
  ["Purple", "#8250df"],
];

const HIGHLIGHT_COLORS = [
  ["Yellow", "#ffe14a"],
  ["Green", "#b6ef4a"],
  ["Pink", "#ff8ad4"],
  ["Orange", "#ffc14a"],
  ["Blue", "#8ecbff"],
];

const STEP_TEXT_COLORS = [
  ["White", "#ffffff"],
  ["Black", "#111111"],
  ["Red", "#e23b2f"],
  ["Blue", "#1f6feb"],
  ["Green", "#2da44e"],
];

const STEP_SIZES = [
  ["Small", 24],
  ["Medium", 36],
  ["Large", 52],
];

const TOOL_NAMES = [
  ["resize", "Resize"],
  ["crop", "Crop"],
  ["move", "Move"],
  ["pen", "Pen"],
  ["highlight", "Highlight"],
  ["rect", "Rectangle"],
  ["ellipse", "Ellipse"],
  ["arrow", "Arrow"],
  ["text", "Text"],
  ["step", "Step"],
  ["blur", "Blur"],
  ["erase", "Erase"],
];

for (const [id, label] of ACTIONS) {
  labelButton(document.querySelector(`#${id}`), id, label);
}

let record = null;
try {
  record = await getCapture(params.get("id"));
} catch {
  record = null;
}
const settings = await getSettings();
let toolPrefs = settings.tool;
let bitmap = null;
let annotations = [];
let history = [];
let redoStack = [];
let currentTool = "pen";
let draft = null;
let cropRect = null;
let drag = null;
let moving = null;
let textTarget = null;
let eraseHover = -1;
let selected = -1;
let pendingSelect = null;
let pendingStep = null;

const SHAPE_TOOLS = ["pen", "highlight", "rect", "ellipse", "arrow"];
const SELECT_CLICK_PX = 6;

if (!record?.blob) {
  missing.hidden = false;
} else {
  bitmap = await createImageBitmap(record.blob);
  wrap.hidden = false;
  const notes = [];
  if (record.truncated) notes.push("The page was truncated.");
  if (record.note) notes.push(record.note);
  status.textContent = notes.join(" ");
  buildTools();
  renderOptions();
  draw();
  if (params.get("download") === "1") download().catch((error) => { status.textContent = error.message; });
}

for (const [id, action] of [["download", download], ["copy", copyImage], ["print", printImage], ["undo", undo], ["redo", redo]]) {
  document.querySelector(`#${id}`).addEventListener("click", () => action().catch((error) => { status.textContent = error.message; }));
}

window.addEventListener("resize", draw);
window.addEventListener("keydown", (event) => {
  if (event.target.closest("input, textarea, select")) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (event.key === "Delete" && !event.ctrlKey && !event.metaKey && !event.altKey && selectedShape()) {
    event.preventDefault();
    eraseAnnotation(selected);
    eraseHover = -1;
    renderOptions();
    draw();
  } else if (event.key === "Escape") {
    if (moving) {
      const entry = history.pop();
      if (entry) annotations = entry.annotations;
      moving = null;
    }
    draft = null;
    cropRect = null;
    pendingSelect = null;
    pendingStep = null;
    textTarget = null;
    if (selected >= 0) {
      selected = -1;
      renderOptions();
    }
    textEditor.hidden = true;
    draw();
  }
});

overlay.addEventListener("pointerdown", onPointerDown);
overlay.addEventListener("pointermove", onPointerMove);
overlay.addEventListener("pointerup", onPointerUp);
overlay.addEventListener("pointercancel", onPointerUp);
overlay.addEventListener("pointerleave", () => {
  if (eraseHover < 0) return;
  eraseHover = -1;
  draw();
});
textEditor.addEventListener("submit", (event) => {
  event.preventDefault();
  commitText();
});

function labelButton(button, iconName, label) {
  button.replaceChildren(iconElement(iconName));
  button.title = label;
  button.setAttribute("aria-label", label);
}

function buildTools() {
  for (const [id, label] of TOOL_NAMES) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tool = id;
    labelButton(button, id, label);
    button.setAttribute("aria-pressed", id === currentTool ? "true" : "false");
    button.addEventListener("click", () => selectTool(id));
    tools.append(button);
  }
}

function selectTool(id) {
  const next = currentTool === id ? null : id;
  draft = null;
  cropRect = null;
  drag = null;
  moving = null;
  textTarget = null;
  eraseHover = -1;
  selected = -1;
  pendingSelect = null;
  pendingStep = null;
  textEditor.hidden = true;
  markTool(next);
  renderOptions();
  draw();
}

function markTool(id) {
  currentTool = id;
  overlay.style.cursor = id === "move" ? "move" : id === "erase" ? "pointer" : id ? "crosshair" : "default";
  for (const item of tools.querySelectorAll("button")) {
    item.setAttribute("aria-pressed", item.dataset.tool === id ? "true" : "false");
  }
}

function renderOptions() {
  options.replaceChildren();
  const add = (label, control) => {
    const field = document.createElement("label");
    field.append(label, control);
    options.append(field);
    return control;
  };
  if (currentTool === "move") {
    const hint = document.createElement("p");
    hint.textContent = "Drag a pen stroke, highlight, shape, arrow, text, or step to move it.";
    options.append(hint);
    return;
  }
  if (currentTool === "erase") {
    const hint = document.createElement("p");
    hint.textContent = "Click a pen stroke, highlight, shape, arrow, text, or step to delete it.";
    options.append(hint);
    return;
  }
  const shape = selectedShape();
  if (shape?.type === "text") return textOptions();
  if (shape?.type === "step") return stepOptions();
  if (shape) return shapeOptions(shape.type);
  if (currentTool === "resize") {
    const width = add("Width", numberInput(bitmap.width));
    const height = add("Height", numberInput(bitmap.height));
    const lock = document.createElement("input");
    lock.type = "checkbox";
    lock.checked = toolPrefs.keepAspect;
    const lockLabel = document.createElement("label");
    lockLabel.append(lock, " Keep proportions");
    options.append(lockLabel);
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Apply size";
    options.append(apply);
    let changed = "w";
    const sync = (axis) => {
      changed = axis;
      if (!lock.checked) return;
      const next = resizeWithAspect(bitmap.width, bitmap.height, width.value, height.value, axis, true);
      if (axis === "w" && next.height) height.value = String(next.height);
      if (axis === "h" && next.width) width.value = String(next.width);
    };
    width.addEventListener("input", () => sync("w"));
    height.addEventListener("input", () => sync("h"));
    lock.addEventListener("change", () => saveTool({ keepAspect: lock.checked }));
    apply.addEventListener("click", () => applyResize(width.value, height.value, lock.checked, changed));
    return;
  }
  if (currentTool === "pen") return strokeOptions("color", "strokeWidth", "strokeOpacity", STROKE_COLORS);
  if (currentTool === "highlight") return strokeOptions("highlightColor", "highlightWidth", "highlightOpacity", HIGHLIGHT_COLORS);
  if (currentTool === "rect" || currentTool === "ellipse" || currentTool === "arrow") return strokeOptions("shapeColor", "shapeWidth", "shapeOpacity", STROKE_COLORS);
  if (currentTool === "crop") {
    const hint = document.createElement("p");
    hint.textContent = "Drag a rectangle, then apply.";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Apply crop";
    apply.addEventListener("click", () => applyCrop().catch((error) => { status.textContent = error.message; }));
    options.append(hint, apply);
    return;
  }
  if (currentTool === "blur") {
    const radius = add("Blur radius", numberInput(toolPrefs.blurRadius));
    radius.min = "2";
    radius.max = "40";
    radius.addEventListener("change", () => saveTool({ blurRadius: Number(radius.value) }));
    const hint = document.createElement("p");
    hint.textContent = "Drag the zone to blur.";
    options.append(hint);
    return;
  }
  if (currentTool === "text") return textOptions();
  if (currentTool === "step") return stepOptions();
}

function textOptions() {
  const editing = selectedText();
  const font = document.createElement("select");
  for (const name of FONTS) font.append(new Option(name, name));
  font.value = editing ? editing.font : toolPrefs.font;
  const size = numberInput(editing ? editing.size : toolPrefs.fontSize);
  size.min = "8";
  size.max = "240";
  const color = colorInput(editing ? editing.color : toolPrefs.textColor);
  const bg = colorInput(editing ? editing.bg : toolPrefs.textBg, "#ffffff");
  const opacity = document.createElement("input");
  opacity.type = "range";
  opacity.min = "0";
  opacity.max = "100";
  opacity.value = String(editing ? (editing.bgOpacity ?? 0) : toolPrefs.textBgOpacity);
  const readout = document.createElement("span");
  const paintOpacity = () => { readout.textContent = `${opacity.value}%`; };
  paintOpacity();
  const shadow = document.createElement("input");
  shadow.type = "checkbox";
  shadow.checked = editing ? Boolean(editing.shadow) : toolPrefs.textShadow;
  const shadowSize = numberInput(editing ? editing.shadowBlur : toolPrefs.shadowBlur);
  let sizeGesture = false;
  let colorGesture = false;
  let bgGesture = false;
  let opacityGesture = false;
  let shadowSizeGesture = false;
  const apply = (checkpoint) => {
    const patch = {
      font: font.value,
      size: Number(size.value),
      color: color.value,
      bg: bg.value,
      bgOpacity: Math.min(100, Math.max(0, Math.round(Number(opacity.value)))),
      shadow: shadow.checked,
      shadowBlur: Number(shadowSize.value),
    };
    if (!Number.isFinite(patch.size) || patch.size < 1 || !Number.isFinite(patch.shadowBlur)) return;
    const annotation = selectedText();
    if (!annotation) {
      saveTool({
        font: patch.font,
        fontSize: patch.size,
        textColor: patch.color,
        textBg: patch.bg,
        textBgOpacity: patch.bgOpacity,
        textShadow: patch.shadow,
        shadowBlur: patch.shadowBlur,
      });
      return;
    }
    const same = annotation.font === patch.font
      && annotation.size === patch.size
      && String(annotation.color || "").toLowerCase() === String(patch.color || "").toLowerCase()
      && String(annotation.bg || "").toLowerCase() === String(patch.bg || "").toLowerCase()
      && Number(annotation.bgOpacity) === patch.bgOpacity
      && Boolean(annotation.shadow) === patch.shadow
      && annotation.shadowBlur === patch.shadowBlur;
    if (same) return;
    if (checkpoint) remember();
    annotations[selected] = { ...annotations[selected], ...patch };
    draw();
  };
  if (editing) {
    const hint = document.createElement("p");
    hint.textContent = "Selected text. Changes apply to this drawing.";
    options.append(hint);
  }
  const fontLabel = document.createElement("label");
  fontLabel.append("Font", font);
  const sizeLabel = document.createElement("label");
  sizeLabel.append("Size", size);
  const colorLabel = document.createElement("label");
  colorLabel.append("Color", colorSwatches(TEXT_COLORS, color, () => apply(true)), color);
  const bgLabel = document.createElement("label");
  bgLabel.append("Background", bg);
  const opacityLabel = document.createElement("label");
  opacityLabel.append("Background opacity", opacity, readout);
  const shadowLabel = document.createElement("label");
  shadowLabel.append(shadow, " Shadow");
  const shadowSizeLabel = document.createElement("label");
  shadowSizeLabel.append("Shadow size", shadowSize);
  options.append(fontLabel, sizeLabel, colorLabel, bgLabel, opacityLabel, shadowLabel, shadowSizeLabel);
  font.addEventListener("change", () => apply(true));
  size.addEventListener("input", () => { apply(!sizeGesture); sizeGesture = true; });
  size.addEventListener("change", () => { if (!sizeGesture) apply(true); sizeGesture = false; });
  color.addEventListener("input", () => {
    markSwatches(colorLabel.querySelector(".swatches"), color.value);
    apply(!colorGesture);
    colorGesture = true;
  });
  color.addEventListener("change", () => {
    markSwatches(colorLabel.querySelector(".swatches"), color.value);
    if (!colorGesture) apply(true);
    colorGesture = false;
  });
  bg.addEventListener("input", () => { apply(!bgGesture); bgGesture = true; });
  bg.addEventListener("change", () => { if (!bgGesture) apply(true); bgGesture = false; });
  opacity.addEventListener("input", () => { paintOpacity(); apply(!opacityGesture); opacityGesture = true; });
  opacity.addEventListener("change", () => { paintOpacity(); if (!opacityGesture) apply(true); opacityGesture = false; });
  shadow.addEventListener("change", () => apply(true));
  shadowSize.addEventListener("input", () => { apply(!shadowSizeGesture); shadowSizeGesture = true; });
  shadowSize.addEventListener("change", () => { if (!shadowSizeGesture) apply(true); shadowSizeGesture = false; });
}

function stepLook() {
  const steps = annotations.filter((item) => item.type === "step");
  steps.sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  const first = steps[0];
  return {
    fill: first?.fill || toolPrefs.stepFill,
    color: first?.color || toolPrefs.stepColor,
    size: first?.size || toolPrefs.stepSize,
    start: first ? clampStepStart(first.n) : clampStepStart(toolPrefs.stepStart),
  };
}

function markStepSizes(row, value) {
  const current = String(value);
  for (const button of row.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", button.dataset.size === current ? "true" : "false");
  }
}

function stepOptions() {
  const look = stepLook();
  const fill = colorInput(look.fill, "#e23b2f");
  const color = colorInput(look.color, "#ffffff");
  const size = numberInput(look.size);
  size.min = "16";
  size.max = "96";
  const start = numberInput(look.start);
  start.min = "1";
  start.max = "9999";
  const sizes = document.createElement("div");
  sizes.className = "step-sizes";
  sizes.setAttribute("role", "group");
  sizes.setAttribute("aria-label", "Step size");
  let sizeGesture = false;
  let fillGesture = false;
  let colorGesture = false;
  let startGesture = false;
  const apply = (checkpoint) => {
    const rawSize = Math.round(Number(size.value));
    const rawStart = Math.round(Number(start.value));
    if (!Number.isFinite(rawSize) || rawSize < 16 || !Number.isFinite(rawStart) || rawStart < 1) return;
    const patch = {
      fill: fill.value,
      color: color.value,
      size: Math.min(96, rawSize),
    };
    const origin = Math.min(9999, rawStart);
    const steps = annotations.filter((item) => item.type === "step");
    const sameStyle = steps.every((item) => String(item.fill || "").toLowerCase() === patch.fill.toLowerCase()
      && String(item.color || "").toLowerCase() === patch.color.toLowerCase()
      && item.size === patch.size);
    const ordered = steps.slice().sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
    const startSame = ordered.every((item, index) => item.n === origin + index);
    const toolPatch = { stepFill: patch.fill, stepColor: patch.color, stepSize: patch.size, stepStart: origin };
    const toolSame = String(toolPrefs.stepFill || "").toLowerCase() === patch.fill.toLowerCase()
      && String(toolPrefs.stepColor || "").toLowerCase() === patch.color.toLowerCase()
      && toolPrefs.stepSize === patch.size
      && clampStepStart(toolPrefs.stepStart) === origin;
    if (!steps.length || (sameStyle && startSame)) {
      if (!toolSame) saveTool(toolPatch);
      return;
    }
    if (checkpoint) remember();
    annotations = renumberSteps(paintSteps(annotations, patch), origin);
    if (!toolSame) saveTool(toolPatch);
    draw();
  };
  const hint = document.createElement("p");
  hint.textContent = selectedShape()?.type === "step"
    ? "Selected step. Style changes apply to every step."
    : "Click the image to place the next number.";
  options.append(hint);
  const fillLabel = document.createElement("label");
  fillLabel.append("Fill", colorSwatches(STROKE_COLORS, fill, () => apply(true)), fill);
  const colorLabel = document.createElement("label");
  colorLabel.append("Text", colorSwatches(STEP_TEXT_COLORS, color, () => apply(true)), color);
  const sizeLabel = document.createElement("label");
  sizeLabel.append("Size", size);
  for (const [name, value] of STEP_SIZES) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.dataset.size = String(value);
    button.addEventListener("click", () => {
      size.value = String(value);
      markStepSizes(sizes, value);
      apply(true);
    });
    sizes.append(button);
  }
  markStepSizes(sizes, Number(size.value));
  const startLabel = document.createElement("label");
  startLabel.append("Start at", start);
  const restart = document.createElement("button");
  restart.type = "button";
  restart.textContent = "Restart at 1";
  restart.addEventListener("click", () => {
    start.value = "1";
    apply(true);
  });
  options.append(fillLabel, colorLabel, sizeLabel, sizes, startLabel, restart);
  fill.addEventListener("input", () => {
    markSwatches(fillLabel.querySelector(".swatches"), fill.value);
    apply(!fillGesture);
    fillGesture = true;
  });
  fill.addEventListener("change", () => {
    markSwatches(fillLabel.querySelector(".swatches"), fill.value);
    if (!fillGesture) apply(true);
    fillGesture = false;
  });
  color.addEventListener("input", () => {
    markSwatches(colorLabel.querySelector(".swatches"), color.value);
    apply(!colorGesture);
    colorGesture = true;
  });
  color.addEventListener("change", () => {
    markSwatches(colorLabel.querySelector(".swatches"), color.value);
    if (!colorGesture) apply(true);
    colorGesture = false;
  });
  size.addEventListener("input", () => {
    markStepSizes(sizes, Number(size.value));
    apply(!sizeGesture);
    sizeGesture = true;
  });
  size.addEventListener("change", () => {
    markStepSizes(sizes, Number(size.value));
    if (!sizeGesture) apply(true);
    sizeGesture = false;
  });
  start.addEventListener("input", () => {
    apply(!startGesture);
    startGesture = true;
  });
  start.addEventListener("change", () => {
    if (!startGesture) apply(true);
    startGesture = false;
  });
}

function shapeOptions(type) {
  if (type === "pen") return strokeOptions("color", "strokeWidth", "strokeOpacity", STROKE_COLORS);
  if (type === "highlight") return strokeOptions("highlightColor", "highlightWidth", "highlightOpacity", HIGHLIGHT_COLORS);
  return strokeOptions("shapeColor", "shapeWidth", "shapeOpacity", STROKE_COLORS);
}

function strokeOptions(colorKey, widthKey, opacityKey, presets) {
  const editing = selectedShape();
  const color = colorInput(editing ? editing.color : toolPrefs[colorKey]);
  const width = numberInput(editing ? editing.width : toolPrefs[widthKey]);
  width.min = "1";
  width.max = "80";
  const opacity = document.createElement("input");
  opacity.type = "range";
  opacity.min = "0";
  opacity.max = "100";
  opacity.value = String(editing ? strokeOpacity(editing) : toolPrefs[opacityKey]);
  const readout = document.createElement("span");
  const paintOpacity = () => { readout.textContent = `${opacity.value}%`; };
  paintOpacity();
  let colorGesture = false;
  let widthGesture = false;
  let opacityGesture = false;
  const apply = (checkpoint) => {
    const widthValue = Number(width.value);
    const colorValue = color.value;
    const opacityValue = Math.min(100, Math.max(0, Math.round(Number(opacity.value))));
    const annotation = selectedShape();
    if (!annotation) {
      const toolPatch = { [colorKey]: colorValue, [opacityKey]: opacityValue };
      if (Number.isFinite(widthValue) && widthValue >= 1) toolPatch[widthKey] = widthValue;
      saveTool(toolPatch);
      return;
    }
    if (!Number.isFinite(widthValue) || widthValue < 1 || !Number.isFinite(opacityValue)) return;
    const sameColor = String(annotation.color || "").toLowerCase() === colorValue.toLowerCase();
    if (sameColor && annotation.width === widthValue && strokeOpacity(annotation) === opacityValue) return;
    if (checkpoint) remember();
    annotations[selected] = { ...annotations[selected], color: colorValue, width: widthValue, opacity: opacityValue };
    draw();
  };
  if (editing) {
    const hint = document.createElement("p");
    const names = { pen: "pen stroke", highlight: "highlight", rect: "rectangle", ellipse: "ellipse", arrow: "arrow" };
    hint.textContent = `Selected ${names[editing.type] || "drawing"}. Changes apply to this drawing.`;
    options.append(hint);
  }
  const colorLabel = document.createElement("label");
  colorLabel.append("Color", colorSwatches(presets, color, () => apply(true)), color);
  const widthLabel = document.createElement("label");
  widthLabel.append("Stroke width", width);
  const opacityLabel = document.createElement("label");
  opacityLabel.append("Stroke opacity", opacity, readout);
  options.append(colorLabel, widthLabel, opacityLabel);
  color.addEventListener("input", () => {
    markSwatches(colorLabel.querySelector(".swatches"), color.value);
    apply(!colorGesture);
    colorGesture = true;
  });
  color.addEventListener("change", () => {
    markSwatches(colorLabel.querySelector(".swatches"), color.value);
    if (!colorGesture) apply(true);
    colorGesture = false;
  });
  width.addEventListener("input", () => {
    apply(!widthGesture);
    widthGesture = true;
  });
  width.addEventListener("change", () => {
    if (!widthGesture) apply(true);
    widthGesture = false;
  });
  opacity.addEventListener("input", () => {
    paintOpacity();
    apply(!opacityGesture);
    opacityGesture = true;
  });
  opacity.addEventListener("change", () => {
    paintOpacity();
    if (!opacityGesture) apply(true);
    opacityGesture = false;
  });
}

function colorSwatches(presets, input, onPick) {
  const row = document.createElement("div");
  row.className = "swatches";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Preset colors");
  for (const [name, value] of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = name;
    button.setAttribute("aria-label", name);
    button.dataset.color = value;
    button.style.backgroundColor = value;
    button.addEventListener("click", () => {
      input.value = value;
      markSwatches(row, value);
      onPick();
    });
    row.append(button);
  }
  markSwatches(row, input.value);
  return row;
}

function markSwatches(row, value) {
  const current = String(value || "").toLowerCase();
  for (const button of row.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", button.dataset.color === current ? "true" : "false");
  }
}

function colorInput(value, fallback = "#111111") {
  const input = document.createElement("input");
  input.type = "color";
  input.value = toColor(value, fallback);
  return input;
}

function numberInput(value) {
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(value);
  return input;
}

function toColor(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

async function saveTool(patch) {
  toolPrefs = { ...toolPrefs, ...patch };
  const latest = await getSettings();
  await saveSettings({ ...latest, tool: toolPrefs });
}

function eraseAnnotation(index) {
  if (!annotations[index]) return;
  remember();
  const removed = annotations[index];
  const start = stepLook().start;
  let next = annotations.filter((_, itemIndex) => itemIndex !== index);
  if (removed.type === "step") next = renumberSteps(next, start);
  annotations = next;
  if (selected === index) {
    selected = -1;
    textTarget = null;
    textEditor.hidden = true;
  } else if (selected > index) {
    selected -= 1;
  }
}

function onPointerDown(event) {
  if (!bitmap || event.button !== 0) return;
  const point = imagePoint(event);
  if (currentTool === "move") {
    const index = hitAnnotation(base.getContext("2d"), annotations, point);
    if (index < 0) return;
    remember();
    moving = { index, last: point, distance: 0 };
    capturePointer(event);
    draw();
    return;
  }
  if (currentTool === "erase") {
    const index = hitAnnotation(base.getContext("2d"), annotations, point);
    if (index < 0) return;
    eraseAnnotation(index);
    eraseHover = hitAnnotation(base.getContext("2d"), annotations, point);
    draw();
    return;
  }
  if (canPickShape()) {
    const index = shapeAt(point);
    if (index >= 0) {
      pendingSelect = { index, x: point.x, y: point.y };
      capturePointer(event);
      return;
    }
    if (currentTool === "step") {
      pendingStep = { x: point.x, y: point.y };
      capturePointer(event);
      return;
    }
    if (currentTool === "text") {
      selected = -1;
      textTarget = null;
      openTextEditor(point, false);
      renderOptions();
      draw();
      return;
    }
    if (selected >= 0 && !canDraw()) {
      selected = -1;
      textTarget = null;
      textEditor.hidden = true;
      renderOptions();
      draw();
      return;
    }
  }
  if (!canDraw()) return;
  beginShape(event, point);
}

function beginShape(event, point) {
  pendingSelect = null;
  pendingStep = null;
  textTarget = null;
  textEditor.hidden = true;
  if (selected >= 0) {
    selected = -1;
    renderOptions();
  }
  capturePointer(event);
  if (currentTool !== "crop") remember();
  if (currentTool === "pen" || currentTool === "highlight") {
    draft = {
      type: currentTool,
      color: currentTool === "highlight" ? toolPrefs.highlightColor : toolPrefs.color,
      width: currentTool === "highlight" ? toolPrefs.highlightWidth : toolPrefs.strokeWidth,
      opacity: currentTool === "highlight" ? toolPrefs.highlightOpacity : toolPrefs.strokeOpacity,
      points: [point],
    };
  } else if (currentTool === "arrow") {
    draft = {
      type: "arrow",
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
      color: toolPrefs.shapeColor,
      width: toolPrefs.shapeWidth,
      opacity: toolPrefs.shapeOpacity,
    };
  } else {
    drag = { x: point.x, y: point.y };
    draft = {
      type: currentTool,
      x: point.x,
      y: point.y,
      w: 0,
      h: 0,
      color: toolPrefs.shapeColor,
      width: toolPrefs.shapeWidth,
      opacity: toolPrefs.shapeOpacity,
    };
  }
  draw();
}

function onPointerMove(event) {
  if (pendingSelect) {
    const point = imagePoint(event);
    if (pointerDistance(point, pendingSelect) < SELECT_CLICK_PX) return;
    const origin = { x: pendingSelect.x, y: pendingSelect.y };
    if (canDraw()) {
      beginShape(event, origin);
      updateDraft(point);
    } else if (annotations[pendingSelect.index]?.type !== "text" && annotations[pendingSelect.index]?.type !== "step") {
      pendingSelect = null;
    }
    return;
  }
  if (pendingStep) {
    const point = imagePoint(event);
    if (pointerDistance(point, pendingStep) >= SELECT_CLICK_PX) pendingStep = null;
    return;
  }
  if (currentTool === "erase") {
    const index = hitAnnotation(base.getContext("2d"), annotations, imagePoint(event));
    if (index === eraseHover) return;
    eraseHover = index;
    draw();
    return;
  }
  if (moving) {
    const point = imagePoint(event);
    const dx = point.x - moving.last.x;
    const dy = point.y - moving.last.y;
    moving.last = point;
    moving.distance += Math.hypot(dx, dy);
    annotations = annotations.map((item, index) => (
      index === moving.index ? translateAnnotation(item, dx, dy) : item
    ));
    draw();
    return;
  }
  if (!draft && canPickShape()) {
    const over = shapeAt(imagePoint(event)) >= 0;
    const placing = currentTool === "step" || currentTool === "text" || canDraw();
    overlay.style.cursor = over ? "pointer" : (placing ? "crosshair" : "default");
    return;
  }
  if (!draft) return;
  updateDraft(imagePoint(event));
}

function updateDraft(point) {
  if (!draft) return;
  if (draft.points) {
    draft.points.push(point);
  } else if (draft.type === "arrow") {
    draft.x2 = point.x;
    draft.y2 = point.y;
  } else if (drag) {
    const box = normalizeRect(drag.x, drag.y, point.x, point.y);
    draft = { ...draft, ...box };
    if (currentTool === "crop") cropRect = box;
  }
  draw();
}

async function onPointerUp(event) {
  if (pendingSelect) {
    if (event?.type === "pointercancel") {
      pendingSelect = null;
      return;
    }
    const index = pendingSelect.index;
    pendingSelect = null;
    chooseDrawn(index);
    return;
  }
  if (pendingStep) {
    const origin = pendingStep;
    pendingStep = null;
    if (event?.type === "pointercancel") return;
    if (pointerDistance(imagePoint(event), origin) >= SELECT_CLICK_PX) return;
    placeStep(origin);
    return;
  }
  if (moving) {
    if (moving.distance < 1) {
      const entry = history.pop();
      if (entry) annotations = entry.annotations;
    }
    moving = null;
    draw();
    return;
  }
  if (!draft) return;
  const finished = draft;
  draft = null;
  drag = null;
  if (finished.type === "crop") {
    cropRect = finished.w > 4 && finished.h > 4 ? finished : null;
    draw();
    return;
  }
  if ((finished.w != null && (finished.w < 2 || finished.h < 2)) || (finished.points && finished.points.length < 2)) {
    history.pop();
    draw();
    return;
  }
  if (finished.type === "blur") {
    bitmap = await blurRegion(bitmap, finished, toolPrefs.blurRadius);
    draw();
    return;
  }
  annotations = [...annotations, finished];
  draw();
}

async function applyCrop() {
  if (!cropRect || cropRect.w < 2 || cropRect.h < 2) return;
  const flat = flatten();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cropRect.w);
  canvas.height = Math.round(cropRect.h);
  canvas.getContext("2d").drawImage(flat, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, canvas.width, canvas.height);
  remember();
  bitmap = await createImageBitmap(canvas);
  annotations = [];
  cropRect = null;
  draw();
}

async function applyResize(widthValue, heightValue, keep, changed) {
  const sized = resizeWithAspect(bitmap.width, bitmap.height, widthValue, heightValue, changed || "w", keep);
  if (!sized.width || !sized.height) {
    status.textContent = "Width and height must be between 1 and 8000.";
    return;
  }
  const flat = flatten();
  const canvas = document.createElement("canvas");
  canvas.width = sized.width;
  canvas.height = sized.height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(flat, 0, 0, sized.width, sized.height);
  remember();
  bitmap = await createImageBitmap(canvas);
  annotations = [];
  status.textContent = "";
  renderOptions();
  draw();
}

function openTextEditor(pointOrAnnotation, existing) {
  textTarget = existing ? pointOrAnnotation : null;
  textArea.value = existing ? pointOrAnnotation.text : "";
  textEditor.hidden = false;
  const bounds = overlay.getBoundingClientRect();
  const scale = bounds.width / bitmap.width;
  const x = existing ? pointOrAnnotation.x : pointOrAnnotation.x;
  const y = existing ? pointOrAnnotation.y : pointOrAnnotation.y;
  textEditor.style.left = `${bounds.left + x * scale}px`;
  textEditor.style.top = `${bounds.top + y * scale}px`;
  textEditor.dataset.x = String(x);
  textEditor.dataset.y = String(y);
  textSubmit.textContent = existing ? "Update text" : "Place text";
  textArea.focus();
}

function commitText() {
  const text = textArea.value.trim();
  textEditor.hidden = true;
  const editing = textTarget && selectedText();
  textTarget = null;
  if (!text) return;
  if (editing) {
    if (editing.text === text) return;
    remember();
    annotations[selected] = { ...annotations[selected], text };
    draw();
    return;
  }
  remember();
  annotations = [...annotations, {
    type: "text",
    x: Number(textEditor.dataset.x),
    y: Number(textEditor.dataset.y),
    text,
    font: toolPrefs.font,
    size: toolPrefs.fontSize,
    color: toolPrefs.textColor,
    bg: toolPrefs.textBg,
    bgOpacity: toolPrefs.textBgOpacity,
    shadow: toolPrefs.textShadow,
    shadowBlur: toolPrefs.shadowBlur,
  }];
  draw();
}

function placeStep(point) {
  const look = stepLook();
  const marker = {
    type: "step",
    x: point.x,
    y: point.y,
    n: nextStepNumber(annotations, look.start),
    fill: look.fill,
    color: look.color,
    size: look.size,
  };
  remember();
  annotations = [...annotations, marker];
  selected = annotations.length - 1;
  textTarget = null;
  textEditor.hidden = true;
  markTool("step");
  renderOptions();
  draw();
}

function chooseDrawn(index) {
  selected = index;
  const annotation = annotations[selected];
  markTool(annotation.type);
  if (annotation.type === "text") openTextEditor(annotation, true);
  else {
    textTarget = null;
    textEditor.hidden = true;
  }
  renderOptions();
  draw();
}

function remember() {
  history.push({ bitmap, annotations: structuredClone(annotations) });
  if (history.length > 20) {
    const dropped = history.shift();
    release(dropped.bitmap);
  }
  redoStack = [];
}

function undo() {
  const entry = history.pop();
  if (!entry) return;
  redoStack.push({ bitmap, annotations: structuredClone(annotations) });
  bitmap = entry.bitmap;
  annotations = entry.annotations;
  eraseHover = -1;
  syncSelection();
}

function redo() {
  const entry = redoStack.pop();
  if (!entry) return;
  history.push({ bitmap, annotations: structuredClone(annotations) });
  bitmap = entry.bitmap;
  annotations = entry.annotations;
  eraseHover = -1;
  syncSelection();
}

function isSelectable(annotation) {
  return Boolean(annotation) && (annotation.type === "text" || annotation.type === "step" || SHAPE_TOOLS.includes(annotation.type));
}

function selectedText() {
  const annotation = annotations[selected];
  return annotation?.type === "text" ? annotation : null;
}

function selectedShape() {
  const annotation = annotations[selected];
  return isSelectable(annotation) ? annotation : null;
}

function canPickShape() {
  return currentTool == null || currentTool === "text" || currentTool === "step" || SHAPE_TOOLS.includes(currentTool);
}

function canDraw() {
  return SHAPE_TOOLS.includes(currentTool) || currentTool === "crop" || currentTool === "blur";
}

function shapeAt(point) {
  const index = hitAnnotation(base.getContext("2d"), annotations, point);
  if (!isSelectable(annotations[index])) return -1;
  return index;
}

function syncSelection() {
  pendingSelect = null;
  pendingStep = null;
  const had = selected >= 0;
  if (!selectedShape()) {
    selected = -1;
    textTarget = null;
    textEditor.hidden = true;
  } else {
    markTool(annotations[selected].type);
    if (annotations[selected].type === "text") {
      if (textEditor.hidden) openTextEditor(annotations[selected], true);
    } else {
      textTarget = null;
      textEditor.hidden = true;
    }
  }
  if (had || currentTool === "step") renderOptions();
  draw();
}

function pointerDistance(point, origin) {
  const bounds = overlay.getBoundingClientRect();
  const scale = bounds.width / bitmap.width;
  return Math.hypot(point.x - origin.x, point.y - origin.y) * scale;
}

function release(image) {
  const used = bitmap === image
    || history.some((entry) => entry.bitmap === image)
    || redoStack.some((entry) => entry.bitmap === image);
  if (!used) image.close?.();
}

function imagePoint(event) {
  const bounds = overlay.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - bounds.left) / bounds.width) * bitmap.width, 0, bitmap.width),
    y: clamp(((event.clientY - bounds.top) / bounds.height) * bitmap.height, 0, bitmap.height),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function draw() {
  if (!bitmap) return;
  if (base.width !== bitmap.width || base.height !== bitmap.height) {
    base.width = bitmap.width;
    base.height = bitmap.height;
    overlay.width = bitmap.width;
    overlay.height = bitmap.height;
  }
  const size = layoutSize();
  wrap.style.width = `${size.width}px`;
  wrap.style.height = `${size.height}px`;
  const context = base.getContext("2d");
  context.clearRect(0, 0, bitmap.width, bitmap.height);
  context.drawImage(bitmap, 0, 0);
  const overlayContext = overlay.getContext("2d");
  overlayContext.clearRect(0, 0, bitmap.width, bitmap.height);
  drawAnnotations(overlayContext, annotations);
  if (draft && draft.type !== "crop" && draft.type !== "blur") drawAnnotations(overlayContext, [draft]);
  const movingBounds = moving ? annotationBounds(overlayContext, annotations[moving.index]) : null;
  const eraseBounds = eraseHover >= 0 ? annotationBounds(overlayContext, annotations[eraseHover]) : null;
  const eraseOutline = eraseBounds?.w
    ? { x: eraseBounds.x - 6, y: eraseBounds.y - 6, w: eraseBounds.w + 12, h: eraseBounds.h + 12 }
    : null;
  const selectedBounds = selected >= 0 && annotations[selected] ? annotationBounds(overlayContext, annotations[selected]) : null;
  const selectedOutline = selectedBounds?.w
    ? { x: selectedBounds.x - 6, y: selectedBounds.y - 6, w: selectedBounds.w + 12, h: selectedBounds.h + 12 }
    : null;
  const outline = movingBounds || eraseOutline || selectedOutline || (draft?.type === "crop" || draft?.type === "blur" ? draft : cropRect);
  if (outline?.w) {
    overlayContext.save();
    overlayContext.strokeStyle = eraseOutline && !movingBounds ? "#e23b2f" : "#1f6feb";
    overlayContext.lineWidth = 2;
    overlayContext.setLineDash([6, 4]);
    overlayContext.strokeRect(outline.x, outline.y, outline.w, outline.h);
    overlayContext.restore();
  }
}

function capturePointer(event) {
  try {
    overlay.setPointerCapture(event.pointerId);
  } catch {
    // The pointer can already be gone. The gesture still follows the events we receive.
  }
}

function layoutSize() {
  const available = stageContentWidth();
  const fitted = fitToWidth(bitmap.width, bitmap.height, available);
  wrap.style.width = `${fitted.width}px`;
  wrap.style.height = `${fitted.height}px`;
  const settled = stageContentWidth();
  if (settled === available) return fitted;
  return fitToWidth(bitmap.width, bitmap.height, settled);
}

function stageContentWidth() {
  const style = getComputedStyle(stage);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return Math.max(1, stage.clientWidth - padding);
}

function flatten() {
  if (!bitmap) throw new Error("Nothing to export.");
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);
  drawAnnotations(context, annotations);
  return canvas;
}

async function download() {
  const latest = await getSettings();
  const blob = await canvasToBlob(flatten(), latest);
  await downloadBlob(blob, formatShotName(new Date(), latest, imageExtension(latest)), latest.downloadDirectory);
  status.textContent = "Saved to Downloads.";
}

async function copyImage() {
  const blob = await new Promise((resolve) => flatten().toBlob(resolve, "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  status.textContent = "Copied.";
}

function printImage() {
  const url = flatten().toDataURL("image/png");
  const image = document.querySelector("#print-image");
  image.src = url;
  image.onload = () => window.print();
}
