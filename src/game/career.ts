import {
  CRANES,
  craneRank,
  nextCrane,
  reachesRoof,
  type CraneId,
} from "./cranes.ts";

import { gradePay, gradeRep, type Grade } from "./grade.ts";
import { LOAD_SPECS, type LoadKind } from "./loads.ts";
import type { SiteTheme } from "./levels.ts";
import { ALL_JOBS, COMPANY_JOBS, JOBS, LEVEL_COUNT, RENTAL_LEVELS, type JobId, type JobPhase } from "./jobs.ts";
import {
  buyUpgrade,
  freshUpgrades,
  readUpgrades,
  serviceCost,
  serviceCrane as serviceUpgrades,
  upgradeCost,
  wearAfterSet,
  wearLabel,
  type UpgradeId,
  type UpgradeState,
} from "./upgrades.ts";

export type { JobId, JobPhase } from "./jobs.ts";
export type { UpgradeId, UpgradeState } from "./upgrades.ts";
export { ALL_JOBS, COMPANY_JOBS, JOBS, LEVEL_COUNT, RENTAL_LEVELS } from "./jobs.ts";

export type { CraneId } from "./cranes.ts";
export type { Grade } from "./grade.ts";
export type { LoadKind } from "./loads.ts";
export type { SiteTheme } from "./levels.ts";
export { CRANES, CRANE_CHOICES, nextCrane, reachesRoof } from "./cranes.ts";

export type CareerStatus = "hired" | "independent";

export const CAREER_KEY = "slingline-career-v3";
export const BOSS = "Hargrove Crane";

/**
 * Published economy. Hired pay is a wage, a share of the contract.
 * Independence costs a filing fee. Cranes are bought with a down payment;
 * the rest is a note taken out of later contracts. Fuel comes off every
 * paid call once the company is yours. A yard move always clears more than
 * it costs, so a bad streak cannot trap the player.
 */
export const ECONOMY = {
  wageShare: 0.45,
  shortWageShare: 0.6,
  waryShare: 0.8,
  foundCash: 1900,
  foundJobs: 5,
  foundStanding: 60,
  foundFee: 1000,
  startStanding: 70,
  noteFraction: 0.4,
  noteSlice: 0.1,
  noteCap: 0.4,
  veteranEvery: 5,
  veteranStep: 100,
  veteranCap: 500,
  standingGain: 6,
  standingDrop: 14,
  standingTip: 24,
  standingWrong: 8,
  downtimeCap: 3,
} as const;

export const CRANE_PRICE: Record<CraneId, number> = {
  rental: 0,
  yard: 4200,
  heavy: 9800,
  lattice: 18500,
  tower: 32000,
  crawler: 54000,
};

export const UPKEEP: Record<CraneId, number> = {
  rental: 40,
  yard: 80,
  heavy: 140,
  lattice: 220,
  tower: 340,
  crawler: 480,
};

export const REPAIR: Record<CraneId, number> = {
  rental: 160,
  yard: 260,
  heavy: 400,
  lattice: 620,
  tower: 880,
  crawler: 1200,
};

/** The readings that decide a grade, shared by the sim and the career ledger. */
export type SetMetricsInput = {
  off: number;
  tolerance: number;
  impact: number;
  impactLimit: number;
  sway: number;
  chart: number;
};

/** The best set on a call, kept so the debrief can compare against it. */
export type BestRun = SetMetricsInput & { grade: Grade; pay: number };

/** A recent set, kept for the local scatter in the career ledger. */
export type SetRecord = SetMetricsInput & { job: JobId; grade: Grade; pay: number };

/** A drop or a tip, with what it cost and how much of that was insurance. */
export type IncidentRecord = { kind: "drop" | "tip"; job: JobId; cost: number; insurance: number };

/**
 * The better of two runs. Grade first, then the tighter ring reading, so a
 * clean set is not displaced by a sloppier one of the same grade.
 */
export function pickBestRun(current: BestRun | undefined, next: BestRun): BestRun {
  if (!current) return next;
  if (GRADE_RANK[next.grade] !== GRADE_RANK[current.grade]) {
    return GRADE_RANK[next.grade] < GRADE_RANK[current.grade] ? next : current;
  }
  const currentRatio = current.off / Math.max(0.1, current.tolerance);
  const nextRatio = next.off / Math.max(0.1, next.tolerance);
  return nextRatio < currentRatio ? next : current;
}


/** Grades in the order the ledger and the scorecard read them. */
export const GRADE_ORDER: Grade[] = ["S", "A", "B", "C"];

const GRADE_RANK: Record<Grade, number> = { S: 0, A: 1, B: 2, C: 3 };

/** The best of two grades, so a sloppy replay never erases a clean set. */
export function betterGrade(current: Grade | undefined, next: Grade): Grade {
  if (!current) return next;
  return GRADE_RANK[next] < GRADE_RANK[current] ? next : current;
}

/** A job's recorded best grade, or null when it has never been set. */
export function bestGradeOf(state: CareerState, job: JobId): Grade | null {
  return state.bestGrades[job] ?? null;
}

/**
 * The card is full once every call on the board has a set on the books. The
 * rotor signs off the ridge, but the second contract still has calls open
 * after it, so the capstone cannot be the end of the campaign.
 */
export function campaignComplete(state: CareerState): boolean {
  return COMPANY_JOBS.every((job) => state.bestGrades[job] !== undefined);
}

/** Ledger rows in grade order, with a zero for anything never earned. */
export function gradeSpread(state: CareerState): { grade: Grade; count: number }[] {
  return GRADE_ORDER.map((grade) => ({ grade, count: state.gradeCounts[grade] ?? 0 }));
}

/** Level card data for the board and the HUD. */
export function levelOf(job: JobId) {
  const def = JOBS[job] ?? JOBS.yard;
  return {
    id: def.id,
    no: def.no,
    phase: def.phase,
    title: def.title,
    kind: def.kind,
    theme: def.theme,
    brief: def.brief,
    ring: def.ring,
    pay: def.pay,
  };
}

const BOUGHT_LINE: Record<Exclude<CraneId, "rental">, string> = {
  yard: "Yard crane is yours. Longer boom. The note comes out of the next jobs.",
  heavy: "Heavy crane is yours. More chart, and a bigger note.",
  lattice: "Lattice crane is yours. The sign out front says Slingline Co.",
  tower: "Tower crane is yours. The boom rides the mast. Slingline Tower.",
  crawler: "Crawler is yours. It is on the lowboy. Drive to the marked pad, stop, then UNLOAD.",
};

export const FOUNDING_MESSAGE =
  "The papers are filed. Slingline is yours. Hargrove's rental is now your crane. From here you keep the contract, and you pay the fuel, the note, and the shop.";

export type CareerState = {
  v: 4;
  cash: number;
  crane: CraneId;
  reputation: number;
  roofDone: boolean;
  roofActive: boolean;
  status: CareerStatus;
  standing: number;
  jobsDone: number;
  failures: number;
  downtime: number;
  contract: number;
  leg: number;
  job: JobId;
  crawlerOnSite: boolean;
  note: number;
  /** Best grade recorded per call, across the whole career. */
  bestGrades: Partial<Record<JobId, Grade>>;
  /** How many sets of each grade have been landed. */
  gradeCounts: Record<Grade, number>;
  /** Bought handling upgrades. */
  upgrades: UpgradeState;
  /** 0 is a tight crane, 100 is ready for the shop. */
  wear: number;
  /** Drops and tips, newest last, capped for the ledger. */
  incidents: IncidentRecord[];
  /** Personal best per call, for the debrief comparison. */
  bestRuns: Partial<Record<JobId, BestRun>>;
  /** Last sets for the local miss scatter. */
  recentSets: SetRecord[];
};

export type JobOffer = {
  id: JobId;
  no: number;
  phase: JobPhase;
  title: string;
  kind: LoadKind;
  theme: SiteTheme;
  brief: string;
  pad: number;
  ring: number;
  gross: number;
  take: number;
  wage: boolean;
  short: boolean;
  wary: boolean;
  locked: boolean;
  reason: string;
  current: boolean;
  leg: number;
  /** Best grade already recorded for this call, if any. */
  best: Grade | null;
};

export type CareerResult = {
  ok: boolean;
  state: CareerState;
  message: string;
  haul: boolean;
  banked: number;
  matched: boolean;
};

type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function freshCareer(): CareerState {
  return {
    v: 4,
    cash: 0,
    crane: "rental",
    reputation: 0,
    roofDone: false,
    roofActive: false,
    status: "hired",
    standing: ECONOMY.startStanding,
    jobsDone: 0,
    failures: 0,
    downtime: 0,
    contract: 0,
    leg: 0,
    job: "yard",
    crawlerOnSite: true,
    note: 0,
    bestGrades: {},
    gradeCounts: { S: 0, A: 0, B: 0, C: 0 },
    upgrades: freshUpgrades(),
    wear: 0,
    incidents: [],
    bestRuns: {},
    recentSets: [],
  };
}

export function downPayment(crane: CraneId): number {
  if (crane === "rental") return 0;
  return Math.round(CRANE_PRICE[crane] * (1 - ECONOMY.noteFraction));
}

export function financedAmount(crane: CraneId): number {
  return CRANE_PRICE[crane] - downPayment(crane);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function finite(value: unknown, fallback: number, lo = 0, hi = 1_000_000_000) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, lo, hi);
}

function isCrane(value: unknown): value is CraneId {
  return value === "rental" || value === "yard" || value === "heavy" || value === "lattice" || value === "tower" || value === "crawler";
}

function isJob(value: unknown): value is JobId {
  return typeof value === "string" && value in JOBS;
}

function isGrade(value: unknown): value is Grade {
  return value === "S" || value === "A" || value === "B" || value === "C";
}

function readMetrics(raw: unknown): SetMetricsInput | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const off = finite(row.off, NaN);
  const tolerance = finite(row.tolerance, NaN);
  const impact = finite(row.impact, NaN);
  const impactLimit = finite(row.impactLimit, NaN);
  const sway = finite(row.sway, NaN);
  const chart = finite(row.chart, NaN);
  if (![off, tolerance, impact, impactLimit, sway, chart].every((value) => Number.isFinite(value))) return null;
  return { off, tolerance, impact, impactLimit, sway, chart };
}

function readBestRuns(raw: unknown): Partial<Record<JobId, BestRun>> {
  const table: Partial<Record<JobId, BestRun>> = {};
  if (!raw || typeof raw !== "object") return table;
  const record = raw as Record<string, unknown>;
  for (const job of ALL_JOBS) {
    const entry = record[job];
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const metrics = readMetrics(entry);
    if (!metrics || !isGrade(row.grade)) continue;
    table[job] = { ...metrics, grade: row.grade, pay: finite(row.pay, 0) };
  }
  return table;
}

function readRecentSets(raw: unknown): SetRecord[] {
  if (!Array.isArray(raw)) return [];
  const rows: SetRecord[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const metrics = readMetrics(entry);
    if (!metrics || !isGrade(row.grade) || !isJob(row.job)) continue;
    rows.push({ ...metrics, job: row.job, grade: row.grade, pay: finite(row.pay, 0) });
  }
  return rows.slice(-24);
}

function readIncidents(raw: unknown): IncidentRecord[] {
  if (!Array.isArray(raw)) return [];
  const rows: IncidentRecord[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (row.kind !== "drop" && row.kind !== "tip") continue;
    if (!isJob(row.job)) continue;
    rows.push({ kind: row.kind, job: row.job, cost: finite(row.cost, 0), insurance: finite(row.insurance, 0) });
  }
  return rows.slice(-10);
}

function copy(state: CareerState): CareerState {
  // The ledgers are cloned so a set never writes through to the state it came from.
  return { ...state, bestGrades: { ...state.bestGrades }, gradeCounts: { ...state.gradeCounts }, bestRuns: { ...state.bestRuns } };
}

function roofFor(job: JobId) {
  return JOBS[job].roof;
}

function veteranBump(state: CareerState) {
  return Math.min(ECONOMY.veteranCap, Math.floor(state.jobsDone / ECONOMY.veteranEvery) * ECONOMY.veteranStep);
}

export function assignedJob(state: CareerState): JobId {
  if (state.downtime > 0) return "yard";
  const index = Math.min(state.jobsDone, RENTAL_LEVELS.length - 1);
  return RENTAL_LEVELS[index] ?? "yard";
}

function callersWary(state: CareerState) {
  return state.status === "independent" && state.reputation === 0 && state.failures > 0;
}

export function isUnlocked(state: CareerState, job: JobId): { ok: boolean; reason: string } {
  const def = JOBS[job];
  if (state.status === "hired") {
    if (!RENTAL_LEVELS.includes(job)) {
      return { ok: false, reason: "Hargrove does not assign this. It opens when Slingline is yours." };
    }
    if (state.downtime > 0 && job !== "yard") {
      return { ok: false, reason: "You are on downtime. Only a yard move is open." };
    }
    const today = assignedJob(state);
    if (job !== today) {
      return { ok: false, reason: `Today is ${JOBS[today].title}. Finish that one.` };
    }
    if (state.downtime > 0) return { ok: true, reason: "Short wage. A clean yard move clears one downtime." };
    return { ok: true, reason: "" };
  }

  if (job !== "yard" && state.downtime > 0) {
    return { ok: false, reason: "The crane is in the shop. A yard move clears the shift." };
  }
  if (state.reputation < def.rep) {
    return { ok: false, reason: `Needs reputation ${def.rep}. Yours is ${state.reputation}.` };
  }
  if (craneRank(state.crane) < craneRank(def.crane)) {
    return { ok: false, reason: `Needs the ${CRANES[def.crane].label.toLowerCase()} crane. You own the ${CRANES[state.crane].label.toLowerCase()}.` };
  }
  if (def.after && !state.bestGrades[def.after]) {
    return { ok: false, reason: `Set the ${JOBS[def.after].title} first.` };
  }
  if ((job === "roof" || job === "curtain") && !reachesRoof(state.crane)) {
    return { ok: false, reason: "This crane cannot reach the roof." };
  }
  if (job === "tracks" && !state.crawlerOnSite) {
    return { ok: false, reason: "Crawler is on the lowboy. Deliver it to the pad, then this pick pays." };
  }
  if (job === "yard" && callersWary(state)) {
    return { ok: true, reason: "Callers are wary. This yard move pays less until reputation is back." };
  }
  if (job === "yard" && state.downtime > 0) {
    return { ok: true, reason: "Shop shift. This yard move clears it." };
  }
  return { ok: true, reason: "" };
}

function grossFor(state: CareerState, job: JobId, leg: number) {
  const def = JOBS[job];
  const base = leg === 1 && def.follow ? def.follow.pay : def.pay;
  let gross = base + veteranBump(state);
  if (job === "yard" && callersWary(state)) gross = Math.round(gross * ECONOMY.waryShare);
  return gross;
}

function takeFor(state: CareerState, gross: number) {
  if (state.status === "independent") return gross;
  let wage = Math.round(gross * ECONOMY.wageShare);
  if (state.downtime > 0) wage = Math.round(wage * ECONOMY.shortWageShare);
  return Math.max(1, wage);
}

export function activeOffer(state: CareerState): JobOffer {
  const id = state.status === "hired" ? assignedJob(state) : state.job;
  const def = JOBS[id] ?? JOBS.yard;
  const leg = def.follow && state.leg === 1 ? 1 : 0;
  const follow = leg === 1 && def.follow ? def.follow : null;
  const gate = isUnlocked(state, id);
  const gross = grossFor(state, id, leg);
  const wage = state.status === "hired";
  return {
    id,
    no: def.no,
    phase: def.phase,
    title: follow ? follow.title : def.title,
    kind: follow ? follow.kind : def.kind,
    theme: def.theme,
    brief: def.brief,
    pad: follow ? follow.pad : def.pad,
    ring: follow ? follow.ring : def.ring,
    gross,
    take: takeFor(state, gross),
    wage,
    short: wage && state.downtime > 0,
    wary: !wage && id === "yard" && callersWary(state),
    locked: !gate.ok,
    reason: gate.reason,
    current: true,
    leg,
    best: state.bestGrades[id] ?? null,
  };
}

export function jobBoard(state: CareerState): JobOffer[] {
  const ids = state.status === "hired" ? RENTAL_LEVELS : COMPANY_JOBS;
  return ids.map((id) => {
    const gate = isUnlocked(state, id);
    const gross = grossFor(state, id, 0);
    const current = (state.status === "hired" ? assignedJob(state) : state.job) === id;
    return {
      id,
      no: JOBS[id].no,
      phase: JOBS[id].phase,
      title: JOBS[id].title,
      kind: JOBS[id].kind,
      theme: JOBS[id].theme,
      brief: JOBS[id].brief,
      pad: JOBS[id].pad,
      ring: JOBS[id].ring,
      gross,
      take: takeFor(state, gross),
      wage: state.status === "hired",
      short: state.status === "hired" && state.downtime > 0 && id === "yard",
      wary: state.status === "independent" && id === "yard" && callersWary(state),
      locked: !gate.ok,
      reason: gate.reason,
      current,
      leg: 0,
      best: state.bestGrades[id] ?? null,
    };
  });
}

export function contractLabel(state: CareerState): string {
  const offer = activeOffer(state);
  const noun = LOAD_SPECS[offer.kind]?.label ?? "LOAD";
  if (offer.wage) {
    const word = offer.short ? "SHORT WAGE" : "WAGE";
    return `${offer.title}: ${noun} · ${word} ${money(offer.take)} OF ${money(offer.gross)}`;
  }
  const wary = offer.wary ? " · CALLERS ARE WARY" : "";
  return `${offer.title}: ${noun} · CONTRACT ${money(offer.gross)}${wary}`;
}

export function companyName(state: CareerState): string {
  if (state.status === "hired") return "Temp Hire";
  if (state.crane === "lattice") return "Slingline Co";
  if (state.crane === "tower") return "Slingline Tower";
  if (state.crane === "crawler") return "Slingline Tracks";
  return "Independent";
}

export function statusLine(state: CareerState): string {
  return state.status === "hired" ? "FOR HARGROVE" : "YOUR COMPANY";
}

export function employerLine(state: CareerState): string {
  if (state.status === "hired") return "You work for Hargrove Crane. The rental is theirs. You take a wage.";
  return "Slingline is yours. You keep the contract and pay the fuel, the note, and the shop.";
}

export function canFound(state: CareerState): { ok: boolean; reason: string } {
  if (state.status === "independent") return { ok: false, reason: "Slingline is already yours." };
  if (state.downtime > 0) {
    return { ok: false, reason: "Hargrove has you on downtime. Clear it with a yard move before you file." };
  }
  const gaps: string[] = [];
  if (state.cash < ECONOMY.foundCash) gaps.push(`save ${money(ECONOMY.foundCash - state.cash)} more in wages`);
  if (state.jobsDone < ECONOMY.foundJobs) {
    const left = ECONOMY.foundJobs - state.jobsDone;
    gaps.push(`finish ${left} more assigned job${left === 1 ? "" : "s"}`);
  }
  if (state.standing < ECONOMY.foundStanding) {
    gaps.push(`get standing to ${ECONOMY.foundStanding} (yours is ${state.standing})`);
  }
  if (gaps.length > 0) return { ok: false, reason: `Before you can file Slingline: ${gaps.join("; ")}.` };
  return { ok: true, reason: `Hargrove will sign the release. Filing costs ${money(ECONOMY.foundFee)}.` };
}

export function foundCompany(state: CareerState): CareerResult {
  const gate = canFound(state);
  if (!gate.ok) return { ok: false, state, message: gate.reason, haul: false, banked: 0, matched: false };
  const next = copy(state);
  next.status = "independent";
  next.cash -= ECONOMY.foundFee;
  next.job = "yard";
  next.leg = 0;
  next.roofActive = false;
  next.reputation = Math.max(2, next.reputation);
  next.standing = 100;
  return { ok: true, state: next, message: FOUNDING_MESSAGE, haul: false, banked: 0, matched: false };
}

/** Buy one handling upgrade. Only a filed company can spend on the crane. */
export function buyUpgradeLevel(state: CareerState, id: UpgradeId): CareerResult {
  if (state.status !== "independent") {
    return { ok: false, state, message: "File Slingline before you spend on upgrades.", haul: false, banked: 0, matched: false };
  }
  const purchase = buyUpgrade(state.cash, state.upgrades, id);
  if (!purchase.ok) return { ok: false, state, message: purchase.message, haul: false, banked: 0, matched: false };
  const next = copy(state);
  next.cash = purchase.cash;
  next.upgrades = purchase.upgrades;
  return { ok: true, state: next, message: purchase.message, haul: false, banked: 0, matched: false };
}

/** Clear wear at the shop. */
export function serviceCareerCrane(state: CareerState): CareerResult {
  if (state.status !== "independent") {
    return { ok: false, state, message: "The rental is Hargrove's to service.", haul: false, banked: 0, matched: false };
  }
  const serviced = serviceUpgrades(state.cash, state.wear);
  if (!serviced.ok) return { ok: false, state, message: serviced.message, haul: false, banked: 0, matched: false };
  const next = copy(state);
  next.cash = serviced.cash;
  next.wear = serviced.wear;
  return { ok: true, state: next, message: serviced.message, haul: false, banked: 0, matched: false };
}

/** Next upgrade price for the shop button, or null at the top level. */
export function nextUpgradeCost(state: CareerState, id: UpgradeId): number | null {
  return upgradeCost(id, state.upgrades);
}

export function buyLabel(state: CareerState): string {
  if (state.status !== "independent") return "HARGROVE'S CRANE";
  const next = nextCrane(state.crane);
  if (!next) return "TOP CRANE";
  const down = downPayment(next);
  return `BUY ${CRANES[next].label} ${money(down)} DOWN`;
}

export function buyDetail(state: CareerState): string {
  if (state.status !== "independent") return "File Slingline before you buy a crane.";
  const next = nextCrane(state.crane);
  if (!next) return "The crawler is the top of the line.";
  const down = downPayment(next);
  const note = financedAmount(next);
  if (state.cash < down) return `Need ${money(down)} down. You have ${money(state.cash)}. Price ${money(CRANE_PRICE[next])}, note ${money(note)}.`;
  return `${money(down)} down of ${money(CRANE_PRICE[next])}. Note ${money(note)} comes out of later jobs.`;
}

export function buyCrane(state: CareerState): CareerResult {
  if (state.status !== "independent") {
    return {
      ok: false,
      state,
      message: "You work for Hargrove. File Slingline before you buy a crane.",
      haul: false,
      banked: 0,
      matched: false,
    };
  }
  const next = nextCrane(state.crane);
  if (!next || next === "rental") {
    return { ok: false, state, message: "You already own the crawler.", haul: false, banked: 0, matched: false };
  }
  const down = downPayment(next);
  const note = financedAmount(next);
  if (state.cash < down) {
    return {
      ok: false,
      state,
      message: `Need ${money(down)} down for the ${CRANES[next].label.toLowerCase()}. You have ${money(state.cash)}.`,
      haul: false,
      banked: 0,
      matched: false,
    };
  }
  const bought = copy(state);
  bought.cash -= down;
  bought.note += note;
  bought.crane = next;
  const haul = next === "crawler";
  if (haul) bought.crawlerOnSite = false;
  return { ok: true, state: bought, message: BOUGHT_LINE[next], haul, banked: 0, matched: false };
}

export function acceptJob(state: CareerState, id: JobId): CareerResult {
  if (state.status === "hired") {
    const today = activeOffer(state);
    return {
      ok: false,
      state,
      message: `Hargrove assigns the work. Today is ${today.title}.`,
      haul: false,
      banked: 0,
      matched: false,
    };
  }
  const gate = isUnlocked(state, id);
  if (!gate.ok) return { ok: false, state, message: gate.reason, haul: false, banked: 0, matched: false };
  const next = copy(state);
  next.job = id;
  next.leg = 0;
  next.roofActive = roofFor(id);
  const offer = activeOffer(next);
  const wary = offer.wary ? " Callers are wary, so this one pays less." : "";
  return {
    ok: true,
    state: next,
    message: `${offer.title} is the call. Contract ${money(offer.gross)}.${wary}`,
    haul: false,
    banked: 0,
    matched: false,
  };
}

function payLine(state: CareerState, offer: JobOffer, banked: number, upkeep: number, notePaid: number) {
  if (state.status === "hired") {
    return `Hargrove paid your wage ${money(banked)}. They keep the rest of the ${money(offer.gross)} contract.`;
  }
  const fuel = upkeep > 0 ? ` Fuel ${money(upkeep)}.` : "";
  const note = notePaid > 0 ? ` Note ${money(notePaid)}. ${money(state.note)} left.` : "";
  return `Contract ${money(offer.gross)}. You banked ${money(banked)}.${fuel}${note}`;
}

export function resolveSet(
  state: CareerState,
  load: LoadKind,
  grade: Grade = "B",
  metrics?: SetMetricsInput,
): CareerResult {
  const offer = activeOffer(state);
  if (load !== offer.kind) return resolveWrongLoad(state);

  const next = copy(state);
  const upkeep = next.status === "independent" ? UPKEEP[next.crane] : 0;
  // The grade scales what the set is worth before upkeep and the note come off.
  const take = Math.round(offer.take * gradePay(grade));
  let notePaid = 0;
  if (next.status === "independent" && next.note > 0) {
    notePaid = Math.min(next.note, Math.round(offer.gross * ECONOMY.noteSlice));
    notePaid = Math.min(notePaid, Math.round(offer.gross * ECONOMY.noteCap));
  }
  let banked = take - upkeep - notePaid;
  if (banked < 1) {
    const back = Math.min(notePaid, 1 - banked);
    notePaid -= back;
    banked += back;
  }
  if (banked < 1) banked = 1;
  next.cash += banked;
  next.note = Math.max(0, next.note - notePaid);
  next.jobsDone += 1;
  next.bestGrades[offer.id] = betterGrade(next.bestGrades[offer.id], grade);
  next.gradeCounts[grade] = (next.gradeCounts[grade] ?? 0) + 1;
  if (metrics) {
    // Wear and the local history follow the set itself, so a clean set leaves
    // the crane tight and a hard one shows up in the next service bill.
    next.wear = wearAfterSet(next.wear, grade, metrics.impact, metrics.impactLimit);
    next.recentSets = [...next.recentSets, { job: offer.id, grade, pay: banked, ...metrics }].slice(-24);
    next.bestRuns[offer.id] = pickBestRun(next.bestRuns[offer.id], { grade, pay: banked, ...metrics });
  }
  let message = `${payLine(next, offer, banked, upkeep, notePaid)} Graded ${grade}.`;
  if (offer.id === "rotor") message += " The ridge is signed off.";
  // A skipped call still has to be set, so only a full card ends the campaign.
  if (campaignComplete(next) && !campaignComplete(state)) message += " Slingline's card is full.";

  if (next.status === "hired") {
    next.standing = clamp(next.standing + ECONOMY.standingGain + gradeRep(grade), 0, 100);
    if (next.downtime > 0) {
      next.downtime -= 1;
      message += next.downtime > 0 ? " One downtime is cleared." : " Downtime is cleared.";
    }
    next.contract += 1;
    next.leg = 0;
    next.job = assignedJob(next);
    next.roofActive = false;
    const gate = canFound(next);
    if (gate.ok) message += " You can file Slingline.";
  } else {
    next.reputation += JOBS[offer.id].repGain + gradeRep(grade);
    if (JOBS[offer.id].follow && state.leg === 0) {
      next.leg = 1;
      message = `First load set. You banked ${money(banked)}. Next: ${activeOffer(next).title}.`;
    } else {
      next.leg = 0;
    }
    if (offer.id === "roof") next.roofDone = true;
    next.roofActive = roofFor(next.job);
    if (next.downtime > 0 && offer.id === "yard") {
      next.downtime -= 1;
      message += next.downtime > 0 ? " One shop shift is cleared." : " The crane is out of the shop.";
    }
  }

  return { ok: true, state: next, message, haul: false, banked, matched: true };
}

/** Skip the current hired tutorial. No wage. The next assigned job starts immediately. */
export function skipTutorial(state: CareerState): CareerResult {
  if (state.status !== "hired") {
    return { ok: false, state, message: "Tutorials are finished.", haul: false, banked: 0, matched: false };
  }
  if (state.downtime > 0) {
    return { ok: false, state, message: "Clear downtime with a yard move before you skip.", haul: false, banked: 0, matched: false };
  }
  const current = assignedJob(state);
  if (JOBS[current].phase !== "tutorial") {
    return { ok: false, state, message: "This one pays. It is not a tutorial.", haul: false, banked: 0, matched: false };
  }
  const next = copy(state);
  next.jobsDone += 1;
  next.contract += 1;
  next.leg = 0;
  next.job = assignedJob(next);
  next.roofActive = false;
  return {
    ok: true,
    state: next,
    message: `Skipped ${JOBS[current].title}. Next is ${JOBS[next.job].title}. No wage.`,
    haul: false,
    banked: 0,
    matched: false,
  };
}

export function resolveWrongLoad(state: CareerState): CareerResult {
  const next = copy(state);
  next.failures += 1;
  next.reputation = Math.max(0, next.reputation - 1);
  if (next.status === "hired") {
    next.standing = clamp(next.standing - ECONOMY.standingWrong, 0, 100);
    next.job = assignedJob(next);
    next.roofActive = false;
  } else if (!isUnlocked(next, next.job).ok) {
    next.job = "yard";
    next.leg = 0;
    next.roofActive = false;
  }
  const still = activeOffer(next);
  return {
    ok: true,
    state: next,
    message: `Wrong load. No pay. The call is still ${still.title}.`,
    haul: false,
    banked: 0,
    matched: false,
  };
}

export function resolveFailure(state: CareerState, kind: "drop" | "tip"): CareerResult {
  const next = copy(state);
  const offer = activeOffer(state);
  next.failures += 1;
  next.reputation = Math.max(0, next.reputation - (kind === "tip" ? 2 : 1));

  if (next.status === "hired") {
    const dock = kind === "tip" ? offer.take : Math.round(offer.take * 0.5);
    const paid = Math.min(next.cash, dock);
    next.cash -= paid;
    next.standing = clamp(next.standing - (kind === "tip" ? ECONOMY.standingTip : ECONOMY.standingDrop), 0, 100);
    if (kind === "tip") next.downtime = Math.min(ECONOMY.downtimeCap, next.downtime + 1);
    next.job = assignedJob(next);
    next.leg = 0;
    next.roofActive = false;
    next.incidents = [...next.incidents, { kind, job: state.job, cost: paid, insurance: 0 }].slice(-10);
    const dockLine = paid > 0 ? `Hargrove docked ${money(paid)}.` : "Hargrove had nothing left to dock.";
    const message =
      kind === "tip"
        ? `The crane went over. ${dockLine} Standing is ${next.standing}. A yard move is the only call until downtime clears.`
        : `Dropped load. ${dockLine} Standing is ${next.standing}.`;
    return { ok: true, state: next, message, haul: false, banked: -paid, matched: false };
  }

  const bill = REPAIR[next.crane] * (kind === "tip" ? 2 : 1);
  // A tip is an insurance event as well as a repair. The cover is charged with
  // the bill, so the ledger shows the real cost of going over.
  const cover = kind === "tip" ? Math.round(REPAIR[next.crane] * 0.12) : 0;
  const paid = Math.min(next.cash, bill + cover);
  next.cash -= paid;
  const unpaid = paid < bill;
  const insurance = Math.min(cover, Math.max(0, paid - bill));
  next.incidents = [...next.incidents, { kind, job: state.job, cost: paid - insurance, insurance }].slice(-10);
  if (kind === "tip" || unpaid) next.downtime = Math.min(ECONOMY.downtimeCap, next.downtime + 1);
  if (!isUnlocked(next, next.job).ok) {
    next.job = "yard";
    next.leg = 0;
    next.roofActive = false;
  } else {
    next.roofActive = roofFor(next.job);
  }
  const what = kind === "tip" ? "Crane went over." : "Dropped load.";
  const billLine = unpaid
    ? `Shop bill took ${money(paid)}, all you had.`
    : `Shop bill ${money(paid - insurance)}.`;
  const coverLine = insurance > 0 ? ` Insurance ${money(insurance)}.` : "";
  const shop = next.downtime > 0 ? " One shop shift. A yard move clears it." : "";
  const locked = next.job === "yard" && state.job !== "yard" ? " That call is off the board." : "";
  return {
    ok: true,
    state: next,
    message: `${what} ${billLine}${coverLine} You have ${money(next.cash)}.${shop}${locked}`,
    haul: false,
    banked: -paid,
    matched: false,
  };
}

export function careerSummary(state: CareerState) {
  const offer = activeOffer(state);
  const found = canFound(state);
  return {
    company: companyName(state),
    status: statusLine(state),
    employer: employerLine(state),
    cash: money(state.cash),
    cashValue: state.cash,
    note: state.note,
    crane: CRANES[state.crane].label,
    craneId: state.crane,
    buy: buyLabel(state),
    buyDetail: buyDetail(state),
    progress: state.status === "hired" ? `STANDING ${state.standing}` : `REP ${state.reputation}`,
    standing: state.standing,
    reputation: state.reputation,
    jobsDone: state.jobsDone,
    downtime: state.downtime,
    call: contractLabel(state),
    callTitle: offer.title,
    level: offer.no,
    levelTheme: offer.theme,
    levelBrief: offer.brief,
    levelKind: offer.kind,
    levelCount: LEVEL_COUNT,
    rentalStep: state.status === "hired" ? Math.min(RENTAL_LEVELS.length, state.jobsDone + 1) : 0,
    rentalTotal: RENTAL_LEVELS.length,
    tutorial: state.status === "hired" && offer.phase === "tutorial",
    found,
    hired: state.status === "hired",
    best: offer.best,
    gradeCounts: state.gradeCounts,
    sets: GRADE_ORDER.reduce((sum, grade) => sum + (state.gradeCounts[grade] ?? 0), 0),
    campaignDone: campaignComplete(state),
    upgrades: state.upgrades,
    wear: state.wear,
    wearLabel: wearLabel(state.wear),
    serviceCost: serviceCost(state.wear),
    bestRuns: state.bestRuns,
    recentSets: state.recentSets,
    incidents: state.incidents,
    lastIncident: state.incidents[state.incidents.length - 1] ?? null,
  };
}

function migrateLegacy(input: { cash: number; crane: CraneId; reputation: number; roofDone: boolean; roofActive: boolean }): CareerState {
  const next = freshCareer();
  next.cash = input.cash;
  next.crane = input.crane;
  next.reputation = input.reputation;
  next.roofDone = input.roofDone;
  next.crawlerOnSite = input.crane !== "crawler";
  const progressed = input.crane !== "rental" || input.cash >= 800 || input.reputation >= 2 || input.roofDone;
  if (!progressed) {
    next.status = "hired";
    next.job = "yard";
    next.roofActive = false;
    next.standing = ECONOMY.startStanding;
    return next;
  }
  next.status = "independent";
  next.standing = 80;
  next.jobsDone = input.reputation;
  if (input.roofActive && !input.roofDone) {
    next.job = reachesRoof(input.crane) ? "roof" : "yard";
    next.roofActive = true;
  } else {
    next.job = "yard";
    next.roofActive = false;
  }
  return next;
}

export function loadCareer(raw: unknown): CareerState {
  if (!raw || typeof raw !== "object") return freshCareer();
  const record = raw as Record<string, unknown>;
  const cash = finite(record.cash, 0);
  const crane = isCrane(record.crane) ? record.crane : "rental";
  const reputation = finite(record.reputation, 0, 0, 9999);
  const roofDone = record.roofDone === true;
  const roofActive = record.roofActive === true;
  const versioned =
    record.v === 2 || record.v === 3 || record.v === 4 || record.status === "hired" || record.status === "independent";
  if (!versioned) return migrateLegacy({ cash, crane, reputation, roofDone, roofActive });

  const next = freshCareer();
  next.cash = cash;
  next.crane = crane;
  next.reputation = reputation;
  next.roofDone = roofDone;
  next.status = record.status === "independent" ? "independent" : "hired";
  next.standing = finite(record.standing, next.status === "hired" ? ECONOMY.startStanding : 80, 0, 100);
  next.jobsDone = finite(record.jobsDone, 0, 0, 100000);
  next.failures = finite(record.failures, 0, 0, 100000);
  next.downtime = finite(record.downtime, 0, 0, ECONOMY.downtimeCap);
  next.contract = finite(record.contract, 0, 0, 100000);
  next.leg = record.leg === 1 ? 1 : 0;
  next.note = finite(record.note, 0);
  next.upgrades = readUpgrades(record.upgrades);
  next.wear = finite(record.wear, 0, 0, 100);
  next.bestRuns = readBestRuns(record.bestRuns);
  next.recentSets = readRecentSets(record.recentSets);
  next.incidents = readIncidents(record.incidents);
  const savedBest = record.bestGrades;
  if (savedBest && typeof savedBest === "object") {
    const table = savedBest as Record<string, unknown>;
    for (const job of ALL_JOBS) {
      const grade = table[job];
      if (grade === "S" || grade === "A" || grade === "B" || grade === "C") next.bestGrades[job] = grade;
    }
  }
  const savedCounts = record.gradeCounts;
  if (savedCounts && typeof savedCounts === "object") {
    const table = savedCounts as Record<string, unknown>;
    next.gradeCounts = {
      S: finite(table.S, 0, 0, 1_000_000),
      A: finite(table.A, 0, 0, 1_000_000),
      B: finite(table.B, 0, 0, 1_000_000),
      C: finite(table.C, 0, 0, 1_000_000),
    };
  }
  if (record.crawlerOnSite === false) next.crawlerOnSite = false;
  else if (record.crawlerOnSite === true) next.crawlerOnSite = true;
  else next.crawlerOnSite = crane !== "crawler";
  if (isJob(record.job)) next.job = record.job;
  if (next.status === "hired") next.job = assignedJob(next);
  if (next.job === "roof" && !reachesRoof(next.crane)) {
    next.job = "yard";
    next.roofActive = false;
  }
  if (next.status === "independent" && !isUnlocked(next, next.job).ok) {
    next.job = "yard";
    next.leg = 0;
  }
  next.roofActive = next.status === "independent" && roofFor(next.job);
  return next;
}

export function saveCareer(state: CareerState) {
  return { ...state, v: 4 as const };
}

export const CAREER_BACKUP_KEY = "slingline-career-backup";

function readStored(storage: Store, key: string): CareerState | null {
  try {
    const text = storage.getItem(key);
    if (!text) return null;
    return loadCareer(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/**
 * Read the career, falling back to the last good copy when the primary save is
 * corrupt or half-written. A crash mid-write should cost one session, not a
 * campaign.
 */
export function readCareer(storage: Store): CareerState {
  return readStored(storage, CAREER_KEY) ?? readStored(storage, CAREER_BACKUP_KEY) ?? freshCareer();
}

export function writeCareer(state: CareerState, storage: Store) {
  const text = JSON.stringify(saveCareer(state));
  try {
    const previous = storage.getItem(CAREER_KEY);
    if (previous) storage.setItem(CAREER_BACKUP_KEY, previous);
  } catch {
    /* a full quota should not stop the new save */
  }
  storage.setItem(CAREER_KEY, text);
}

export function readCareerStore(): CareerState {
  try {
    if (typeof localStorage === "undefined") return freshCareer();
    return readCareer(localStorage);
  } catch {
    return freshCareer();
  }
}

export function writeCareerStore(state: CareerState) {
  try {
    if (typeof localStorage === "undefined") return;
    writeCareer(state, localStorage);
  } catch {
    /* private mode */
  }
}
