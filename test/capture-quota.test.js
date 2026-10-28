import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE_GAP_MS, planCaptureSlot } from "../src/lib/capture-quota.js";

test("capture slots leave a gap and never bunch three calls into one second", () => {
  let reservedUntil = 0;
  let now = 0;
  const starts = [];
  for (let slice = 0; slice < 40; slice += 1) {
    const slot = planCaptureSlot(now, reservedUntil);
    starts.push(slot.startAt);
    reservedUntil = slot.reservedUntil;
    now = slot.startAt + 150;
  }
  for (let index = 1; index < starts.length; index += 1) {
    assert.ok(starts[index] - starts[index - 1] >= CAPTURE_GAP_MS);
  }
  for (const start of starts) {
    const inWindow = starts.filter((time) => time > start - 1000 && time <= start).length;
    assert.ok(inWindow <= 2);
  }
});

test("an early request waits for the reserved time", () => {
  const slot = planCaptureSlot(100, 600);
  assert.equal(slot.startAt, 600);
  assert.equal(slot.waitMs, 500);
  assert.equal(slot.reservedUntil, 1200);
});
