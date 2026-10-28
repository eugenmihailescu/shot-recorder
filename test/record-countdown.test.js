import assert from "node:assert/strict";
import test from "node:test";
import { countdownFinishAction, recordCountdownPlan } from "../src/lib/record-countdown.js";

test("recording countdown matches the page widget, the badge, or no wait", () => {
  assert.deepEqual(recordCountdownPlan({ seconds: 3, scriptable: true }), { kind: "page", seconds: 3 });
  assert.deepEqual(recordCountdownPlan({ seconds: 3, scriptable: false }), { kind: "badge", seconds: 3 });
  assert.deepEqual(recordCountdownPlan({ seconds: 0, scriptable: true }), { kind: "immediate", seconds: 0 });
  assert.deepEqual(recordCountdownPlan({ seconds: 4.6, scriptable: true }), { kind: "page", seconds: 5 });
  assert.deepEqual(recordCountdownPlan({ seconds: 40, scriptable: true }), { kind: "page", seconds: 10 });
  assert.deepEqual(recordCountdownPlan({ seconds: -2, scriptable: false }), { kind: "immediate", seconds: 0 });
});

test("a recording countdown finishes by starting the recording", () => {
  assert.equal(countdownFinishAction("record"), "record");
  assert.equal(countdownFinishAction("still"), "still");
  assert.equal(countdownFinishAction(undefined), "still");
});
