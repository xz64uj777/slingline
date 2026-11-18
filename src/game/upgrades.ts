/**
 * Yard upgrades and crane wear.
 *
 * Money needs somewhere to go once the campaign is done. Each upgrade is a
 * small, legible change to handling rather than a stat wall: the winch is
 * faster, the slew is smoother, the swing dies quicker, the outriggers carry
 * more chart, and the counterweight resists a lean. Wear is the other side of
 * the ledger: hard sets cost a service, and a worn crane carries noticeably
 * less.
 */

export type UpgradeId = "winch" | "slew" | "damping" | "outrigger" | "counterweight";

export type UpgradeState = Record<UpgradeId, number>;

export const UPGRADE_IDS: UpgradeId[] = ["winch", "slew", "damping", "outrigger", "counterweight"];

export const MAX_UPGRADE = 3;

type UpgradeDef = {
  label: string;
  detail: string;
  /** Cost of each level, in order. */
  costs: number[];
};

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  winch: {
    label: "WINCH",
    detail: "Faster hoist and lower. Shortens every pick.",
    costs: [900, 1800, 3200],
  },
  slew: {
    label: "SLEW",
    detail: "Quicker, smoother swing. Less overshoot on the stop.",
    costs: [1200, 2400, 4200],
  },
  damping: {
    label: "DAMPING",
    detail: "The load settles sooner after a direction change.",
    costs: [1400, 2800, 4800],
  },
  outrigger: {
    label: "OUTRIGGERS",
    detail: "Wider pads carry more chart at the same radius.",
    costs: [1600, 3000, 5200],
  },
  counterweight: {
    label: "COUNTERWEIGHT",
    detail: "More margin before the crane starts to lean.",
    costs: [2000, 3800, 6400],
  },
};

export function freshUpgrades(): UpgradeState {
  return { winch: 0, slew: 0, damping: 0, outrigger: 0, counterweight: 0 };
}

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, value));
}

/** Read a saved upgrade table, keeping only known levels. */
export function readUpgrades(raw: unknown): UpgradeState {
  const next = freshUpgrades();
  if (!raw || typeof raw !== "object") return next;
  const record = raw as Record<string, unknown>;
  for (const id of UPGRADE_IDS) {
    const value = record[id];
    const level = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(level)) next[id] = clamp(Math.floor(level), 0, MAX_UPGRADE);
  }
  return next;
}

/** Cost of the next level, or null when the part is already at the top. */
export function upgradeCost(id: UpgradeId, upgrades: UpgradeState): number | null {
  const level = clamp(Math.floor(upgrades[id] ?? 0), 0, MAX_UPGRADE);
  if (level >= MAX_UPGRADE) return null;
  return UPGRADES[id].costs[level] ?? null;
}

export type UpgradePurchase = {
  ok: boolean;
  cash: number;
  upgrades: UpgradeState;
  message: string;
};

/** Buy one level of a part. The caller only passes the pieces it mutates. */
export function buyUpgrade(cash: number, upgrades: UpgradeState, id: UpgradeId): UpgradePurchase {
  const cost = upgradeCost(id, upgrades);
  if (cost == null) {
    return { ok: false, cash, upgrades, message: `${UPGRADES[id].label} is already at the top level.` };
  }
  if (cash < cost) {
    return {
      ok: false,
      cash,
      upgrades,
      message: `Need $${cost.toLocaleString("en-US")} for ${UPGRADES[id].label}. You have $${Math.round(cash).toLocaleString("en-US")}.`,
    };
  }
  const next = { ...upgrades, [id]: (upgrades[id] ?? 0) + 1 };
  return {
    ok: true,
    cash: cash - cost,
    upgrades: next,
    message: `${UPGRADES[id].label} levelled to ${next[id]}. $${cost.toLocaleString("en-US")} spent.`,
  };
}

export type UpgradeEffects = {
  /** Multiplies slew authority. */
  slew: number;
  /** Multiplies hoist speed. */
  hoist: number;
  /** Multiplies swing damping. */
  damp: number;
  /** Multiplies chart capacity. */
  capacity: number;
  /** Multiplies the lean threshold. */
  stability: number;
};

export function upgradeEffects(upgrades: UpgradeState): UpgradeEffects {
  return {
    slew: 1 + 0.07 * (upgrades.slew ?? 0),
    hoist: 1 + 0.08 * (upgrades.winch ?? 0),
    damp: 1 + 0.14 * (upgrades.damping ?? 0),
    capacity: 1 + 0.05 * (upgrades.outrigger ?? 0),
    stability: 1 + 0.1 * (upgrades.counterweight ?? 0),
  };
}

/** None, a little, a lot. Used by the shop and the HUD line. */
export function wearLabel(wear: number): string {
  if (wear >= 75) return "SHOP";
  if (wear >= 45) return "WORN";
  if (wear >= 20) return "USED";
  return "TIGHT";
}

const WEAR_FROM_GRADE = { S: 0.4, A: 0.9, B: 1.8, C: 3.4 } as const;

/**
 * Wear added by one set. A gentle set barely marks the crane; a hard landing or
 * a sloppy grade adds real hours before the next service.
 */
export function wearAfterSet(wear: number, grade: keyof typeof WEAR_FROM_GRADE, impact: number, impactLimit: number): number {
  const shock = clamp(impact / Math.max(0.1, impactLimit), 0, 1.5);
  return clamp(wear + WEAR_FROM_GRADE[grade] + shock * 2.6, 0, 100);
}

/** Chart capacity lost to wear, as a fraction: at most 15%. */
export function wearPenalty(wear: number): number {
  return Math.min(0.15, Math.max(0, wear) * 0.0015);
}

export const SERVICE_BASE = 280;

/** Service is cheaper early and dearer the longer the crane is run down. */
export function serviceCost(wear: number): number {
  if (wear <= 0) return 0;
  return Math.round(SERVICE_BASE * (0.45 + Math.max(0, wear) / 100));
}

export type ServiceResult = { ok: boolean; cash: number; wear: number; message: string };

export function serviceCrane(cash: number, wear: number): ServiceResult {
  if (wear <= 0.5) return { ok: false, cash, wear: 0, message: "The crane is already tight. Nothing to service." };
  const cost = serviceCost(wear);
  if (cash < cost) {
    return { ok: false, cash, wear, message: `Service costs $${cost.toLocaleString("en-US")}. You have $${Math.round(cash).toLocaleString("en-US")}.` };
  }
  return { ok: true, cash: cash - cost, wear: 0, message: `Crane serviced for $${cost.toLocaleString("en-US")}. Wear cleared.` };
}
