import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRecordingChoices,
  normalizeSettings,
  recordingChoiceParams,
  recordingChoicesFromSearch,
} from "../src/lib/settings.js";

test("normalizeSettings clamps capture options and cleans the folder", () => {
  const settings = normalizeSettings({
    downloadDirectory: "../Shot Recorder/",
    jpegQuality: 2,
    visibleDelaySec: 99,
    desktopDelaySec: -4,
    videoFormat: "mp4",
    maxResolution: "2160",
    hourClock: "12",
    dateOrder: "dmy",
    openEditor: false,
    alsoDownload: true,
  });
  assert.equal(settings.downloadDirectory, "ShotRecorder");
  assert.equal(settings.jpegQuality, 1);
  assert.equal(settings.visibleDelaySec, 10);
  assert.equal(settings.desktopDelaySec, 0);
  assert.equal(settings.videoFormat, "mp4");
  assert.equal(settings.maxResolution, "2160");
  assert.equal(settings.hourClock, "12");
  assert.equal(settings.dateOrder, "dmy");
  assert.equal(settings.openEditor, false);
  assert.equal(settings.alsoDownload, true);
  assert.equal(settings.microphone, false);
  assert.equal(settings.tabSound, true);
  assert.equal(settings.tool.textBg, "#ffffff");
  assert.equal(settings.tool.textBgOpacity, 0);
});

test("text background opacity stays between 0 and 100", () => {
  const settings = normalizeSettings({ tool: { textBg: "transparent", textBgOpacity: 140 } });
  assert.equal(settings.tool.textBg, "#ffffff");
  assert.equal(settings.tool.textBgOpacity, 100);
});

test("stroke opacity defaults to solid shapes and a translucent highlight", () => {
  const settings = normalizeSettings({});
  assert.equal(settings.tool.strokeOpacity, 100);
  assert.equal(settings.tool.shapeOpacity, 100);
  assert.equal(settings.tool.highlightOpacity, 40);
});

test("step markers default to a red circle with white digits", () => {
  const settings = normalizeSettings({});
  assert.equal(settings.tool.stepFill, "#e23b2f");
  assert.equal(settings.tool.stepColor, "#ffffff");
  assert.equal(settings.tool.stepSize, 36);
  assert.equal(settings.tool.stepStart, 1);
});

test("step size and start stay in range", () => {
  const low = normalizeSettings({ tool: { stepSize: 4, stepStart: 0 } });
  assert.equal(low.tool.stepSize, 16);
  assert.equal(low.tool.stepStart, 1);
  const high = normalizeSettings({ tool: { stepSize: 200, stepStart: 99999 } });
  assert.equal(high.tool.stepSize, 96);
  assert.equal(high.tool.stepStart, 9999);
});

test("a popup recording choice overrides format, size, and audio for that take", () => {
  const saved = normalizeSettings({
    videoFormat: "webm",
    maxResolution: "1080",
    microphone: false,
    tabSound: true,
    countdownSec: 3,
    downloadDirectory: "ShotRecorder",
  });
  const query = recordingChoiceParams({ format: "mp4", size: "720", mic: "1", sound: "0" });
  const next = applyRecordingChoices(saved, recordingChoicesFromSearch(query));
  assert.equal(query.toString(), "format=mp4&size=720&mic=1&sound=0");
  assert.equal(next.videoFormat, "mp4");
  assert.equal(next.maxResolution, "720");
  assert.equal(next.microphone, true);
  assert.equal(next.tabSound, false);
  assert.equal(next.countdownSec, 3);
  assert.equal(next.downloadDirectory, "ShotRecorder");
  assert.equal(saved.videoFormat, "webm");
  assert.equal(saved.microphone, false);
});

test("a recording opened without popup choices keeps the saved options", () => {
  const saved = normalizeSettings({
    videoFormat: "mp4",
    maxResolution: "2160",
    microphone: true,
    tabSound: false,
  });
  const next = applyRecordingChoices(saved, recordingChoicesFromSearch(""));
  assert.equal(recordingChoiceParams({}).toString(), "");
  assert.equal(next.videoFormat, "mp4");
  assert.equal(next.maxResolution, "2160");
  assert.equal(next.microphone, true);
  assert.equal(next.tabSound, false);
});

test("recording choices ignore unknown format, size, and audio values", () => {
  const saved = normalizeSettings({ videoFormat: "webm", maxResolution: "1080" });
  const query = recordingChoiceParams({ format: "gif", size: "999", mic: "yes", sound: "" });
  const next = applyRecordingChoices(saved, recordingChoicesFromSearch("?format=gif&size=999&mic=yes"));
  assert.equal(query.toString(), "");
  assert.equal(next.videoFormat, "webm");
  assert.equal(next.maxResolution, "1080");
  assert.equal(next.microphone, false);
  assert.equal(next.tabSound, true);
});

test("stroke opacity stays between 0 and 100", () => {
  const settings = normalizeSettings({
    tool: { strokeOpacity: -20, shapeOpacity: 140, highlightOpacity: 0 },
  });
  assert.equal(settings.tool.strokeOpacity, 0);
  assert.equal(settings.tool.shapeOpacity, 100);
  assert.equal(settings.tool.highlightOpacity, 0);
});
