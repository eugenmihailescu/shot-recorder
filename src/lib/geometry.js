export const MIN_IMAGE_EDGE = 1;
export const MAX_IMAGE_EDGE = 8000;

export function clampDimension(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return null;
  if (number < MIN_IMAGE_EDGE || number > MAX_IMAGE_EDGE) return null;
  return number;
}

export function resizeWithAspect(currentWidth, currentHeight, nextWidth, nextHeight, changed, keep) {
  const width = clampDimension(nextWidth);
  const height = clampDimension(nextHeight);
  if (!keep) {
    return { width, height };
  }
  const aspect = currentWidth / currentHeight;
  if (changed === "w") {
    if (width == null) return { width: null, height: null };
    return { width, height: clampDimension(Math.round(width / aspect)) };
  }
  if (height == null) return { width: null, height: null };
  return { width: clampDimension(Math.round(height * aspect)), height };
}

export function arrowHead(x1, y1, x2, y2, strokeWidth) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = Math.max(10, strokeWidth * 4);
  const spread = Math.PI / 7;
  return [
    { x: x2, y: y2 },
    { x: x2 - length * Math.cos(angle - spread), y: y2 - length * Math.sin(angle - spread) },
    { x: x2 - length * Math.cos(angle + spread), y: y2 - length * Math.sin(angle + spread) },
  ];
}

export function normalizeRect(x1, y1, x2, y2) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return { x, y, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function evenSize(value) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function fitToWidth(imageWidth, imageHeight, availableWidth) {
  const available = Math.max(1, Math.floor(availableWidth));
  if (imageWidth <= available) {
    return {
      width: Math.max(1, Math.round(imageWidth)),
      height: Math.max(1, Math.round(imageHeight)),
    };
  }
  return {
    width: available,
    height: Math.max(1, Math.round(imageHeight * (available / imageWidth))),
  };
}

export function fitInside(width, height, maxWidth, maxHeight) {
  if (!width || !height) {
    return { width: evenSize(maxWidth), height: evenSize(maxHeight), scaled: false };
  }
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: evenSize(width * scale),
    height: evenSize(height * scale),
    scaled: scale < 0.999,
  };
}
