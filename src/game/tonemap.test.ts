import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { acesFilmic } from "./tonemap.ts";

describe("ACES filmic clear colour", () => {
  it("keeps black at black", () => {
    assert.deepEqual(acesFilmic([0, 0, 0], 1.1), [0, 0, 0]);
  });

  it("matches the shader curve for the day sky", () => {
    // 0xd7e3ec in linear-sRGB, exposure 1.1.
    const [r, g, b] = acesFilmic([0.69, 0.77, 0.85], 1.1);
    assert.ok(Math.abs(r - 0.696) < 0.01, `r ${r}`);
    assert.ok(Math.abs(g - 0.722) < 0.01, `g ${g}`);
    assert.ok(Math.abs(b - 0.744) < 0.01, `b ${b}`);
  });

  it("rolls highlights off instead of clipping them", () => {
    const [r, g, b] = acesFilmic([4, 4, 4], 1.1);
    assert.ok(r < 1 && g < 1 && b < 1);
    assert.ok(r > 0.8 && g > 0.8 && b > 0.8);
  });

  it("is monotonic and exposure-scaling", () => {
    const dim = acesFilmic([0.3, 0.3, 0.3], 1.1)[0];
    const bright = acesFilmic([0.6, 0.6, 0.6], 1.1)[0];
    const exposed = acesFilmic([0.3, 0.3, 0.3], 2.2)[0];
    assert.ok(bright > dim);
    assert.ok(exposed > dim);
  });

  it("keeps the night sky dark rather than lifting it", () => {
    const [r, g, b] = acesFilmic([0.005, 0.008, 0.012], 1.1);
    assert.ok(r < 0.05 && g < 0.05 && b < 0.05);
  });
});
