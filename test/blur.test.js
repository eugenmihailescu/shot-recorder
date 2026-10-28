import assert from "node:assert/strict";
import test from "node:test";
import { blurBounds } from "../src/editor/tools.js";

test("blur sample stays on the selected pixels and inside the image", () => {
  const bounds = blurBounds(100, 80, { x: 10.2, y: 5.6, w: 20.4, h: 10.2 }, 8);
  assert.deepEqual(bounds, {
    x: 10,
    y: 5,
    w: 21,
    h: 11,
    srcX: 0,
    srcY: 0,
    srcW: 47,
    srcH: 32,
  });
});
