/**
 * Daily run.
 *
 * One seeded shift a day: the same call on the same crane with the same gust
 * pattern for everyone who plays it, so a wind shift is a fair puzzle instead
 * of luck. It never touches the career save. The best grade of the day is kept
 * locally, which is all the game needs before it has a leaderboard.
 */

import { CRANE_ORDER, type CraneId } from "./cranes.ts";
import type { JobId } from "./career.ts";
import type { Grade } from "./grade.ts";

export const DAILY_KEY = "slingline-daily";
export const DAILY_HISTORY_KEY = "slingline-daily-history";

/** Calls that make a good daily: real lifts, no shop shift. */
export const DAILY_JOBS: JobId[] = ["spa", "container", "roof", "hvac", "tracks", "wind", "rotor"];

export type DailyRun = {
  /** ISO day, UTC, so the run turns over at midnight UTC. */
  day: string;
  seed: number;
  job: JobId;
  crane: CraneId;
  label: string;
};

export type DailyResult = {
  day: string;
  job: JobId;
  grade: Grade;
};

/** One row per day, oldest first, capped so storage cannot grow forever. */
export type DailyHistoryEntry = DailyResult;

export const DAILY_HISTORY_LIMIT = 30;

/** Deterministic 32-bit generator. Injected into the sim for the daily. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dailyDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The same day always yields the same call, crane and seed. */
export function dailyRun(now: Date = new Date()): DailyRun {
  const day = dailyDay(now);
  const seed = hash(`slingline:${day}`);
  const rng = mulberry32(seed);
  const job = DAILY_JOBS[Math.floor(rng() * DAILY_JOBS.length)] ?? "spa";
  // Rentals are for the tutorials; a daily is always a crane with some reach.
  const owned = CRANE_ORDER.filter((id) => id !== "rental");
  const crane = owned[Math.floor(rng() * owned.length)] ?? "heavy";
  return { day, seed, job, crane, label: day };
}

export function readDailyResult(storage: Storage | null = null): DailyResult | null {
  try {
    const store = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    if (!store) return null;
    const text = store.getItem(DAILY_KEY);
    if (!text) return null;
    const raw = JSON.parse(text) as { day?: unknown; job?: unknown; grade?: unknown };
    if (typeof raw.day !== "string" || typeof raw.job !== "string") return null;
    if (raw.grade !== "S" && raw.grade !== "A" && raw.grade !== "B" && raw.grade !== "C") return null;
    return { day: raw.day, job: raw.job as JobId, grade: raw.grade };
  } catch {
    return null;
  }
}

const RANK: Record<Grade, number> = { S: 0, A: 1, B: 2, C: 3 };

function storeOf(storage: Storage | null): Storage | null {
  if (storage) return storage;
  return typeof localStorage === "undefined" ? null : localStorage;
}

function isGrade(value: unknown): value is Grade {
  return value === "S" || value === "A" || value === "B" || value === "C";
}

export function readDailyHistory(storage: Storage | null = null): DailyHistoryEntry[] {
  try {
    const store = storeOf(storage);
    if (!store) return [];
    const text = store.getItem(DAILY_HISTORY_KEY);
    if (!text) return [];
    const raw = JSON.parse(text) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((entry): entry is DailyHistoryEntry => {
        if (!entry || typeof entry !== "object") return false;
        const row = entry as Record<string, unknown>;
        return typeof row.day === "string" && typeof row.job === "string" && isGrade(row.grade);
      })
      .slice(-DAILY_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Record today's grade, keeping only the best run for a day and only the most
 * recent month. Returns the updated history so the UI does not need a re-read.
 */
export function recordDailyHistory(result: DailyResult, storage: Storage | null = null): DailyHistoryEntry[] {
  const history = readDailyHistory(storage);
  const existing = history.find((entry) => entry.day === result.day);
  if (existing) {
    if (RANK[existing.grade] <= RANK[result.grade]) return history;
    existing.grade = result.grade;
  } else {
    history.push({ ...result });
  }
  history.sort((a, b) => a.day.localeCompare(b.day));
  const next = history.slice(-DAILY_HISTORY_LIMIT);
  try {
    const store = storeOf(storage);
    if (store) store.setItem(DAILY_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Consecutive days played, counting back from today. A run missed since
 * yesterday keeps the streak alive until tonight; miss a whole day and it
 * resets, which is the usual daily-run convention.
 */
export function dailyStreak(history: DailyHistoryEntry[], today: string): number {
  const played = new Set(history.map((entry) => entry.day));
  let day = played.has(today) ? today : dayBefore(today);
  let streak = 0;
  while (played.has(day)) {
    streak += 1;
    day = dayBefore(day);
  }
  return streak;
}

/**
 * Grade movement against the last day played, in rank steps. Positive is
 * better (an A after a C is +2). Null when there is nothing to compare.
 */
export function dailyDelta(history: DailyHistoryEntry[], today: string): number | null {
  const prior = [...history].filter((entry) => entry.day < today).sort((a, b) => b.day.localeCompare(a.day))[0];
  const current = history.find((entry) => entry.day === today);
  if (!prior || !current) return null;
  return RANK[prior.grade] - RANK[current.grade];
}

/** The line under the daily button: best, streak, and movement. */
export function dailyRecordLine(history: DailyHistoryEntry[], today: string): string {
  const current = history.find((entry) => entry.day === today);
  const streak = dailyStreak(history, today);
  const delta = dailyDelta(history, today);
  const parts: string[] = [];
  if (current) parts.push(`TODAY ${current.grade}`);
  if (streak > 1) parts.push(`${streak}-DAY STREAK`);
  if (delta != null && delta !== 0) parts.push(`${delta > 0 ? "UP" : "DOWN"} ${Math.abs(delta)} FROM LAST`);
  return parts.length > 0 ? parts.join(" · ") : dailyLine(dailyRun(new Date(`${today}T12:00:00Z`)), current ?? null);
}

/** Keep the best grade for the day; a later, worse run never overwrites it. */
export function writeDailyResult(result: DailyResult, storage: Storage | null = null) {
  try {
    const store = storeOf(storage);
    if (!store) return;
    const current = readDailyResult(store);
    if (!current || current.day !== result.day || RANK[current.grade] > RANK[result.grade]) {
      store.setItem(DAILY_KEY, JSON.stringify(result));
    }
  } catch {
    /* private mode */
  }
  // History keeps every day, not just today, so a streak can be counted.
  recordDailyHistory(result, storage);
}

/** A compact line for the start screen. */
export function dailyLine(run: DailyRun, result: DailyResult | null): string {
  if (result && result.day === run.day) return `TODAY'S RUN IS IN · BEST ${result.grade}`;
  return "ONE SEEDED SHIFT · SAME WIND FOR EVERYONE";
}
