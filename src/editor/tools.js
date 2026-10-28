import { arrowHead } from "../lib/geometry.js";

export const FONTS = ["Arial", "Verdana", "Georgia", "Times New Roman", "Courier New", "monospace"];

export function drawAnnotations(context, annotations) {
  for (const annotation of annotations) drawAnnotation(context, annotation);
}

export function strokeOpacity(annotation) {
  const fallback = annotation?.type === "highlight" ? 40 : 100;
  if (annotation?.opacity == null) return fallback;
  const opacity = Math.round(Number(annotation.opacity));
  if (!Number.isFinite(opacity)) return fallback;
  return Math.min(100, Math.max(0, opacity));
}

export function strokeAlpha(annotation) {
  return strokeOpacity(annotation) / 100;
}

export function clampStepStart(start) {
  const number = Math.round(Number(start));
  if (!Number.isFinite(number)) return 1;
  return Math.min(9999, Math.max(1, number));
}

export function stepRadius(annotation) {
  const size = Number(annotation?.size);
  return Math.max(8, Number.isFinite(size) ? size : 36) / 2;
}

export function nextStepNumber(annotations, start = 1) {
  let max = null;
  for (const item of annotations || []) {
    if (item?.type === "step" && Number.isFinite(item.n)) max = max == null ? item.n : Math.max(max, item.n);
  }
  return max == null ? clampStepStart(start) : max + 1;
}

export function renumberSteps(annotations, start = 1) {
  const origin = clampStepStart(start);
  const order = [];
  annotations.forEach((item, index) => {
    if (item?.type === "step") order.push(index);
  });
  order.sort((a, b) => (annotations[a].n ?? 0) - (annotations[b].n ?? 0) || a - b);
  const numbers = new Map(order.map((index, place) => [index, origin + place]));
  return annotations.map((item, index) => (numbers.has(index) ? { ...item, n: numbers.get(index) } : item));
}

export function paintSteps(annotations, patch) {
  return annotations.map((item) => (item?.type === "step" ? { ...item, ...patch } : item));
}

export function drawAnnotation(context, annotation) {
  context.save();
  if (annotation.type !== "text" && annotation.type !== "step") context.globalAlpha = strokeAlpha(annotation);
  if (annotation.type === "pen" || annotation.type === "highlight") {
    drawStroke(context, annotation);
  } else if (annotation.type === "rect") {
    context.strokeStyle = annotation.color;
    context.lineWidth = annotation.width;
    context.strokeRect(annotation.x, annotation.y, annotation.w, annotation.h);
  } else if (annotation.type === "ellipse") {
    context.strokeStyle = annotation.color;
    context.lineWidth = annotation.width;
    context.beginPath();
    context.ellipse(
      annotation.x + annotation.w / 2,
      annotation.y + annotation.h / 2,
      Math.max(1, Math.abs(annotation.w / 2)),
      Math.max(1, Math.abs(annotation.h / 2)),
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  } else if (annotation.type === "arrow") {
    drawArrow(context, annotation);
  } else if (annotation.type === "text") {
    drawText(context, annotation);
  } else if (annotation.type === "step") {
    drawStep(context, annotation);
  }
  context.restore();
}

function drawStep(context, annotation) {
  const radius = stepRadius(annotation);
  context.beginPath();
  context.arc(annotation.x, annotation.y, radius, 0, Math.PI * 2);
  context.fillStyle = annotation.fill || "#e23b2f";
  context.fill();
  const label = String(Math.max(1, Math.round(Number(annotation.n) || 1)));
  const digits = label.length;
  const scale = digits <= 1 ? 0.95 : digits === 2 ? 0.78 : 0.62;
  context.fillStyle = annotation.color || "#ffffff";
  context.font = `700 ${Math.max(8, radius * scale)}px Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, annotation.x, annotation.y);
}

function drawStroke(context, annotation) {
  if (!annotation.points?.length) return;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = annotation.color;
  context.lineWidth = annotation.width;
  context.beginPath();
  annotation.points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();
}

function drawArrow(context, annotation) {
  const head = arrowHead(annotation.x1, annotation.y1, annotation.x2, annotation.y2, annotation.width);
  const angle = Math.atan2(annotation.y2 - annotation.y1, annotation.x2 - annotation.x1);
  const shorten = Math.max(8, annotation.width * 3);
  context.strokeStyle = annotation.color;
  context.fillStyle = annotation.color;
  context.lineWidth = annotation.width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(annotation.x1, annotation.y1);
  context.lineTo(annotation.x2 - Math.cos(angle) * shorten * 0.45, annotation.y2 - Math.sin(angle) * shorten * 0.45);
  context.stroke();
  context.beginPath();
  context.moveTo(head[0].x, head[0].y);
  context.lineTo(head[1].x, head[1].y);
  context.lineTo(head[2].x, head[2].y);
  context.closePath();
  context.fill();
}

function drawText(context, annotation) {
  const text = annotation.text || "";
  context.font = `${annotation.size}px ${annotation.font}`;
  context.textBaseline = "top";
  const metrics = context.measureText(text);
  const width = Math.max(8, metrics.width + 8);
  const height = annotation.size * 1.3 + 4;
  const background = textBackgroundColor(annotation);
  if (background) {
    context.fillStyle = background;
    context.fillRect(annotation.x, annotation.y, width, height);
  }
  if (annotation.shadow) {
    context.shadowColor = "rgba(0, 0, 0, 0.65)";
    context.shadowBlur = annotation.shadowBlur;
    context.shadowOffsetY = 1;
  }
  context.fillStyle = annotation.color;
  context.fillText(text, annotation.x + 4, annotation.y + 2);
}

export function textBackgroundColor(annotation) {
  if (annotation.bgOpacity == null) {
    return annotation.bg && annotation.bg !== "transparent" ? annotation.bg : "";
  }
  const opacity = Math.round(Number(annotation.bgOpacity));
  if (!Number.isFinite(opacity) || opacity <= 0) return "";
  const match = /^#([0-9a-fA-F]{6})$/.exec(annotation.bg || "");
  const hex = match ? match[1] : "ffffff";
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.min(opacity, 100) / 100})`;
}

export function textBounds(context, annotation) {
  context.save();
  context.font = `${annotation.size}px ${annotation.font}`;
  const width = Math.max(8, context.measureText(annotation.text || "").width + 8);
  const height = annotation.size * 1.3 + 4;
  context.restore();
  return { x: annotation.x, y: annotation.y, w: width, h: height };
}

export function translateAnnotation(annotation, dx, dy) {
  if (!dx && !dy) return annotation;
  if (annotation.points) {
    return {
      ...annotation,
      points: annotation.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
    };
  }
  if (annotation.type === "arrow") {
    return {
      ...annotation,
      x1: annotation.x1 + dx,
      y1: annotation.y1 + dy,
      x2: annotation.x2 + dx,
      y2: annotation.y2 + dy,
    };
  }
  if (annotation.x != null && annotation.y != null) {
    return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
  }
  return annotation;
}

export function dragStartsMove(tool, selectedIndex, hitIndex) {
  if (hitIndex < 0) return false;
  return tool == null || hitIndex === selectedIndex;
}

export function hitAnnotation(context, annotations, point) {
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    if (annotationContains(context, annotations[index], point)) return index;
  }
  return -1;
}

export function annotationContains(context, annotation, point) {
  const pad = Math.max(6, (annotation.width || 0) / 2 + 4);
  if (annotation.type === "pen" || annotation.type === "highlight") {
    const points = annotation.points || [];
    for (let index = 0; index < points.length; index += 1) {
      const next = points[Math.min(index + 1, points.length - 1)];
      if (distanceToSegment(point, points[index], next) <= pad) return true;
    }
    return false;
  }
  if (annotation.type === "rect") {
    return point.x >= annotation.x - pad
      && point.y >= annotation.y - pad
      && point.x <= annotation.x + annotation.w + pad
      && point.y <= annotation.y + annotation.h + pad;
  }
  if (annotation.type === "ellipse") {
    const rx = Math.max(1, Math.abs(annotation.w) / 2 + pad);
    const ry = Math.max(1, Math.abs(annotation.h) / 2 + pad);
    const nx = (point.x - (annotation.x + annotation.w / 2)) / rx;
    const ny = (point.y - (annotation.y + annotation.h / 2)) / ry;
    return nx * nx + ny * ny <= 1;
  }
  if (annotation.type === "arrow") {
    const start = { x: annotation.x1, y: annotation.y1 };
    const end = { x: annotation.x2, y: annotation.y2 };
    if (distanceToSegment(point, start, end) <= pad) return true;
    const head = arrowHead(annotation.x1, annotation.y1, annotation.x2, annotation.y2, annotation.width || 4);
    return pointInTriangle(point, head[0], head[1], head[2]);
  }
  if (annotation.type === "text") {
    const bounds = textBounds(context, annotation);
    return point.x >= bounds.x && point.y >= bounds.y
      && point.x <= bounds.x + bounds.w && point.y <= bounds.y + bounds.h;
  }
  if (annotation.type === "step") {
    return Math.hypot(point.x - annotation.x, point.y - annotation.y) <= stepRadius(annotation) + 4;
  }
  return false;
}

export function annotationBounds(context, annotation) {
  if (annotation.type === "text") return textBounds(context, annotation);
  if (annotation.type === "step") {
    const radius = stepRadius(annotation);
    return { x: annotation.x - radius, y: annotation.y - radius, w: radius * 2, h: radius * 2 };
  }
  if (annotation.points?.length) {
    const pad = (annotation.width || 0) / 2;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of annotation.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }
  if (annotation.type === "arrow") {
    const head = arrowHead(annotation.x1, annotation.y1, annotation.x2, annotation.y2, annotation.width || 4);
    const xs = [annotation.x1, annotation.x2, ...head.map((point) => point.x)];
    const ys = [annotation.y1, annotation.y2, ...head.map((point) => point.y)];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }
  if (annotation.w != null && annotation.h != null) {
    return { x: annotation.x, y: annotation.y, w: annotation.w, h: annotation.h };
  }
  return null;
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function pointInTriangle(point, a, b, c) {
  const sign = (p, q, r) => (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  const ab = sign(point, a, b);
  const bc = sign(point, b, c);
  const ca = sign(point, c, a);
  return !((ab < 0 || bc < 0 || ca < 0) && (ab > 0 || bc > 0 || ca > 0));
}

export function hitText(context, annotations, point) {
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    const annotation = annotations[index];
    if (annotation.type !== "text") continue;
    const bounds = textBounds(context, annotation);
    if (point.x >= bounds.x && point.y >= bounds.y && point.x <= bounds.x + bounds.w && point.y <= bounds.y + bounds.h) {
      return annotation;
    }
  }
  return null;
}

export function blurBounds(imageWidth, imageHeight, rect, radius) {
  const pad = Math.max(1, Math.ceil(Number(radius) * 2));
  const x = clampInt(Math.floor(rect.x), 0, Math.max(0, imageWidth - 1));
  const y = clampInt(Math.floor(rect.y), 0, Math.max(0, imageHeight - 1));
  const right = clampInt(Math.ceil(rect.x + rect.w), x + 1, imageWidth);
  const bottom = clampInt(Math.ceil(rect.y + rect.h), y + 1, imageHeight);
  const srcX = Math.max(0, x - pad);
  const srcY = Math.max(0, y - pad);
  const srcRight = Math.min(imageWidth, right + pad);
  const srcBottom = Math.min(imageHeight, bottom + pad);
  return {
    x,
    y,
    w: right - x,
    h: bottom - y,
    srcX,
    srcY,
    srcW: srcRight - srcX,
    srcH: srcBottom - srcY,
  };
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function blurRegion(bitmap, rect, radius) {
  const bounds = blurBounds(bitmap.width, bitmap.height, rect, radius);
  const sample = document.createElement("canvas");
  sample.width = bounds.srcW;
  sample.height = bounds.srcH;
  const sampleContext = sample.getContext("2d");
  sampleContext.imageSmoothingEnabled = false;
  sampleContext.drawImage(bitmap, bounds.srcX, bounds.srcY, bounds.srcW, bounds.srcH, 0, 0, bounds.srcW, bounds.srcH);

  const blurred = document.createElement("canvas");
  blurred.width = bounds.srcW;
  blurred.height = bounds.srcH;
  const blurContext = blurred.getContext("2d");
  blurContext.filter = `blur(${Math.max(1, Number(radius) || 1)}px)`;
  blurContext.drawImage(sample, 0, 0);

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0);
  const cropX = bounds.x - bounds.srcX;
  const cropY = bounds.y - bounds.srcY;
  context.drawImage(blurred, cropX, cropY, bounds.w, bounds.h, bounds.x, bounds.y, bounds.w, bounds.h);
  return createImageBitmap(canvas);
}
