import { sanitizeDirectory } from "./filename.js";

export const DEFAULT_SETTINGS = {
  visibleDelaySec: 3,
  desktopDelaySec: 0,
  imageType: "png",
  jpegQuality: 0.92,
  downloadDirectory: "ShotRecorder",
  dateOrder: "ymd",
  hourClock: "24",
  openEditor: true,
  alsoDownload: false,
  countdownSec: 3,
  videoFormat: "webm",
  maxResolution: "1080",
  microphone: false,
  tabSound: true,
  tool: {
    color: "#e23b2f",
    strokeWidth: 4,
    strokeOpacity: 100,
    highlightColor: "#ffe14a",
    highlightWidth: 18,
    highlightOpacity: 40,
    shapeColor: "#e23b2f",
    shapeWidth: 4,
    shapeOpacity: 100,
    font: "Arial",
    fontSize: 28,
    textColor: "#111111",
    textBg: "#ffffff",
    textBgOpacity: 0,
    textShadow: false,
    shadowBlur: 8,
    blurRadius: 8,
    keepAspect: true,
    stepFill: "#e23b2f",
    stepColor: "#ffffff",
    stepSize: 36,
    stepStart: 1,
  },
};

export const RESOLUTION_BOX = {
  720: { width: 1280, height: 720 },
  1080: { width: 1920, height: 1080 },
  2160: { width: 3840, height: 2160 },
};

function clampInt(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function normalizeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const tool = { ...DEFAULT_SETTINGS.tool, ...(source.tool || {}) };
  const maxResolution = RESOLUTION_BOX[source.maxResolution] ? String(source.maxResolution) : DEFAULT_SETTINGS.maxResolution;
  return {
    visibleDelaySec: clampInt(source.visibleDelaySec, 0, 10, DEFAULT_SETTINGS.visibleDelaySec),
    desktopDelaySec: clampInt(source.desktopDelaySec, 0, 10, DEFAULT_SETTINGS.desktopDelaySec),
    imageType: source.imageType === "jpeg" ? "jpeg" : "png",
    jpegQuality: Math.min(1, Math.max(0.5, Number(source.jpegQuality) || DEFAULT_SETTINGS.jpegQuality)),
    downloadDirectory: sanitizeDirectory(
      typeof source.downloadDirectory === "string" ? source.downloadDirectory : DEFAULT_SETTINGS.downloadDirectory,
    ),
    dateOrder: ["ymd", "dmy", "mdy"].includes(source.dateOrder) ? source.dateOrder : DEFAULT_SETTINGS.dateOrder,
    hourClock: source.hourClock === "12" ? "12" : "24",
    openEditor: source.openEditor !== false,
    alsoDownload: source.alsoDownload === true,
    countdownSec: clampInt(source.countdownSec, 0, 10, DEFAULT_SETTINGS.countdownSec),
    videoFormat: source.videoFormat === "mp4" ? "mp4" : "webm",
    maxResolution,
    microphone: source.microphone === true,
    tabSound: source.tabSound !== false,
    tool: {
      color: tool.color || DEFAULT_SETTINGS.tool.color,
      strokeWidth: clampInt(tool.strokeWidth, 1, 64, DEFAULT_SETTINGS.tool.strokeWidth),
      strokeOpacity: clampInt(tool.strokeOpacity, 0, 100, DEFAULT_SETTINGS.tool.strokeOpacity),
      highlightColor: tool.highlightColor || DEFAULT_SETTINGS.tool.highlightColor,
      highlightWidth: clampInt(tool.highlightWidth, 1, 80, DEFAULT_SETTINGS.tool.highlightWidth),
      highlightOpacity: clampInt(tool.highlightOpacity, 0, 100, DEFAULT_SETTINGS.tool.highlightOpacity),
      shapeColor: tool.shapeColor || DEFAULT_SETTINGS.tool.shapeColor,
      shapeWidth: clampInt(tool.shapeWidth, 1, 64, DEFAULT_SETTINGS.tool.shapeWidth),
      shapeOpacity: clampInt(tool.shapeOpacity, 0, 100, DEFAULT_SETTINGS.tool.shapeOpacity),
      font: tool.font || DEFAULT_SETTINGS.tool.font,
      fontSize: clampInt(tool.fontSize, 8, 240, DEFAULT_SETTINGS.tool.fontSize),
      textColor: tool.textColor || DEFAULT_SETTINGS.tool.textColor,
      textBg: /^#[0-9a-fA-F]{6}$/.test(tool.textBg) ? tool.textBg : "#ffffff",
      textBgOpacity: clampInt(tool.textBgOpacity, 0, 100, 0),
      textShadow: tool.textShadow === true,
      shadowBlur: clampInt(tool.shadowBlur, 0, 40, DEFAULT_SETTINGS.tool.shadowBlur),
      blurRadius: clampInt(tool.blurRadius, 2, 40, DEFAULT_SETTINGS.tool.blurRadius),
      keepAspect: tool.keepAspect !== false,
      stepFill: tool.stepFill || DEFAULT_SETTINGS.tool.stepFill,
      stepColor: tool.stepColor || DEFAULT_SETTINGS.tool.stepColor,
      stepSize: clampInt(tool.stepSize, 16, 96, DEFAULT_SETTINGS.tool.stepSize),
      stepStart: clampInt(tool.stepStart, 1, 9999, DEFAULT_SETTINGS.tool.stepStart),
    },
  };
}

// Popup choices for one recording. Missing or unknown fields stay out of
// the query so a keyboard shortcut keeps the saved options.
export function recordingChoiceParams(choices) {
  const params = new URLSearchParams();
  const source = choices && typeof choices === "object" ? choices : {};
  if (source.format === "webm" || source.format === "mp4") params.set("format", source.format);
  if (source.size === "720" || source.size === "1080" || source.size === "2160") params.set("size", source.size);
  if (source.mic === "0" || source.mic === "1") params.set("mic", source.mic);
  if (source.sound === "0" || source.sound === "1") params.set("sound", source.sound);
  return params;
}

export function recordingChoicesFromSearch(search) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(typeof search === "string" ? search : "");
  const choices = {};
  const format = params.get("format");
  if (format === "webm" || format === "mp4") choices.videoFormat = format;
  const size = params.get("size");
  if (RESOLUTION_BOX[size]) choices.maxResolution = size;
  const mic = params.get("mic");
  if (mic === "0" || mic === "1") choices.microphone = mic === "1";
  const sound = params.get("sound");
  if (sound === "0" || sound === "1") choices.tabSound = sound === "1";
  return choices;
}

// Session overrides for one recording. Does not write storage.
export function applyRecordingChoices(settings, choices) {
  const base = normalizeSettings(settings);
  const source = choices && typeof choices === "object" ? choices : {};
  const patch = {};
  if (source.videoFormat === "webm" || source.videoFormat === "mp4") patch.videoFormat = source.videoFormat;
  if (RESOLUTION_BOX[source.maxResolution]) patch.maxResolution = String(source.maxResolution);
  if (typeof source.microphone === "boolean") patch.microphone = source.microphone;
  if (typeof source.tabSound === "boolean") patch.tabSound = source.tabSound;
  if (!Object.keys(patch).length) return base;
  return normalizeSettings({ ...base, ...patch });
}

export async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  return normalizeSettings(stored.settings);
}

export async function saveSettings(next) {
  const settings = normalizeSettings(next);
  await chrome.storage.local.set({ settings });
  return settings;
}
