import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amberRingMessage,
  approachGuidanceText,
  isPickupAligned,
  pickupAlignmentMessage,
  PICKUP_TOLERANCE_METERS,
} from "./handling.ts";

describe("pickup alignment", () => {
  it("accepts a small, deliberate horizontal and vertical tolerance", () => {
    assert.equal(isPickupAligned(0.2, -0.2), true);
    assert.equal(isPickupAligned(PICKUP_TOLERANCE_METERS, 0), false);
    assert.equal(isPickupAligned(0, PICKUP_TOLERANCE_METERS), false);
  });

  it("gives separate centering and raise/lower cues near the load", () => {
    assert.equal(pickupAlignmentMessage("CRATE", 0.42, 0.35), "CRATE: 0.42 m off center; raise 0.35 m.");
    assert.equal(pickupAlignmentMessage("BEAM", 0.1, -0.5), "BEAM: centered; lower 0.50 m.");
  });
});

describe("amber ring guidance", () => {
  it("confirms when the hook is inside the target ring", () => {
    assert.equal(amberRingMessage(1.2), "Inside amber ring. Lower carefully.");
  });

  it("reports how far away the set zone is before lowering", () => {
    assert.equal(
      amberRingMessage(3.26),
      "Amber ring 3.3 m away. Move the load over it before lowering.",
    );
  });
});

describe("directional approach guidance", () => {
  it("maps positive offsets to right, out, and up corrections", () => {
    assert.equal(
      approachGuidanceText(1, 3, 0.6),
      "SLEW RIGHT 18° · BOOM OUT 3.0 m · HOOK UP 0.6 m",
    );
  });

  it("maps negative offsets to left, in, and down corrections", () => {
    assert.equal(
      approachGuidanceText(-1, -2, -0.5),
      "SLEW LEFT 153° · BOOM IN 2.0 m · HOOK DOWN 0.5 m",
    );
  });

  it("suppresses corrections inside the pickup window", () => {
    assert.equal(approachGuidanceText(0.1, -0.2, 0.29), "TARGET CENTERED");
  });
});
