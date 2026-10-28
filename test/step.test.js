import assert from "node:assert/strict";
import test from "node:test";
import {
  annotationBounds,
  annotationContains,
  clampStepStart,
  nextStepNumber,
  paintSteps,
  renumberSteps,
  translateAnnotation,
} from "../src/editor/tools.js";

const marker = (n, x = n * 10) => ({ type: "step", x, y: 40, n, size: 36, fill: "#e23b2f", color: "#ffffff" });

test("the next step number continues the sequence or uses the start", () => {
  assert.equal(nextStepNumber([], 5), 5);
  assert.equal(nextStepNumber([{ type: "rect", x: 0, y: 0 }], 3), 3);
  assert.equal(nextStepNumber([marker(5), marker(6)], 1), 7);
  assert.equal(nextStepNumber([marker(2)], 9), 3);
  assert.equal(clampStepStart("nope"), 1);
  assert.equal(clampStepStart(0), 1);
  assert.equal(clampStepStart(4.6), 5);
  assert.equal(clampStepStart(10000), 9999);
});

test("deleting a step closes the gap and keeps a custom start", () => {
  const mixed = [marker(1, 1), { type: "rect", x: 0, y: 0, w: 4, h: 4 }, marker(2, 2), marker(3, 3)];
  const withoutFirst = renumberSteps(mixed.filter((item) => item.n !== 1), 1);
  assert.deepEqual(withoutFirst.map((item) => (item.type === "step" ? item.n : item.type)), ["rect", 1, 2]);
  assert.equal(mixed[2].n, 2);

  const custom = [marker(5), marker(6), marker(7)];
  assert.deepEqual(renumberSteps(custom.filter((_, index) => index !== 0), 5).map((item) => item.n), [5, 6]);

  const tied = [{ type: "step", n: 4, id: "a" }, { type: "step", n: 4, id: "b" }];
  assert.deepEqual(renumberSteps(tied, 1).map((item) => [item.id, item.n]), [["a", 1], ["b", 2]]);
});

test("style changes touch every step and leave other drawings alone", () => {
  const mixed = [marker(1), { type: "rect", fill: "#111111" }];
  const painted = paintSteps(mixed, { fill: "#1f6feb", color: "#111111", size: 52 });
  assert.equal(painted[0].fill, "#1f6feb");
  assert.equal(painted[0].size, 52);
  assert.equal(painted[0].n, 1);
  assert.equal(painted[1].fill, "#111111");
  assert.equal(mixed[0].fill, "#e23b2f");
});

test("a step is hit inside its circle and moves from its center", () => {
  const step = marker(1, 100);
  assert.equal(annotationContains(null, step, { x: 100, y: 40 }), true);
  assert.equal(annotationContains(null, step, { x: 122, y: 40 }), true);
  assert.equal(annotationContains(null, step, { x: 123, y: 40 }), false);
  assert.deepEqual(annotationBounds(null, step), { x: 82, y: 22, w: 36, h: 36 });
  const moved = translateAnnotation(step, 5, -4);
  assert.deepEqual({ x: moved.x, y: moved.y, n: moved.n }, { x: 105, y: 36, n: 1 });
  assert.equal(step.x, 100);
});
