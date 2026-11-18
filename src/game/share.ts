/**
 * Sharing a set.
 *
 * Two things are worth sending to another player: the result card and the
 * challenge code. Both are plain text first so they work in any chat app, and
 * the card is drawn on a canvas so no image asset is needed.
 */

import type { JobId } from "./jobs.ts";
import type { CraneId } from "./cranes.ts";
import type { Grade } from "./grade.ts";

export type ShareCard = {
  company: string;
  job: string;
  grade: Grade;
  pay: number;
  off: number;
  tolerance: number;
  impact: number;
  sway: number;
  chart: number;
  day: string;
  streak?: number;
};

const GRADE_TINT: Record<Grade, string> = { S: "#e3a23a", A: "#8fc17a", B: "#cfd6dd", C: "#e05252" };
const GRADE_GLYPH: Record<Grade, string> = { S: "◆", A: "▲", B: "■", C: "●" };

/** The line you paste into a chat. No emoji-only grade, and no backend. */
export function shareText(card: ShareCard): string {
  const pay = card.pay > 0 ? ` · $${Math.round(card.pay).toLocaleString("en-US")}` : "";
  const streak = card.streak && card.streak > 1 ? ` · ${card.streak}-day streak` : "";
  return `SLINGLINE · ${card.job} · GRADE ${card.grade}${GRADE_GLYPH[card.grade]}${pay} · ring ${card.off.toFixed(1)}/${card.tolerance.toFixed(1)} m · impact ${card.impact.toFixed(1)} m/s · sway ${card.sway.toFixed(0)}°${streak} · ${card.day}`;
}

const CHALLENGE_PREFIX = "SLING-CH";

/**
 * A challenge code carries the day, call and crane, so the same seeded shift
 * can be replayed without a server. The target grade is optional.
 */
export function challengeCode(day: string, job: JobId, crane: CraneId, target: Grade | null = null): string {
  return `${CHALLENGE_PREFIX}|${day}|${job}|${crane}|${target ?? "-"}`;
}

export type Challenge = { day: string; job: JobId; crane: CraneId; target: Grade | null };

const JOB_IDS = new Set([
  "yard",
  "pipe",
  "truss",
  "panel",
  "garage",
  "container",
  "roof",
  "hvac",
  "tracks",
  "spa",
  "wind",
  "rotor",
]);
const CRANE_IDS = new Set(["rental", "yard", "heavy", "lattice", "tower", "crawler"]);
const GRADES = new Set(["S", "A", "B", "C"]);

export function parseChallenge(text: string): Challenge | null {
  const parts = text.trim().split("|");
  if (parts.length !== 5 || parts[0] !== CHALLENGE_PREFIX) return null;
  const [, day, job, crane, target] = parts as [string, string, string, string, string];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (!JOB_IDS.has(job) || !CRANE_IDS.has(crane)) return null;
  if (target !== "-" && !GRADES.has(target)) return null;
  return {
    day,
    job: job as JobId,
    crane: crane as CraneId,
    target: target === "-" ? null : (target as Grade),
  };
}

export type CardCanvas = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  measureText(text: string): { width: number };
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
};

/**
 * Draw the result card. Kept to rectangles, lines and text so it renders the
 * same in a browser and in a test double.
 */
export function paintShareCard(ctx: CardCanvas, card: ShareCard, width = 900, height = 500) {
  ctx.save();
  ctx.fillStyle = "#121418";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#2a2f36";
  ctx.strokeRect(14, 14, width - 28, height - 28);
  ctx.fillStyle = "#e3a23a";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("SLINGLINE", 44, 66);
  ctx.fillStyle = "#8a939d";
  ctx.font = "500 16px system-ui, sans-serif";
  ctx.fillText(card.company.toUpperCase(), 44, 92);

  ctx.fillStyle = GRADE_TINT[card.grade];
  ctx.font = "700 132px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(card.grade, width - 48, 168);
  ctx.font = "500 18px system-ui, sans-serif";
  ctx.fillText(GRADE_GLYPH[card.grade], width - 48, 200);

  ctx.textAlign = "left";
  ctx.fillStyle = "#f1f1ef";
  ctx.font = "700 40px system-ui, sans-serif";
  ctx.fillText(card.job, 44, 168);
  ctx.fillStyle = "#8a939d";
  ctx.font = "500 18px system-ui, sans-serif";
  ctx.fillText(card.day, 44, 200);

  const rows: [string, string][] = [
    ["RING", `${card.off.toFixed(1)} / ${card.tolerance.toFixed(1)} m`],
    ["IMPACT", `${card.impact.toFixed(1)} m/s`],
    ["SWAY", `${card.sway.toFixed(0)}°`],
    ["CHART", `${Math.round(card.chart * 100)}%`],
  ];
  rows.forEach(([label, value], index) => {
    const y = 262 + index * 44;
    ctx.strokeStyle = "#23282f";
    ctx.beginPath();
    ctx.moveTo(44, y - 26);
    ctx.lineTo(width - 44, y - 26);
    ctx.stroke();
    ctx.fillStyle = "#8a939d";
    ctx.font = "500 16px system-ui, sans-serif";
    ctx.fillText(label, 44, y);
    ctx.fillStyle = "#f1f1ef";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(value, width - 44, y);
    ctx.textAlign = "left";
  });

  ctx.fillStyle = "#e3a23a";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillText(card.pay > 0 ? `$${Math.round(card.pay).toLocaleString("en-US")}` : "PRACTICE", 44, height - 40);
  if (card.streak && card.streak > 1) {
    ctx.fillStyle = "#8a939d";
    ctx.font = "500 16px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${card.streak}-DAY STREAK`, width - 44, height - 40);
  }
  ctx.restore();
}
