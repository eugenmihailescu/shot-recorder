import assert from "node:assert/strict";
import test from "node:test";
import { CONTROL_WINDOW, SHARE_RECORD_WINDOW, SHARE_STILL_WINDOW, shareWindowOverflow } from "../src/lib/share-window.js";
import { canFloatControls } from "../src/record/on-top.js";

test("share windows match the measured Brave picker card", () => {
  assert.equal(SHARE_STILL_WINDOW.width, 622);
  assert.equal(SHARE_STILL_WINDOW.height, 504);
  assert.equal(SHARE_RECORD_WINDOW.width, 622);
  assert.equal(SHARE_RECORD_WINDOW.height, 575);
  assert.ok(SHARE_RECORD_WINDOW.height > SHARE_STILL_WINDOW.height);
  assert.ok(CONTROL_WINDOW.width < SHARE_STILL_WINDOW.width);
  assert.ok(CONTROL_WINDOW.height < SHARE_STILL_WINDOW.height);
});

test("a share window larger than the card snaps back to the card", () => {
  assert.deepEqual(
    shareWindowOverflow({ state: "normal", width: 1000, height: 800 }, SHARE_STILL_WINDOW),
    { width: SHARE_STILL_WINDOW.width, height: SHARE_STILL_WINDOW.height, state: "normal" },
  );
  assert.equal(shareWindowOverflow({ state: "normal", width: 622, height: 700 }, SHARE_STILL_WINDOW).height, 504);
  assert.equal(shareWindowOverflow({ state: "normal", width: 622, height: 504 }, SHARE_STILL_WINDOW), null);
  assert.equal(shareWindowOverflow({ state: "normal", width: 500, height: 400 }, SHARE_STILL_WINDOW), null);
  assert.equal(shareWindowOverflow({ state: "minimized", width: 1000, height: 800 }, SHARE_RECORD_WINDOW), null);
});

test("tab controls float only from a click when the browser offers a picture-in-picture window", () => {
  assert.equal(canFloatControls({ hasApi: true, activationActive: true }), true);
  assert.equal(canFloatControls({ hasApi: true, activationActive: false }), false);
  assert.equal(canFloatControls({ hasApi: false, activationActive: true }), false);
});
