import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QualityGovernor, SAMPLE_SIZE, median, qualityAdvice } from "./quality.ts";

describe("quality governor", () => {
  it("computes a median", () => {
    assert.equal(median([]), 0);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
  });

  it("holds until a full window is sampled", () => {
    assert.equal(qualityAdvice(Array.from({ length: SAMPLE_SIZE - 1 }, () => 60)), "hold");
  });

  it("drops when the window is consistently slow", () => {
    assert.equal(qualityAdvice(Array.from({ length: SAMPLE_SIZE }, () => 40)), "drop");
  });

  it("ignores one long frame in a smooth window", () => {
    const frames = Array.from({ length: SAMPLE_SIZE }, () => 16);
    frames[10] = 300;
    assert.equal(qualityAdvice(frames), "hold");
  });

  it("drops once and stays dropped", () => {
    const governor = new QualityGovernor();
    let dropped = false;
    for (let i = 0; i < 400; i += 1) {
      if (governor.sample(0.04, 3000 + i * 40)) dropped = true;
    }
    assert.equal(dropped, true);
    assert.equal(governor.didDrop, true);
    assert.equal(governor.sample(0.04, 99999), false);
  });

  it("ignores startup frames", () => {
    const governor = new QualityGovernor();
    for (let i = 0; i < 200; i += 1) governor.sample(0.09, 100 + i * 9);
    assert.equal(governor.didDrop, false);
  });
});
