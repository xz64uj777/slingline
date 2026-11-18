import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gradeBreakdown, gradeCost, gradePay, gradeRep, gradeSet, gradeTip, worstPart, type SetMetrics } from "./grade.ts";

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

  it("grades a heading against the job's guides only when the call asks for one", () => {
    const square = { ...CLEAN, heading: 0, headingTolerance: 10 };
    assert.equal(gradeSet(square), "S");
    assert.equal(gradeSet({ ...square, heading: 3 }), "S");
    assert.equal(gradeSet({ ...square, heading: 8 }), "B");
    assert.equal(gradeSet({ ...square, heading: 14 }), "C");
    // An ordinary call has no heading row to grade.
    assert.equal("heading" in gradeBreakdown(CLEAN), false);

    // A pipe on two saddles is graded on the ring and the span at once: a
    // clean landing does not excuse a load that is crosswise to the saddles.
    const culvert = { ...CLEAN, tolerance: 0.7, off: 0.05, heading: 14, headingTolerance: 12 };
    assert.equal(gradeBreakdown(culvert).off, "S");
    assert.equal(gradeBreakdown(culvert).heading, "C");
    assert.equal(gradeSet(culvert), "C");
  });

  it("lets an off-square panel decide the set and says so in the debrief", () => {
    const square = { ...CLEAN, heading: 22, headingTolerance: 10 };
    assert.equal(worstPart(gradeBreakdown(square)), "heading");
    assert.equal(gradeCost(square).label, "HEADING");
    assert.match(gradeTip(square), /guides|square/i);
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

describe("grade feedback", () => {
  it("scores each reading on its own", () => {
    const parts = gradeBreakdown({ ...CLEAN, off: 1.6, tolerance: 1.1 });
    assert.equal(parts.off, "C");
    assert.equal(parts.impact, "S");
    assert.equal(parts.sway, "S");
    assert.equal(parts.chart, "S");
  });

  it("names the reading that decided the set", () => {
    const ringSet = { ...CLEAN, off: 1.6, tolerance: 1.1 };
    assert.equal(worstPart(gradeBreakdown(ringSet)), "off");
    assert.equal(gradeCost(ringSet).label, "RING");

    const swinging = { ...CLEAN, sway: 7 };
    assert.equal(worstPart(gradeBreakdown(swinging)), "sway");
    assert.equal(gradeCost(swinging).label, "SWAY");
  });

  it("coaches the worst reading and congratulates a clean set", () => {
    assert.match(gradeTip({ ...CLEAN, chart: 1.2 }), /chart|boom/i);
    assert.match(gradeTip({ ...CLEAN, off: 2, tolerance: 1 }), /mark|lower/i);
    assert.match(gradeTip(CLEAN), /reference set/i);
  });
});
