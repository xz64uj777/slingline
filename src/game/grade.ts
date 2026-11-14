/**
 * Set grading.
 *
 * Four things decide a set: how far off the ring the load landed, how hard it
 * touched down, how much it swung on the way, and how close to the chart the
 * pick came. The grade is the worst of the four, so a tidy landing cannot hide
 * a load that was swinging over the fence.
 */

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
};

/** Grades from best to worst. */
export const GRADES: Grade[] = ["S", "A", "B", "C"];

function rank(value: number, s: number, a: number, b: number): Grade {
  if (value <= s) return "S";
  if (value <= a) return "A";
  if (value <= b) return "B";
  return "C";
}

export function gradeSet(m: SetMetrics): Grade {
  const off = m.off / Math.max(0.1, m.tolerance);
  const impact = m.impact / Math.max(0.1, m.impactLimit);
  const parts: Grade[] = [
    rank(off, 0.2, 0.45, 0.75),
    rank(impact, 0.12, 0.3, 0.6),
    rank(m.sway, 2, 5, 9),
    rank(m.chart, 0.75, 0.9, 1),
  ];
  return parts.reduce((worst, g) => (GRADES.indexOf(g) > GRADES.indexOf(worst) ? g : worst), "S");
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
