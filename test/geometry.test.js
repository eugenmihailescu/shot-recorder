import assert from "node:assert/strict";
import test from "node:test";
import { arrowHead, fitInside, fitToWidth, normalizeRect, resizeWithAspect } from "../src/lib/geometry.js";

test("locks aspect ratio from the edited edge", () => {
  assert.deepEqual(resizeWithAspect(100, 50, 200, 50, "w", true), { width: 200, height: 100 });
  assert.deepEqual(resizeWithAspect(100, 50, 100, 25, "h", true), { width: 50, height: 25 });
  assert.deepEqual(resizeWithAspect(100, 50, 180, 40, "h", false), { width: 180, height: 40 });
});

test("rejects an edge outside 1 to 8000", () => {
  assert.deepEqual(resizeWithAspect(100, 50, 9000, 50, "w", false), { width: null, height: 50 });
  assert.deepEqual(resizeWithAspect(100, 50, 0, 50, "w", false), { width: null, height: 50 });
});

test("normalizes a rectangle dragged up and left", () => {
  assert.deepEqual(normalizeRect(40, 30, 10, 5), { x: 10, y: 5, w: 30, h: 25 });
});

test("builds an arrow head at the end of the shaft", () => {
  const head = arrowHead(0, 0, 100, 0, 4);
  assert.equal(head.length, 3);
  assert.deepEqual(head[0], { x: 100, y: 0 });
  assert.ok(head[1].x < 100);
  assert.ok(head[2].x < 100);
  assert.ok(head[1].y > 0);
  assert.ok(head[2].y < 0);
});

test("scales a wide capture down to the stage and leaves a narrower one alone", () => {
  assert.deepEqual(fitToWidth(1745, 7000, 1530), { width: 1530, height: 6138 });
  assert.deepEqual(fitToWidth(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(fitToWidth(1530, 400, 1530), { width: 1530, height: 400 });
});

test("fits a frame inside the selected box without upscaling", () => {
  assert.deepEqual(fitInside(3840, 2160, 1920, 1080), { width: 1920, height: 1080, scaled: true });
  assert.deepEqual(fitInside(800, 600, 1920, 1080), { width: 800, height: 600, scaled: false });
});
