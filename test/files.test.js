import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

test("manifest pages and icons exist", () => {
  const paths = [
    manifest.action.default_popup,
    manifest.background.service_worker,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
    "src/overlay/overlay.js",
    "src/capture/full-page.js",
    "src/capture/countdown.js",
    "src/capture/screen.html",
    "src/editor/editor.html",
    "src/record/recorder.html",
    "src/save/save.html",
    "src/message/message.html",
    "vendor/mp4-muxer.js",
    "vendor/NOTICE",
  ];
  for (const path of paths) {
    assert.equal(existsSync(new URL(path, root)), true, path);
  }
});

test("injected page scripts stay classic", () => {
  const paths = ["src/overlay/overlay.js", "src/capture/full-page.js", "src/capture/countdown.js"];
  for (const path of paths) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.equal(/\bimport\b|\bexport\b/.test(source), false, path);
  }
});
