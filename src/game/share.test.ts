import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { challengeCode, paintShareCard, parseChallenge, shareText, type CardCanvas, type ShareCard } from "./share.ts";

const card: ShareCard = {
  company: "Slingline Co",
  job: "RIDGE BLADE SET",
  grade: "A",
  pay: 8123,
  off: 0.4,
  tolerance: 1.4,
  impact: 0.7,
  sway: 6,
  chart: 0.82,
  day: "2026-11-17",
  streak: 3,
};

describe("share text", () => {
  it("reads as one copyable line", () => {
    const line = shareText(card);
    assert.match(line, /SLINGLINE · RIDGE BLADE SET · GRADE A/);
    assert.match(line, /\$8,123/);
    assert.match(line, /3-day streak/);
    assert.ok(!line.includes("\n"));
  });

  it("leaves the pay out of a practice set", () => {
    assert.match(shareText({ ...card, pay: 0 }), /PRACTICE|GRADE A/);
    assert.ok(!shareText({ ...card, pay: 0 }).includes("$0"));
  });
});

describe("challenge codes", () => {
  it("round trips a day, call, crane and target", () => {
    const code = challengeCode("2026-11-17", "wind", "heavy", "S");
    assert.deepEqual(parseChallenge(code), { day: "2026-11-17", job: "wind", crane: "heavy", target: "S" });
  });

  it("accepts a code without a target", () => {
    assert.deepEqual(parseChallenge("SLING-CH|2026-11-17|spa|yard|-"), {
      day: "2026-11-17",
      job: "spa",
      crane: "yard",
      target: null,
    });
  });

  it("rejects malformed codes", () => {
    assert.equal(parseChallenge("hello"), null);
    assert.equal(parseChallenge("SLING-CH|17-11-2026|spa|yard|-"), null);
    assert.equal(parseChallenge("SLING-CH|2026-11-17|nope|yard|-"), null);
    assert.equal(parseChallenge("SLING-CH|2026-11-17|spa|rocket|-"), null);
    assert.equal(parseChallenge("SLING-CH|2026-11-17|spa|yard|Z"), null);
  });
});

describe("result card", () => {
  it("paints the grade, job and readings", () => {
    const texts: string[] = [];
    let rects = 0;
    const ctx: CardCanvas = {
      fillStyle: "#000",
      strokeStyle: "#000",
      font: "",
      textAlign: "left",
      fillRect: () => {
        rects += 1;
      },
      fillText: (text) => {
        texts.push(text);
      },
      strokeRect: () => undefined,
      measureText: (text) => ({ width: text.length * 8 }),
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
    };
    paintShareCard(ctx, card);
    assert.ok(rects > 0);
    assert.ok(texts.includes("SLINGLINE"));
    assert.ok(texts.includes("RIDGE BLADE SET"));
    assert.ok(texts.includes("A"));
    assert.ok(texts.includes("0.4 / 1.4 m"));
    assert.ok(texts.includes("$8,123"));
  });
});
