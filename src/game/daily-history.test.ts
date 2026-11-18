import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dailyDelta,
  dailyRecordLine,
  dailyStreak,
  readDailyHistory,
  recordDailyHistory,
  type DailyHistoryEntry,
} from "./daily.ts";

function memory() {
  const mem = new Map<string, string>();
  return {
    storage: {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
    } as unknown as Storage,
  };
}

function row(day: string, grade: "S" | "A" | "B" | "C"): DailyHistoryEntry {
  return { day, job: "spa", grade };
}

describe("daily history", () => {
  it("records a day and keeps the best grade for it", () => {
    const save = memory();
    recordDailyHistory(row("2026-11-17", "B"), save.storage);
    recordDailyHistory(row("2026-11-17", "C"), save.storage);
    const once = readDailyHistory(save.storage);
    assert.equal(once.length, 1);
    assert.equal(once[0]?.grade, "B");
    recordDailyHistory(row("2026-11-17", "S"), save.storage);
    assert.equal(readDailyHistory(save.storage)[0]?.grade, "S");
  });

  it("keeps the rows in day order", () => {
    const save = memory();
    recordDailyHistory(row("2026-11-18", "A"), save.storage);
    recordDailyHistory(row("2026-11-16", "B"), save.storage);
    recordDailyHistory(row("2026-11-17", "C"), save.storage);
    assert.deepEqual(
      readDailyHistory(save.storage).map((entry) => entry.day),
      ["2026-11-16", "2026-11-17", "2026-11-18"],
    );
  });

  it("counts a streak back from today", () => {
    const history = [row("2026-11-15", "B"), row("2026-11-16", "A"), row("2026-11-17", "S")];
    assert.equal(dailyStreak(history, "2026-11-17"), 3);
    assert.equal(dailyStreak(history, "2026-11-18"), 3);
    assert.equal(dailyStreak(history, "2026-11-19"), 0);
  });

  it("reports grade movement against the last day played", () => {
    const history = [row("2026-11-16", "C"), row("2026-11-17", "A")];
    assert.equal(dailyDelta(history, "2026-11-17"), 2);
    assert.equal(dailyDelta([row("2026-11-16", "S"), row("2026-11-17", "B")], "2026-11-17"), -2);
    assert.equal(dailyDelta([row("2026-11-17", "A")], "2026-11-17"), null);
  });

  it("writes a line for the start screen", () => {
    const history = [row("2026-11-16", "B"), row("2026-11-17", "A")];
    const line = dailyRecordLine(history, "2026-11-17");
    assert.match(line, /TODAY A/);
    assert.match(line, /2-DAY STREAK/);
    assert.match(line, /UP 1 FROM LAST/);
  });
});
