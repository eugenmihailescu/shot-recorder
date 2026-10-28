import assert from "node:assert/strict";
import test from "node:test";
import { annotationContains, hitAnnotation, translateAnnotation } from "../src/editor/tools.js";

const rect = { type: "rect", x: 10, y: 20, w: 40, h: 30, width: 4 };
const pen = { type: "pen", width: 4, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }] };
const arrow = { type: "arrow", x1: 0, y1: 0, x2: 100, y2: 0, width: 4 };

test("hits the topmost drawing under the pointer", () => {
  assert.equal(annotationContains(null, rect, { x: 20, y: 30 }), true);
  assert.equal(annotationContains(null, rect, { x: 200, y: 30 }), false);
  assert.equal(annotationContains(null, pen, { x: 50, y: 20 }), true);
  assert.equal(annotationContains(null, pen, { x: 10, y: 30 }), false);
  assert.equal(annotationContains(null, arrow, { x: 50, y: 2 }), true);
  assert.equal(annotationContains(null, arrow, { x: 50, y: 40 }), false);
  assert.equal(annotationContains(null, { type: "ellipse", x: 0, y: 0, w: 100, h: 40, width: 4 }, { x: 50, y: 20 }), true);
  assert.equal(annotationContains(null, { type: "ellipse", x: 0, y: 0, w: 100, h: 40, width: 4 }, { x: 0, y: 0 }), false);
  const stacked = [rect, { ...rect, x: 30 }];
  assert.equal(hitAnnotation(null, stacked, { x: 45, y: 30 }), 1);
});

test("moves every point of a drawing by the same amount", () => {
  const movedPen = translateAnnotation(pen, 5, -3);
  assert.deepEqual(movedPen.points, [{ x: 5, y: -3 }, { x: 55, y: -3 }, { x: 55, y: 37 }]);
  assert.deepEqual(pen.points[0], { x: 0, y: 0 });
  const movedArrow = translateAnnotation(arrow, 8, 2);
  assert.equal(movedArrow.x1, 8);
  assert.equal(movedArrow.y2, 2);
  const movedText = translateAnnotation({ type: "text", x: 4, y: 6, text: "Hi" }, 1, 1);
  assert.deepEqual({ x: movedText.x, y: movedText.y }, { x: 5, y: 7 });
});
