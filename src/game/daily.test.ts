import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DAILY_JOBS, dailyDay, dailyLine, dailyRun, mulberry32, readDailyResult, writeDailyResult } from "./daily.ts";

function memory() {
  const mem = new Map<string, string>();
  return {
    mem,
    storage: {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
    } as unknown as Storage,
  };
}

describe("daily run", () => {
  it("picks the same call and seed for the whole day", () => {
    const morning = new Date("2026-11-17T06:00:00Z");
    const evening = new Date("2026-11-17T23:30:00Z");
    const first = dailyRun(morning);
    const second = dailyRun(evening);
    assert.equal(first.day, "2026-11-17");
    assert.deepEqual(first, second);
    assert.ok(DAILY_JOBS.includes(first.job));
    assert.notEqual(first.crane, "rental");
  });

  it("turns over at midnight UTC", () => {
    const today = dailyRun(new Date("2026-11-17T23:59:00Z"));
    const tomorrow = dailyRun(new Date("2026-11-18T00:01:00Z"));
    assert.equal(dailyDay(new Date("2026-11-18T00:01:00Z")), "2026-11-18");
    assert.notEqual(today.day, tomorrow.day);
    assert.notEqual(today.seed, tomorrow.seed);
  });

  it("gives the same seed the same gust sequence", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 20; i += 1) assert.equal(a(), b());
    const values = Array.from({ length: 30 }, mulberry32(99));
    assert.ok(values.every((value) => value >= 0 && value < 1));
  });

  it("keeps only the best result of the day", () => {
    const save = memory();
    const run = dailyRun(new Date("2026-11-17T09:00:00Z"));
    writeDailyResult({ day: run.day, job: run.job, grade: "B" }, save.storage);
    writeDailyResult({ day: run.day, job: run.job, grade: "C" }, save.storage);
    assert.equal(readDailyResult(save.storage)?.grade, "B");
    writeDailyResult({ day: run.day, job: run.job, grade: "S" }, save.storage);
    assert.equal(readDailyResult(save.storage)?.grade, "S");
    assert.match(dailyLine(run, readDailyResult(save.storage)), /BEST S/);
  });

  it("shows the seeded line before a run is recorded", () => {
    const run = dailyRun(new Date("2026-11-17T09:00:00Z"));
    assert.match(dailyLine(run, null), /SAME WIND/);
    assert.match(dailyLine(run, { day: "2026-11-16", job: run.job, grade: "S" }), /SAME WIND/);
  });
});
