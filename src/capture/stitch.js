export const MAX_SLICES = 40;
export const MAX_CSS_HEIGHT = 30000;
export const MAX_DEVICE_HEIGHT = 16384;

export function maxCaptureCssHeight(dpr, viewportCss, capCss = MAX_CSS_HEIGHT, capDevice = MAX_DEVICE_HEIGHT) {
  const byDevice = Math.floor(capDevice / Math.max(dpr || 1, 1));
  return Math.max(Math.round(viewportCss) || 1, Math.min(capCss, byDevice));
}

export function planDocumentBands(totalHeight, viewportHeight, maxHeight = MAX_CSS_HEIGHT, maxSlices = MAX_SLICES) {
  const total = Math.max(0, Math.round(totalHeight));
  const limit = Math.min(total, Math.max(1, Math.round(maxHeight)));
  const viewport = Math.max(1, Math.round(viewportHeight));
  const bands = [];
  let covered = 0;
  while (covered < limit && bands.length < maxSlices) {
    const scrollTop = Math.min(covered, Math.max(0, limit - viewport));
    const srcY = covered - scrollTop;
    const srcH = Math.min(viewport - srcY, limit - covered);
    if (srcH <= 0) break;
    bands.push({
      scrollTop,
      srcY,
      srcH,
      destY: covered,
    });
    const next = covered + srcH;
    if (next <= covered) break;
    covered = next;
  }
  return {
    bands,
    covered,
    truncated: covered + 1 < total,
  };
}
