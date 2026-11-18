import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { RING_AMBER, RING_CONTRAST, RING_READY, gradeColor, gradeGlyph, ringColorHex } from "./ring-palette.ts";

const source = readFileSync(new URL("./CraneYard.tsx", import.meta.url), "utf8");

describe("dev probe hygiene", () => {
  it("only assigns the controls probe behind the DEV guard", () => {
    const guard = source.indexOf("if (import.meta.env.DEV)");
    const assignment = source.indexOf("window.__controlsTest =");
    assert.ok(guard >= 0, "the DEV guard is missing");
    assert.ok(assignment > guard, "the probe is assigned outside the DEV guard");
  });

  it("assigns the probe in exactly one place", () => {
    const matches = source.match(/window\.__controlsTest\s*=/g) ?? [];
    assert.equal(matches.length, 1);
  });

  it("removes the probe on teardown", () => {
    assert.match(source, /delete window\.__controlsTest/);
  });
});

describe("set ring palette", () => {
  it("is amber until the set is on the mark", () => {
    assert.equal(ringColorHex(false, false), "ffb02e");
    assert.equal(ringColorHex(false, true), "35e8ff");
  });

  it("turns green on the mark", () => {
    assert.equal(ringColorHex(true, false), "7dffa8");
  });

  it("keeps the contrast ring ahead of the ready colour", () => {
    assert.equal(ringColorHex(true, true), "35e8ff");
    assert.notEqual(RING_CONTRAST, RING_READY);
    assert.notEqual(RING_AMBER, RING_READY);
  });

  it("gives every grade its own glyph as well as a colour", () => {
    const glyphs = (["S", "A", "B", "C"] as const).map(gradeGlyph);
    assert.equal(new Set(glyphs).size, 4);
    const colors = (["S", "A", "B", "C"] as const).map(gradeColor);
    assert.equal(new Set(colors).size, 4);
  });
});
