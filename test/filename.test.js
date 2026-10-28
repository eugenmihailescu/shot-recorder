import assert from "node:assert/strict";
import test from "node:test";
import { formatRecordingName, formatShotName, sanitizeDirectory } from "../src/lib/filename.js";

const settings = { dateOrder: "ymd", hourClock: "24" };
const date = new Date(2026, 9, 26, 23, 15, 5);

test("formats a 24-hour year-first still name", () => {
  assert.equal(formatShotName(date, settings, "png"), "shot-20261026-231505.png");
});

test("formats day-first and 12-hour names", () => {
  assert.equal(
    formatShotName(date, { dateOrder: "dmy", hourClock: "12" }, "jpg"),
    "shot-26102026-111505pm.jpg",
  );
  assert.equal(
    formatShotName(date, { dateOrder: "mdy", hourClock: "24" }, "png"),
    "shot-10262026-231505.png",
  );
  assert.equal(
    formatShotName(new Date(2026, 9, 26, 0, 5, 5), { dateOrder: "ymd", hourClock: "12" }, "png"),
    "shot-20261026-120505am.png",
  );
  assert.equal(
    formatShotName(new Date(2026, 9, 26, 12, 5, 5), { dateOrder: "ymd", hourClock: "12" }, "png"),
    "shot-20261026-120505pm.png",
  );
});

test("prefixes recordings and keeps the clock", () => {
  assert.equal(formatRecordingName(date, settings, "webm"), "recording-20261026-231505.webm");
});

test("sanitizes the download folder", () => {
  assert.equal(sanitizeDirectory("Awesome Screenshot"), "AwesomeScreenshot");
  assert.equal(sanitizeDirectory("../etc"), "etc");
  assert.equal(sanitizeDirectory("/ShotRecorder/"), "ShotRecorder");
  assert.equal(sanitizeDirectory("   "), "ShotRecorder");
});
