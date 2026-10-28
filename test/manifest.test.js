import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pageAllowsScripting } from "../src/lib/pages.js";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

test("manifest stays on-click", () => {
  assert.deepEqual(
    [...manifest.permissions].sort(),
    ["activeTab", "downloads", "scripting", "storage", "tabCapture"],
  );
  assert.equal(Object.hasOwn(manifest, "host_permissions"), false);
  assert.equal(Object.hasOwn(manifest, "content_scripts"), false);
  assert.equal(manifest.background.type, "module");
});

test("scripting is limited to web and file pages", () => {
  assert.equal(pageAllowsScripting("https://example.com/path"), true);
  assert.equal(pageAllowsScripting("http://localhost:3000/"), true);
  assert.equal(pageAllowsScripting("file:///tmp/page.html"), true);
  assert.equal(pageAllowsScripting("brave://extensions"), false);
  assert.equal(pageAllowsScripting("chrome://newtab/"), false);
  assert.equal(pageAllowsScripting("chrome-extension://abc/page.html"), false);
  assert.equal(pageAllowsScripting(""), false);
});
