import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gradePay, gradeRep, gradeSet, type SetMetrics } from "./grade.ts";

const CLEAN: SetMetrics = {
  off: 0.1,
  tolerance: 2.4,
  impact: 0.1,
  impactLimit: 5,
  sway: 0.4,
  chart: 0.7,
};

describe("set grading", () => {
  it("gives a clean set an S", () => {
    assert.equal(gradeSet(CLEAN), "S");
    assert.ok(gradePay("S") > 1);
    assert.equal(gradeRep("S"), 2);
  });

  it("grades the landing against the job's ring", () => {
    // 1.6 m off is a fine yard move and a missed steel set.
    assert.equal(gradeSet({ ...CLEAN, off: 1.6, tolerance: 2.4 }), "B");
    assert.equal(gradeSet({ ...CLEAN, off: 1.6, tolerance: 1.1 }), "C");
    assert.equal(gradeSet({ ...CLEAN, off: 0.2, tolerance: 1.1 }), "S");
  });

  it("takes the worst of the four readings, not the average", () => {
    assert.equal(gradeSet({ ...CLEAN, sway: 7 }), "B");
    assert.equal(gradeSet({ ...CLEAN, sway: 7, chart: 0.98 }), "B");
    assert.equal(gradeSet({ ...CLEAN, chart: 0.95 }), "B");
    assert.equal(gradeSet({ ...CLEAN, chart: 1.2 }), "C");
  });

  it("scales impact against the mode's limit", () => {
    // The same touchdown speed is careless in easy and a near miss in hard.
    assert.equal(gradeSet({ ...CLEAN, impact: 1.2, impactLimit: 5 }), "A");
    assert.equal(gradeSet({ ...CLEAN, impact: 1.2, impactLimit: 1.45 }), "C");
  });

  it("pays more for a better grade and never less than the contract floor", () => {
    assert.ok(gradePay("S") > gradePay("A"));
    assert.ok(gradePay("A") > gradePay("B"));
    assert.equal(gradePay("B"), 1);
    assert.ok(gradePay("C") < 1);
    assert.equal(gradeRep("B"), 0);
    assert.equal(gradeRep("C"), 0);
  });
});
