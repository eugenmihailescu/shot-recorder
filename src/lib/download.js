import { sanitizeDirectory } from "./filename.js";

export function blobFromDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mime = /:(.*?);/.exec(meta)?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function dataUrlFromBytes(bytes, type = "image/png") {
  const parts = [];
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
  }
  return `data:${type};base64,${btoa(parts.join(""))}`;
}

export async function canvasToBlob(canvas, settings) {
  const type = settings.imageType === "jpeg" ? "image/jpeg" : "image/png";
  const quality = settings.imageType === "jpeg" ? settings.jpegQuality : undefined;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error("Could not encode the image.");
  return blob;
}

export async function encodeStill(blob, settings) {
  if (settings.imageType !== "jpeg") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvasToBlob(canvas, settings);
}

export async function downloadBlob(blob, filename, directory) {
  const url = URL.createObjectURL(blob);
  const path = `${sanitizeDirectory(directory)}/${filename}`;
  try {
    const id = await chrome.downloads.download({
      url,
      filename: path,
      saveAs: false,
      conflictAction: "uniquify",
    });
    await new Promise((resolve) => {
      const onChanged = (delta) => {
        if (delta.id !== id || !delta.state) return;
        if (delta.state.current === "complete" || delta.state.current === "interrupted") {
          chrome.downloads.onChanged.removeListener(onChanged);
          resolve();
        }
      };
      chrome.downloads.onChanged.addListener(onChanged);
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

