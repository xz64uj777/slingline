import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coachChecklist, coachPrompt, coachStage, type CoachInput } from "./coach.ts";

const base: CoachInput = {
  state: "driving",
  usesOutriggers: true,
  outrigger: 0,
  attached: false,
  landed: false,
  canRelease: false,
  phase: "seek",
  hookReady: false,
  hookGap: 20,
  spotMeters: 20,
  tolerance: 2.4,
};

describe("first-shift coaching", () => {
  it("asks for pads before the load moves", () => {
    assert.equal(coachStage(base), "waiting");
    const lifting = { ...base, state: "lifting" };
    assert.equal(coachStage(lifting), "deploy");
    assert.match(coachPrompt(lifting).title, /Pads/);
  });

  it("moves through pickup, carry and set", () => {
    const lifting = { ...base, state: "lifting", outrigger: 1 };
    assert.equal(coachStage(lifting), "pickup");
    assert.equal(coachStage({ ...lifting, hookReady: true }), "pickup");
    assert.equal(coachStage({ ...lifting, attached: true }), "carry");
    assert.equal(coachStage({ ...lifting, attached: true, landed: true, canRelease: true }), "set");
    assert.equal(coachStage({ ...lifting, phase: "done" }), "done");
  });

  it("does not demand pads from a crawler", () => {
    const crawler = { ...base, state: "lifting", usesOutriggers: false, hookReady: true };
    assert.equal(coachStage(crawler), "pickup");
  });

  it("ticks the checklist in order", () => {
    const lifting = { ...base, state: "lifting" };
    assert.deepEqual(coachChecklist(lifting).map((item) => item.done), [false, false, false]);
    const done = coachChecklist({ ...lifting, outrigger: 1, attached: true, phase: "done" });
    assert.deepEqual(done.map((item) => item.done), [true, true, true]);
  });
});
