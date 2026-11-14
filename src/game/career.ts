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

export type { CraneId } from "./cranes.ts";
export type { Grade } from "./grade.ts";
export type { LoadKind } from "./loads.ts";
export type { SiteTheme } from "./levels.ts";
export { CRANES, CRANE_CHOICES, nextCrane, reachesRoof } from "./cranes.ts";

export type CareerStatus = "hired" | "independent";
export type JobId =
  | "yard"
  | "pipe"
  | "pad"
  | "truss"
  | "steel"
  | "panel"
  | "double"
  | "heavy"
  | "container"
  | "floor"
  | "night"
  | "roof"
  | "hvac"
  | "tracks"
  | "spa";

export const CAREER_KEY = "slingline-career";
export const BOSS = "Hargrove Crane";

/**
 * Published economy. Hired pay is a wage, a share of the contract.
 * Independence costs a filing fee. Cranes are bought with a down payment;
 * the rest is a note taken out of later contracts. Fuel comes off every
 * paid call once the company is yours. A yard move always clears more than
 * it costs, so a bad streak cannot trap the player.
 */
export const ECONOMY = {
  wageShare: 0.35,
  shortWageShare: 0.6,
  waryShare: 0.8,
  foundCash: 1900,
  foundJobs: 4,
  foundStanding: 60,
  foundFee: 1000,
  startStanding: 70,
  hiredVarietyJobs: 2,
  hiredVarietyStanding: 45,
  hiredTrussJobs: 3,
  hiredTrussStanding: 55,
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

type JobDef = {
  id: JobId;
  /** Campaign number, shown on the board and the HUD. */
  no: number;
  title: string;
  kind: LoadKind;
  pad: number;
  theme: SiteTheme;
  brief: string;
  pay: number;
  /** Set ring radius in metres: how far off centre the load may land. */
  ring: number;
  follow?: { title: string; kind: LoadKind; pad: number; pay: number; ring: number };
  rep: number;
  crane: CraneId;
  roof: boolean;
  repGain: number;
};

/**
 * The campaign. Levels 1-4 are Hargrove's rental shifts: the player takes a
 * wage, learns each control, and earns the filing fee. From level 5 the
 * player owns the call, picks the crane, and each site changes with the work.
 */
const JOBS: Record<JobId, JobDef> = {
  yard: {
    id: "yard",
    no: 1,
    title: "YARD MOVE",
    kind: "crate",
    pad: 5,
    theme: "yard",
    brief: "A crate has to cross the yard. Hook it, keep the sway down, and set it inside the amber ring.",
    pay: 900,
    rep: 0,
    crane: "rental",
    roof: false,
    repGain: 1,
    ring: 2.4,
  },
  pipe: {
    id: "pipe",
    no: 2,
    title: "PIPE DROP",
    kind: "pipe",
    pad: 3,
    theme: "steel",
    brief: "Line pipe is stacked by the rack. Long loads swing wide — bring it across flat and set it without rolling the ring.",
    pay: 1500,
    rep: 0,
    crane: "rental",
    roof: false,
    repGain: 1,
    ring: 1.6,
  },
  pad: {
    id: "pad",
    no: 3,
    title: "WAREHOUSE SET",
    kind: "crate",
    pad: 0,
    theme: "warehouse",
    brief: "A delivery crate comes off the truck and goes through the warehouse door. Short picks, tight set.",
    pay: 1200,
    rep: 1,
    crane: "rental",
    roof: false,
    repGain: 1,
    ring: 2.2,
  },
  truss: {
    id: "truss",
    no: 4,
    title: "TRUSS PICK",
    kind: "truss",
    pad: 4,
    theme: "tower",
    brief: "A roof truss is waiting at the laydown. It is long, light, and catches every gust — keep the tag line steady.",
    pay: 2200,
    rep: 1,
    crane: "rental",
    roof: false,
    repGain: 2,
    ring: 1.2,
  },
  steel: {
    id: "steel",
    no: 5,
    title: "STEEL SET",
    kind: "beam",
    pad: 1,
    theme: "steel",
    brief: "Structural beams for the frame. Set the beam square in the ring — a rolled beam is a rework bill.",
    pay: 2400,
    rep: 3,
    crane: "yard",
    roof: false,
    repGain: 1,
    ring: 1.1,
  },
  panel: {
    id: "panel",
    no: 7,
    title: "PANEL SET",
    kind: "panel",
    pad: 2,
    theme: "tower",
    brief: "Precast wall panels come off the rack flat. Keep the load level; a panel that tips is scrap.",
    pay: 5200,
    rep: 5,
    crane: "heavy",
    roof: false,
    repGain: 2,
    ring: 1.3,
  },
  heavy: {
    id: "heavy",
    no: 8,
    title: "HEAVY PICK",
    kind: "heavy",
    pad: 2,
    theme: "yard",
    brief: "A machine base on the skids. Over the chart it will pull the boom and the yard with it.",
    pay: 5000,
    rep: 7,
    crane: "heavy",
    roof: false,
    repGain: 2,
    ring: 1.5,
  },
  container: {
    id: "container",
    no: 9,
    title: "CONTAINER PICK",
    kind: "container",
    pad: 2,
    theme: "port",
    brief: "A loaded box off the stack at the docks. Long and heavy, and it catches the wind off the water.",
    pay: 4600,
    rep: 8,
    crane: "heavy",
    roof: false,
    repGain: 2,
    ring: 1.4,
  },
  floor: {
    id: "floor",
    no: 10,
    title: "FLOOR SET",
    kind: "beam",
    pad: 0,
    theme: "tower",
    brief: "Beams for the next floor of the rise. The load goes over the parapet and down between the columns.",
    pay: 3600,
    rep: 6,
    crane: "yard",
    roof: true,
    repGain: 2,
    ring: 1,
  },
  night: {
    id: "night",
    no: 11,
    title: "NIGHT CALL",
    kind: "beam",
    pad: 4,
    theme: "yard",
    brief: "The yard runs all night under the floods. Same beam, less light, and the work lights are yours to switch.",
    pay: 3000,
    rep: 5,
    crane: "yard",
    roof: false,
    repGain: 1,
    ring: 1,
  },
  roof: {
    id: "roof",
    no: 12,
    title: "ROOF SET",
    kind: "beam",
    pad: 0,
    theme: "tower",
    brief: "A beam for the roof line. This crane can just reach it, and the ring is small.",
    pay: 7000,
    rep: 9,
    crane: "yard",
    roof: true,
    repGain: 2,
    ring: 0.8,
  },
  hvac: {
    id: "hvac",
    no: 13,
    title: "ROOFTOP UNIT",
    kind: "hvac",
    pad: 0,
    theme: "tower",
    brief: "A packaged rooftop unit for the high-rise. Over the parapet, down on the curb, and do not clip the edge.",
    pay: 8200,
    rep: 11,
    crane: "lattice",
    roof: true,
    repGain: 3,
    ring: 0.9,
  },
  tracks: {
    id: "tracks",
    no: 14,
    title: "TRACK PICK",
    kind: "heavy",
    pad: 2,
    theme: "yard",
    brief: "Crawler pick on the lowboy pad. Walk the tracks in, set the pads, and lift the base off the deck.",
    pay: 8600,
    rep: 12,
    crane: "crawler",
    roof: false,
    repGain: 3,
    ring: 1.3,
  },
  double: {
    id: "double",
    no: 15,
    title: "DOUBLE RUN",
    kind: "crate",
    pad: 5,
    theme: "warehouse",
    brief: "Two loads, one call. Set the crate, then the beam, and keep the clock and the sway on your side.",
    pay: 1100,
    follow: { title: "DOUBLE RUN 2", kind: "beam", pad: 3, pay: 4400, ring: 1 },
    rep: 6,
    crane: "heavy",
    roof: false,
    repGain: 1,
    ring: 1.9,
  },
  spa: {
    id: "spa",
    no: 6,
    title: "BACKYARD SPA DECK",
    kind: "deck",
    pad: 6,
    theme: "residential",
    brief: "A tight backyard renovation: set the wrapped decking bundle on the marked pad, then fly the empty hot tub through the narrow work area onto the new patio. Keep the load level and the swing small beside the house and fence.",
    pay: 3200,
    follow: { title: "HOT TUB SET", kind: "hotTub", pad: 7, pay: 6200, ring: 0.95 },
    rep: 3,
    crane: "yard",
    roof: false,
    repGain: 4,
    ring: 1.2,
  },
};

const JOB_ORDER: JobId[] = [
  "yard",
  "pipe",
  "pad",
  "truss",
  "steel",
  "spa",
  "panel",
  "heavy",
  "container",
  "floor",
  "night",
  "roof",
  "hvac",
  "tracks",
  "double",
];

/** Hargrove's rental shifts, in order. */
export const RENTAL_LEVELS: JobId[] = ["yard", "pipe", "pad", "truss"];

export const LEVEL_COUNT = JOB_ORDER.length;

/** Level card data for the board and the HUD. */
export function levelOf(job: JobId) {
  const def = JOBS[job] ?? JOBS.yard;
  return {
    id: def.id,
    no: def.no,
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
  v: 2;
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
};

export type JobOffer = {
  id: JobId;
  no: number;
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
    v: 2,
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
  return JOB_ORDER.includes(value as JobId);
}

function copy(state: CareerState): CareerState {
  return { ...state };
}

function roofFor(job: JobId) {
  return JOBS[job].roof;
}

function veteranBump(state: CareerState) {
  return Math.min(ECONOMY.veteranCap, Math.floor(state.jobsDone / ECONOMY.veteranEvery) * ECONOMY.veteranStep);
}

export function assignedJob(state: CareerState): JobId {
  // A rental shift is picked by the record, not by the player: one new lesson
  // per clean job, and a yard move is always the way out of downtime.
  if (state.downtime > 0) return "yard";
  if (state.jobsDone >= ECONOMY.hiredTrussJobs) {
    return state.standing >= ECONOMY.hiredTrussStanding ? "truss" : "yard";
  }
  if (state.jobsDone >= ECONOMY.hiredVarietyJobs) {
    return state.standing >= ECONOMY.hiredVarietyStanding ? "pad" : "yard";
  }
  if (state.jobsDone >= 1) return "pipe";
  return "yard";
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
    if (job === "pipe" && state.jobsDone < 1) {
      return { ok: false, reason: "Hargrove puts the pipe drop on your list after the first clean yard move." };
    }
    if (job === "pad") {
      if (state.jobsDone < ECONOMY.hiredVarietyJobs) {
        return { ok: false, reason: `Hargrove assigns a warehouse set after ${ECONOMY.hiredVarietyJobs - state.jobsDone} more clean job${ECONOMY.hiredVarietyJobs - state.jobsDone === 1 ? "" : "s"}.` };
      }
      if (state.standing < ECONOMY.hiredVarietyStanding) {
        return { ok: false, reason: `Standing is ${state.standing}. Hargrove wants ${ECONOMY.hiredVarietyStanding} before a warehouse set.` };
      }
      return { ok: true, reason: "Hargrove put a warehouse set on your list." };
    }
    if (job === "truss") {
      if (state.jobsDone < ECONOMY.hiredTrussJobs) {
        return { ok: false, reason: `Hargrove assigns the truss pick after ${ECONOMY.hiredTrussJobs - state.jobsDone} more clean job${ECONOMY.hiredTrussJobs - state.jobsDone === 1 ? "" : "s"}.` };
      }
      if (state.standing < ECONOMY.hiredTrussStanding) {
        return { ok: false, reason: `Standing is ${state.standing}. Hargrove wants ${ECONOMY.hiredTrussStanding} before a truss pick.` };
      }
      return { ok: true, reason: "Hargrove put a truss pick on your list." };
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
  if (job === "roof" && !reachesRoof(state.crane)) {
    return { ok: false, reason: "This crane cannot reach the roof. The floor set is the one that fits." };
  }
  if (job === "tracks" && !state.crawlerOnSite) {
    return { ok: false, reason: "Crawler is on the lowboy. Deliver it to the pad, then this pick pays." };
  }
  if (job === "heavy" && craneRank(state.crane) < craneRank("lattice")) {
    return { ok: true, reason: "This block is over the heavy crane's chart. It can still come up, and it can pull you over." };
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
  };
}

export function jobBoard(state: CareerState): JobOffer[] {
  return JOB_ORDER.map((id) => {
    const gate = isUnlocked(state, id);
    const gross = grossFor(state, id, 0);
    const current = (state.status === "hired" ? assignedJob(state) : state.job) === id;
    return {
      id,
      no: JOBS[id].no,
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
  next.reputation = Math.max(1, next.reputation);
  next.standing = 100;
  return { ok: true, state: next, message: FOUNDING_MESSAGE, haul: false, banked: 0, matched: false };
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

export function resolveSet(state: CareerState, load: LoadKind, grade: Grade = "B"): CareerResult {
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

  let message = `${payLine(next, offer, banked, upkeep, notePaid)} Graded ${grade}.`;

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
    if (offer.id === "floor" || offer.id === "roof") next.roofDone = true;
    next.roofActive = roofFor(next.job);
    if (next.downtime > 0 && offer.id === "yard") {
      next.downtime -= 1;
      message += next.downtime > 0 ? " One shop shift is cleared." : " The crane is out of the shop.";
    }
  }

  return { ok: true, state: next, message, haul: false, banked, matched: true };
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
    const dockLine = paid > 0 ? `Hargrove docked ${money(paid)}.` : "Hargrove had nothing left to dock.";
    const message =
      kind === "tip"
        ? `The crane went over. ${dockLine} Standing is ${next.standing}. A yard move is the only call until downtime clears.`
        : `Dropped load. ${dockLine} Standing is ${next.standing}.`;
    return { ok: true, state: next, message, haul: false, banked: -paid, matched: false };
  }

  const bill = REPAIR[next.crane] * (kind === "tip" ? 2 : 1);
  const paid = Math.min(next.cash, bill);
  next.cash -= paid;
  const unpaid = paid < bill;
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
    : `Shop bill ${money(paid)}.`;
  const shop = next.downtime > 0 ? " One shop shift. A yard move clears it." : "";
  const locked = next.job === "yard" && state.job !== "yard" ? " That call is off the board." : "";
  return {
    ok: true,
    state: next,
    message: `${what} ${billLine} You have ${money(next.cash)}.${shop}${locked}`,
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
    found,
    hired: state.status === "hired",
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
    next.job = reachesRoof(input.crane) ? "roof" : "floor";
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
  const versioned = record.v === 2 || record.status === "hired" || record.status === "independent";
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
  if (record.crawlerOnSite === false) next.crawlerOnSite = false;
  else if (record.crawlerOnSite === true) next.crawlerOnSite = true;
  else next.crawlerOnSite = crane !== "crawler";
  if (isJob(record.job)) next.job = record.job;
  if (next.status === "hired") next.job = assignedJob(next);
  if (next.job === "roof" && !reachesRoof(next.crane)) next.job = "floor";
  if (next.status === "independent" && !isUnlocked(next, next.job).ok) {
    next.job = "yard";
    next.leg = 0;
  }
  next.roofActive = next.status === "independent" && roofFor(next.job);
  return next;
}

export function saveCareer(state: CareerState) {
  return { ...state, v: 2 as const };
}

export function readCareer(storage: Store): CareerState {
  try {
    const text = storage.getItem(CAREER_KEY);
    if (!text) return freshCareer();
    return loadCareer(JSON.parse(text) as unknown);
  } catch {
    return freshCareer();
  }
}

export function writeCareer(state: CareerState, storage: Store) {
  storage.setItem(CAREER_KEY, JSON.stringify(saveCareer(state)));
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
