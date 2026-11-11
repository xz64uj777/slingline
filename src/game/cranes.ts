export type CraneId = "rental" | "yard" | "heavy" | "lattice" | "tower" | "crawler";

export const CRANE_ORDER: CraneId[] = ["rental", "yard", "heavy", "lattice", "tower", "crawler"];

export const CRANES: Record<CraneId, { base: number; extend: number; label: string; mount: number }> = {
  rental: { base: 5.5, extend: 6, label: "RENTAL", mount: 1.32 },
  yard: { base: 8.5, extend: 14, label: "YARD", mount: 1.32 },
  heavy: { base: 12, extend: 20, label: "HEAVY", mount: 1.38 },
  lattice: { base: 16, extend: 26, label: "LATTICE", mount: 1.38 },
  tower: { base: 14, extend: 22, label: "TOWER", mount: 16.2 },
  crawler: { base: 18, extend: 30, label: "CRAWLER", mount: 1.32 },
};

export const CRANE_CHOICES: { id: CraneId; label: string }[] = CRANE_ORDER.map((id) => ({
  id,
  label: CRANES[id].label,
}));

export function craneRank(id: CraneId): number {
  const index = CRANE_ORDER.indexOf(id);
  return index < 0 ? 0 : index;
}

export function nextCrane(id: CraneId): CraneId | null {
  const index = CRANE_ORDER.indexOf(id);
  if (index < 0 || index >= CRANE_ORDER.length - 1) return null;
  return CRANE_ORDER[index + 1]!;
}

/** Highest hook height with the boom straight out. Matches the old roof check. */
export function tipReach(id: CraneId): number {
  const crane = CRANES[id];
  return crane.mount + crane.base + crane.extend;
}

export function reachesRoof(id: CraneId): boolean {
  return tipReach(id) >= 20;
}
