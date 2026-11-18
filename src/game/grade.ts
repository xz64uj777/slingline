/**
 * Set grading.
 *
 * Four things decide a set: how far off the ring the load landed, how hard it
 * touched down, how much it swung on the way, and how close to the chart the
 * pick came. The grade is the worst of the four, so a tidy landing cannot hide
 * a load that was swinging over the fence.
 */

import { loadSpec, type LoadKind } from "./loads.ts";

export type Grade = "S" | "A" | "B" | "C";

export type SetMetrics = {
  /** Distance from the ring centre at touchdown, in metres. */
  off: number;
  /** Ring radius for this job, in metres. */
  tolerance: number;
  /** Hook speed at touchdown, in m/s. */
  impact: number;
  /** The mode's impact limit, in m/s, so grading survives easy and hard. */
  impactLimit: number;
  /** Peak sway through the carry, in degrees. */
  sway: number;
  /** Peak load-chart ratio through the carry, where 1 is the chart limit. */
  chart: number;
  /** How far the load was off its required heading at touchdown, in degrees. */
  heading?: number;
  /** The job's heading tolerance, in degrees. Zero or absent means ungraded. */
  headingTolerance?: number;
};

/** The four readings, each graded on its own. */
export type SetParts = {
  off: Grade;
  impact: Grade;
  sway: Grade;
  chart: Grade;
  /** Only present for loads that have to land square, like a precast panel. */
  heading?: Grade;
};

export type PartId = keyof SetParts;

/** Grades from best to worst. */
export const GRADES: Grade[] = ["S", "A", "B", "C"];

const PART_LABEL: Record<PartId, string> = {
  off: "RING",
  impact: "IMPACT",
  sway: "SWAY",
  chart: "CHART",
  heading: "HEADING",
};

const PART_TIP: Record<PartId, string> = {
  off: "Carry it over the mark and lower it straight down.",
  impact: "Ease off in the last metre before touchdown.",
  sway: "Let the load settle before you change direction again.",
  chart: "Bring the boom in or raise it to stay inside the chart.",
  heading: "Square the load to the guides before you lower it.",
};

function rank(value: number, s: number, a: number, b: number): Grade {
  if (value <= s) return "S";
  if (value <= a) return "A";
  if (value <= b) return "B";
  return "C";
}

/** Every metric graded on its own, so the debrief can say what cost the set. */
export function gradeBreakdown(m: SetMetrics): SetParts {
  const off = m.off / Math.max(0.1, m.tolerance);
  const impact = m.impact / Math.max(0.1, m.impactLimit);
  const parts: SetParts = {
    off: rank(off, 0.2, 0.45, 0.75),
    impact: rank(impact, 0.12, 0.3, 0.6),
    sway: rank(m.sway, 2, 5, 9),
    chart: rank(m.chart, 0.75, 0.9, 1),
  };
  if (m.headingTolerance && m.headingTolerance > 0) {
    parts.heading = rank((m.heading ?? 0) / m.headingTolerance, 0.35, 0.7, 1);
  }
  return parts;
}

const BASE_ORDER: PartId[] = ["off", "impact", "sway", "chart"];

/** Labels in the order the debrief lists them. */
export function partLabel(part: PartId): string {
  return PART_LABEL[part];
}

/** The worst reading decides the set. Ties go to the earlier metric. */
export function worstPart(parts: SetParts): PartId {
  const order = parts.heading ? [...BASE_ORDER, "heading" as const] : BASE_ORDER;
  let worst: PartId = "off";
  for (const part of order) {
    const grade = parts[part];
    if (grade && GRADES.indexOf(grade) > GRADES.indexOf(parts[worst] ?? "S")) worst = part;
  }
  return worst;
}

export function gradeSet(m: SetMetrics): Grade {
  const parts = gradeBreakdown(m);
  return parts[worstPart(parts)] ?? "C";
}

/** One short line telling the player what to change next time. */
export function gradeTip(m: SetMetrics): string {
  const worst = worstPart(gradeBreakdown(m));
  if (gradeBreakdown(m)[worst] === "S") return "Nothing to fix. That is a reference set.";
  return PART_TIP[worst];
}

/**
 * Fragile loads get a tighter impact limit. A panel or a blade that touches
 * down at the same speed as a crate is a damaged load, so the same control has
 * to be gentler.
 */
export function effectiveImpactLimit(limit: number, kind: LoadKind): number {
  return loadSpec(kind).fragile ? limit * 0.6 : limit;
}

/** Adds the load-specific reason to the generic debrief tip. */
export function gradeTipFor(m: SetMetrics, kind: LoadKind): string {
  const tip = gradeTip(m);
  const worst = worstPart(gradeBreakdown(m));
  if (worst !== "impact") return tip;
  if (loadSpec(kind).fragile) return "Fragile load: feather the last metre, or the impact reads as damage.";
  if (loadSpec(kind).rolling) return "Round load: it keeps rolling. Touch down dead slow and square.";
  return tip;
}

/** The metric that decided the grade, for the debrief header. */
export function gradeCost(m: SetMetrics): { part: PartId; label: string; grade: Grade } {
  const parts = gradeBreakdown(m);
  const worst = worstPart(parts);
  return { part: worst, label: PART_LABEL[worst], grade: parts[worst] ?? "C" };
}

const PAY: Record<Grade, number> = { S: 1.35, A: 1.15, B: 1, C: 0.85 };
const REP: Record<Grade, number> = { S: 2, A: 1, B: 0, C: 0 };

/** Payout multiplier for a grade: a clean S set pays 35% over the contract. */
export function gradePay(grade: Grade): number {
  return PAY[grade];
}

/** Extra reputation on top of the job's own gain. */
export function gradeRep(grade: Grade): number {
  return REP[grade];
}
