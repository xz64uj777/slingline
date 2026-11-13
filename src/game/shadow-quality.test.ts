import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SHADOW_MAP_SIZE, shadowQualityFor, type DeviceProfile } from "./shadow-quality.ts";

const desktop: DeviceProfile = {
  width: 1440,
  coarsePointer: false,
  memory: 8,
  cores: 8,
  saveData: false,
};

describe("shadow quality tiers", () => {
  it("gives a capable desktop the full soft shadow map", () => {
    assert.equal(shadowQualityFor(desktop), "high");
    assert.equal(SHADOW_MAP_SIZE.high, 2048);
  });

  it("halves the low tier against the old phone default", () => {
    assert.equal(shadowQualityFor({ ...desktop, width: 390, coarsePointer: true }), "low");
    assert.equal(shadowQualityFor({ ...desktop, width: 640 }), "low");
    assert.equal(shadowQualityFor({ ...desktop, memory: 4 }), "low");
    assert.equal(SHADOW_MAP_SIZE.low, 512);
    assert.ok(SHADOW_MAP_SIZE.low < SHADOW_MAP_SIZE.high / 2);
  });

  it("skips the shadow pass on hardware that cannot afford it", () => {
    assert.equal(shadowQualityFor({ ...desktop, memory: 2 }), "off");
    assert.equal(shadowQualityFor({ ...desktop, cores: 2 }), "off");
    assert.equal(shadowQualityFor({ ...desktop, saveData: true, memory: 16, cores: 16 }), "off");
  });

  it("treats a touch-first tablet as low even on a wide screen", () => {
    assert.equal(shadowQualityFor({ ...desktop, width: 1024, coarsePointer: true }), "low");
  });
});
