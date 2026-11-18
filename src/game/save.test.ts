import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freshCareer, readCareer, writeCareer, type CareerState } from "./career.ts";
import { decodeSave, describeSave, encodeSave } from "./save.ts";

function sample(): CareerState {
  return {
    ...freshCareer(),
    cash: 4321,
    status: "independent",
    reputation: 9,
    jobsDone: 6,
    upgrades: { ...freshCareer().upgrades, winch: 2, damping: 1 },
    wear: 37.5,
    bestRuns: {
      yard: { off: 0.4, tolerance: 2.4, impact: 0.6, impactLimit: 5, sway: 3, chart: 0.4, grade: "A", pay: 500 },
    },
    incidents: [{ kind: "tip", job: "roof", cost: 300, insurance: 40 }],
  };
}

describe("save text", () => {
  it("round trips a career", () => {
    const text = encodeSave(sample());
    assert.match(text, /^SLING1\./);
    assert.ok(!text.includes("\n"));
    const decoded = decodeSave(text);
    assert.equal(decoded.ok, true);
    if (!decoded.ok) return;
    assert.equal(decoded.state.cash, 4321);
    assert.equal(decoded.state.upgrades.winch, 2);
    assert.equal(decoded.state.wear, 37.5);
    assert.equal(decoded.state.bestRuns.yard?.grade, "A");
    assert.equal(decoded.state.incidents[0]?.kind, "tip");
  });

  it("rejects text that is not a save", () => {
    const noPrefix = decodeSave("hello");
    assert.equal(noPrefix.ok, false);
    if (!noPrefix.ok) assert.match(noPrefix.message, /SLING1/);
  });

  it("rejects a damaged payload", () => {
    const damaged = decodeSave("SLING1.not base64!!");
    assert.equal(damaged.ok, false);
  });

  it("rejects a version this build cannot read", () => {
    const text = encodeSave(sample());
    const json = JSON.stringify({ ...sample(), v: 99 });
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const forged = `SLING1.${btoa(binary)}`;
    assert.equal(text.length > 0, true);
    const decoded = decodeSave(forged);
    assert.equal(decoded.ok, false);
    if (!decoded.ok) assert.match(decoded.message, /version/);
  });

  it("describes the save before it is accepted", () => {
    assert.match(describeSave(sample()), /\$4,321/);
    assert.match(describeSave(sample()), /Slingline/);
  });
});

describe("career storage recovery", () => {
  it("falls back to the last good copy when the primary save is corrupt", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
    };
    const first = { ...freshCareer(), cash: 500 };
    writeCareer(first, storage);
    writeCareer({ ...first, cash: 900 }, storage);
    mem.set("slingline-career-v3", "{ broken");
    const recovered = readCareer(storage);
    assert.equal(recovered.cash, 500);
  });

  it("starts fresh when both copies are gone", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
    };
    assert.equal(readCareer(storage).cash, 0);
  });
});
