import type { Actions } from "./input.ts";
import { CRANES } from "./cranes.ts";
import {
  effectiveImpactLimit,
  gradeBreakdown,
  gradeCost,
  gradeSet,
  gradeRep,
  gradeTipFor,
  type Grade,
  type SetParts,
} from "./grade.ts";
import { upgradeEffects, wearPenalty } from "./upgrades.ts";
import {
  acceptJob as acceptCareerJob,
  activeOffer,
  buyCrane as buyCareerCrane,
  buyDetail,
  buyLabel as careerBuyLabel,
  buyUpgradeLevel,
  campaignComplete,
  companyName as careerCompanyName,
  nextUpgradeCost,
  serviceCareerCrane,
  contractLabel as careerContractLabel,
  employerLine,
  foundCompany as foundCareer,
  freshCareer,
  money,
  readCareerStore,
  resolveFailure,
  resolveSet,
  skipTutorial as skipCareerTutorial,
  statusLine,
  writeCareerStore,
  type CareerState,
  type CraneId,
  type JobId,
  type LoadKind,
  type UpgradeId,
} from "./career.ts";
import { YARD_DECOYS, loadSpec } from "./loads.ts";
import { JOBS } from "./jobs.ts";
import { mulberry32, writeDailyResult, type DailyRun } from "./daily.ts";

export type { CraneId, JobId, LoadKind } from "./career.ts";
export { CRANE_CHOICES } from "./cranes.ts";

/** Source of randomness. Inject a seeded generator to make a run repeatable. */
export type Random = () => number;

export type Mode = "easy" | "hard";
export type Pace = "slow" | "steady" | "fast";
export type JobPhase = "seek" | "carry" | "broke" | "done";

export type YardPiece = {
  kind: LoadKind;
  x: number;
  z: number;
  y: number;
  /** Yaw of the load on the ground or on the hook, in radians. */
  yaw: number;
  homeX: number;
  homeZ: number;
};
export type CraneState = "driving" | "lifting";

export type Pad = { x: number; z: number };

export const YARD_BLOCKS: { x: number; z: number; hx: number; hz: number }[] = [
  { x: -24, z: -20, hx: 1.5, hz: 3.3 },
  { x: 26, z: 8, hx: 1.5, hz: 3.3 },
  { x: 22, z: 22, hx: 1.5, hz: 3.3 },
  { x: -26, z: 12, hx: 1.5, hz: 3.3 },
  { x: -18, z: 24, hx: 3.4, hz: 2.4 },
  { x: 40, z: -32, hx: 8, hz: 6.5 },
  // Laydown and the parked flatbed in scenery.ts. Kept off the pads, the loads, and the lowboy ring.
  { x: -38, z: -30, hx: 3.4, hz: 4.2 },
  { x: 38, z: 40, hx: 2.4, hz: 4.6 },
  { x: 22, z: -42, hx: 1.8, hz: 2.8 },
];
const RESIDENTIAL_HOUSE_BLOCKS = [
  { x: -102, z: 30, hx: 7, hz: 5, top: 8.4 },
  { x: -134, z: 30, hx: 4.5, hz: 4, top: 6.4 },
  { x: -120, z: 30, hx: 4.5, hz: 4, top: 6.4 },
  { x: -80, z: 30, hx: 4.5, hz: 4, top: 6.4 },
  { x: -68, z: 30, hx: 4.5, hz: 4, top: 6.4 },
];
export const HOUSES = RESIDENTIAL_HOUSE_BLOCKS;
export const MAPLE_LANE_START = { x: -130, z: 8, heading: Math.PI / 2 } as const;
export const MAPLE_LANE_SETUP = { x: -92, z: 30, radius: 3.4 } as const;
export const WIND_FARM_START = { x: 80, z: 79, heading: Math.PI / 2 } as const;
const WIND_TURBINE_BLOCKS = [
  { x: 103, z: 97, hx: 1.3, hz: 1.3 },
  { x: 72, z: 102, hx: 1.1, hz: 1.1 },
  { x: 116, z: 76, hx: 1.1, hz: 1.1 },
];

export const LOWBOY_DROP = { x: 4, z: 10 };

export const PADS: Pad[] = [
  { x: 0, z: -9 },
  { x: 13, z: -8 },
  { x: 12, z: 14 },
  { x: 4, z: 30 },
  { x: -8, z: -2 },
  { x: 7, z: -3 },
  { x: -101, z: 41 },
  { x: -99, z: 42 },
  { x: -4, z: -6 },
  { x: -90, z: 40 },
  { x: 87, z: 79 },
  { x: 97, z: 85 },
  // Second bearing pad for the quay girder. It sits 5.2 m from pad 3, which is
  // the girder's length, so a square set lands an end on each bearing.
  { x: 9.2, z: 30 },
  // The culvert saddles. They sit 6.4 m apart along the quay, which is the
  // pipe's length, so a pipe squared to the span lands an end on each saddle.
  { x: 16, z: 34 },
  { x: 22.4, z: 34 },
];

const TUNING = {
  easy: { damp: 3.4, assist: 2.4, settle: 4.2, brake: 0.42, impact: 5, wind: 0, snatch: 3.2 },
  hard: { damp: 0.22, assist: 0, settle: 0, brake: 0.12, impact: 1.45, wind: 1.35, snatch: 1.55 },
} as const;

const PACE_SCALE = { slow: 0.16, steady: 0.55, fast: 1 } as const;
const BEST_KEY = "slingline-best";
const STOP_PITCH = (44 * Math.PI) / 180;
const ROOF = { x: 36, z: -32, y: 13.11 };
const FLOOR = { x: 36, z: -32, y: 6.71 };

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/** Degrees between a heading and the wanted line, folded to a half turn. */
function offSquare(angle: number, want: number) {
  const delta = Math.atan2(Math.sin(angle - want), Math.cos(angle - want));
  // A panel or girder turned end for end is the same piece on the same
  // guides, so heading is measured modulo half a turn.
  const symmetric = Math.atan2(Math.sin(2 * delta), Math.cos(2 * delta)) / 2;
  return Math.abs((symmetric * 180) / Math.PI);
}

function readBest() {
  try {
    const n = Number(localStorage.getItem(BEST_KEY) || "0");
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeBest(n: number) {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    /* private mode */
  }
}

export type Boom = { x: number; y: number; z: number };

/** One wind gust: strength and unit direction. */
export type Gust = { amp: number; x: number; z: number };

/** What the debrief card reads after a set, and what the payout was built on. */
export type SetReport = {
  grade: Grade;
  /** Distance from the ring centre at touchdown, in metres. */
  off: number;
  /** The job's ring radius, in metres. */
  tolerance: number;
  /** Hook speed at touchdown, in m/s. */
  impact: number;
  /** Peak sway through the carry, in degrees. */
  sway: number;
  /** Peak load-chart ratio through the carry, where 1 is the limit. */
  chart: number;
  /** Degrees off the required heading at touchdown, for square landings. */
  heading?: number;
  /** The job's heading tolerance in degrees, or 0 when the set is ungraded. */
  headingTolerance?: number;
  /** The mode's impact limit for this load, after fragility. */
  impactLimit: number;
  /** Cash banked for the set, after the grade. */
  pay: number;
  /** Reputation the grade added. */
  rep: number;
  /** Each reading graded on its own, so the debrief can point at the cost. */
  parts: SetParts;
  /** The metric that decided the grade. */
  cost: string;
  /** One line on how to set it cleaner next time. */
  tip: string;
};

export class CraneSim {
  mode: Mode = "easy";
  pace: Pace = "steady";
  state: CraneState = "driving";
  truckX = 0;
  truckZ = 0;
  heading = 0;
  speed = 0;
  driveSteer = 0;
  roll = 0;
  rollRate = 0;
  leanSign = 0;
  outrigger = 0;
  stow = 1;
  hauling = false;
  crawlerOnSite = true;
  haulX = 0;
  haulZ = 0;
  haulH = 0;
  deployDir = 0;
  lateralG = 0;
  flipped = false;
  safetyLock = false;
  safetyBypass = false;
  bCanLift = false;
  prevVx = 0;
  prevVz = 0;
  yaw = 0;
  yawRate = 0;
  boomPitch = 0.85;
  pitchRate = 0;
  extension = 0;
  extendRate = 0;
  trolley = 14;
  trolleySpeed = 0;
  cable = 6.2;

  hx = 0;
  hy = 9;
  hz = -14;
  vx = 0;
  vy = 0;
  vz = 0;
  prevBx = 0;
  prevBy = 15.6;
  prevBz = -14;
  ready = false;

  attached = false;
  airborne = false;
  landed = false;
  phase: JobPhase = "seek";
  load: LoadKind = "crate";
  from = 8;
  to = 1;
  score = 0;
  best = 0;
  career: CareerState = readCareerStore();
  practicing = false;
  /** The seeded daily run in progress, if any. Never saved to the career. */
  daily: DailyRun | null = null;
  /** Real career, held aside while a test job is loaded. */
  private careerHold: CareerState | null = null;
  careerBeat: string | null = null;
  /** Heading for the beat card: filing the company or finishing the ridge. */
  beatTitle = "The papers are filed";
  boardPause = false;
  /** Player pause. Escape toggles it; the sim does not advance while set. */
  paused = false;
  toast = "";
  toastLeft = 0;
  crane: CraneId = "rental";
  message = "You work for Hargrove. Take the wage and set the crate.";
  private flipBilled = false;
  private padStrike = 0;
  private boomStrike = 0;
  private padClear = 0;
  private boomClear = 0;
  private currentSite: "yard" | "residential" | "windFarm" | null = null;
  warn = false;
  /** Crane work lights, switched on by the player after dark. */
  lightsOn = false;
  /** Run any job at night, from the lighting setting. */
  night = false;
  swayDeg = 0;
  hookSpeed = 0;
  tipSpeed = 0;
  limitRatio = 0;
  limitState: "ok" | "near" | "over" = "ok";
  limitHold = 0;
  side = 0;
  along = 0;

  windX = 1;
  windZ = 0;
  windAmp = 0.8;
  gust = 0;
  /** The next two gusts, so hard mode can be read before it hits. */
  private gustForecast: Gust[] = [];

  breakFlash = 0;
  deliverFlash = 0;
  impulse = 0;

  /** Peak readings for the set in progress. Reset when a load comes on the hook. */
  peakSway = 0;
  peakChart = 0;
  lastSet: SetReport | null = null;
  debriefLeft = 0;
  /** A finished set keeps its debrief up until the player dismisses it. */
  debriefHold = false;
  /** Touchdown speed of the last set, so the grade cue can match its quality. */
  lastImpact = 0;
  /** Impact limit used for the last set, for the audio pitch. */
  lastImpactLimit = 1;

  cx = 0;
  cy = 0.8;
  cz = -18;
  pieces: YardPiece[] = [];
  carry: number | null = null;
  hookGap = 99;
  hookReady = false;
  hookLabel = "";
  private latch: number | null = null;

  baseLen = 5.5;
  extendMax = 6;
  readonly mountBack = 1.6;
  mountY = 2.15;
  readonly cableMin = 0.55; // Allow the hook to reach ground-level pickup points beneath the boom.
  readonly cableMax = 14.7;
  rng: Random;
  readonly hang = 0.95;

  constructor(rng: Random = Math.random) {
    this.rng = rng;
    this.best = readBest();
    this.career = readCareerStore();
    this.crane = this.career.crane;
    this.crawlerOnSite = this.career.crawlerOnSite;
    this.applyCrane();
    this.stockYard(true);
    if (this.crane === "crawler" && !this.career.crawlerOnSite) this.beginHaul();
  }

  get cash() {
    return this.career.cash;
  }

  get reputation() {
    return this.career.reputation;
  }

  get roofDone() {
    return this.career.roofDone;
  }

  get roofActive() {
    return this.career.roofActive;
  }

  /** Centre tolerance of the active job's set ring, in metres. */
  get setTolerance() {
    return activeOffer(this.career).ring;
  }

  /** Bearing pad index for a two-pad set, or null for an ordinary ring. */
  get secondPad(): number | null {
    return JOBS[this.career.job].pad2 ?? null;
  }

  /** Required load heading for the active call, or null when it is free. */
  get headingTarget(): number | null {
    return JOBS[this.career.job].heading ?? null;
  }

  /** The heading of the cargo itself: a set load keeps the angle it landed at. */
  private loadYaw() {
    const carried = this.carry != null ? this.pieces[this.carry] : undefined;
    return carried ? carried.yaw : this.yaw;
  }

  /** Degrees between the load's current heading and the job's guides. */
  headingError(): number | null {
    const want = this.headingTarget;
    return want === null ? null : offSquare(this.loadYaw(), want);
  }

  /**
   * Degrees between the carrier's heading and the job's guides while the rig
   * is still being spotted. The pads lock this heading in, so the player can
   * square the truck before the boom goes live. Nothing to square once the
   * load is on the hook or the crawler is still on the lowboy.
   */
  setupHeadingError(): number | null {
    const want = this.headingTarget;
    if (want === null || this.phase !== "seek" || this.state === "lifting" || this.hauling) return null;
    return offSquare(this.heading, want);
  }

  get atMapleSetup() {
    return Math.hypot(this.truckX - MAPLE_LANE_SETUP.x, this.truckZ - MAPLE_LANE_SETUP.z) <= MAPLE_LANE_SETUP.radius;
  }

  /** The load is resting on the mark and the set can be signed off. */
  get canRelease() {
    if (!this.attached || !this.landed) return false;
    return this.setSpot().meters <= this.setTolerance;
  }

  /** Ridge work shares the wind-farm staging, map bounds and site dressing. */
  get windSite() {
    return this.career.job === "wind" || this.career.job === "rotor";
  }

  /** Any backyard call shares Maple Lane, its houses and its map bounds. */
  private get residentialSite() {
    return JOBS[this.career.job].theme === "residential";
  }

  /** Next couple of gusts, in order, for the hard-mode forecast. */
  windForecast() {
    if (this.mode !== "hard" || this.state !== "lifting") return [];
    return this.gustForecast.slice(0, 2).map((gust, index) => ({
      seconds: Math.max(0, 4 - this.gust) + index * 4,
      amp: gust.amp,
      bearing: (Math.atan2(gust.x, -gust.z) * 180) / Math.PI,
    }));
  }

  private rollGust(): Gust {
    const ang = this.rng() * Math.PI * 2;
    return { amp: 0.55 + this.rng() * 0.85, x: Math.cos(ang), z: Math.sin(ang) };
  }

  /** The gust that is about to hit, for the HUD telegraph and its whoosh. */
  gustWarning() {
    if (this.mode !== "hard" || this.state !== "lifting" || this.flipped) return null;
    const next = this.gustForecast[0];
    if (!next) return null;
    return {
      seconds: Math.max(0, 4 - this.gust),
      amp: next.amp,
      bearing: (Math.atan2(next.x, -next.z) * 180) / Math.PI,
    };
  }

  /** Handling values bought in the shop, read live from the career save. */
  private upgrades() {
    return upgradeEffects(this.career.upgrades);
  }

  /** Buy one handling upgrade from the shop. */
  buyUpgrade(id: UpgradeId) {
    if (this.practicing) {
      this.message = "Practice does not spend career money.";
      return;
    }
    const result = buyUpgradeLevel(this.career, id);
    this.say(result.message);
    if (!result.ok) return;
    this.adopt(result.state);
    this.writeCareer();
  }

  /** Clear wear at the shop. */
  serviceCrane() {
    if (this.practicing) {
      this.message = "Practice does not service the career crane.";
      return;
    }
    const result = serviceCareerCrane(this.career);
    this.say(result.message);
    if (!result.ok) return;
    this.adopt(result.state);
    this.writeCareer();
  }

  upgradeCost(id: UpgradeId) {
    return nextUpgradeCost(this.career, id);
  }

  setPaused(on: boolean) {
    this.paused = on;
  }

  dismissDebrief() {
    this.debriefHold = false;
    this.debriefLeft = 0;
  }

  private applyCrane() {
    const spec = CRANES[this.crane];
    this.extendMax = spec.extend;
    this.baseLen = spec.base;
    this.mountY = spec.mount;
  }

  selectCrane(id: CraneId) {
    this.practicing = true;
    this.daily = null;
    this.crane = id;
    this.applyCrane();
    if (this.extension > this.extendMax) this.extension = this.extendMax;
    this.hauling = false;
    this.crawlerOnSite = true;
    if (id === "crawler") {
      this.beginHaul();
      this.message = "Practice crawler. It is on the lowboy. Nothing is saved.";
      return;
    }
    this.message = `${CRANES[id].label} practice. Nothing is saved.`;
  }

  /** Load any job on any crane. The saved career is put back when the shift ends. */
  practiceJob(job: JobId, crane: CraneId) {
    if (!this.careerHold) this.careerHold = this.career;
    const held = this.careerHold;
    this.practicing = true;
    this.daily = null;
    this.career = {
      ...held,
      status: "independent",
      job,
      leg: 0,
      // Every roof call sets from its deck, so practice reads the job's flag
      // instead of a list that can fall behind the job table.
      roofActive: JOBS[job].roof,
      downtime: 0,
      reputation: Math.max(held.reputation, 10),
      crawlerOnSite: !(crane === "crawler" && job === "tracks"),
    };
    this.crane = crane;
    this.applyCrane();
    this.extension = 0;
    this.hauling = false;
    this.crawlerOnSite = this.career.crawlerOnSite;
    this.flipped = false;
    this.flipBilled = false;
    this.roll = 0;
    this.rollRate = 0;
    this.speed = 0;
    this.state = "driving";
    this.attached = false;
    this.airborne = false;
    this.landed = false;
    this.phase = "seek";
    this.carry = null;
    this.currentSite = null;
    if (crane === "crawler" && job === "tracks") {
      this.beginHaul();
      this.message = "Test the track pick. The crawler starts on the lowboy. Nothing is saved.";
      return;
    }
    this.stockYard(true);
    const offer = activeOffer(this.career);
    this.message = `Test ${offer.title} on the ${CRANES[crane].label}. Nothing is saved.`;
  }

  /** Replace the live career with an imported save and park the yard. */
  importCareer(state: CareerState) {
    this.practicing = false;
    this.careerHold = null;
    this.daily = null;
    this.debriefHold = false;
    this.debriefLeft = 0;
    this.lastSet = null;
    this.career = state;
    this.crane = state.crane;
    this.crawlerOnSite = state.crawlerOnSite;
    this.applyCrane();
    this.state = "driving";
    this.speed = 0;
    this.extension = 0;
    this.attached = false;
    this.airborne = false;
    this.landed = false;
    this.carry = null;
    this.currentSite = null;
    this.writeCareer();
    this.stockYard(true);
    this.message = "Save imported. Your career is on this device.";
  }

  /** Start the seeded daily shift: same job, crane and gusts for the day. */
  practiceDaily(run: DailyRun) {
    this.practiceJob(run.job, run.crane);
    this.daily = run;
    this.rng = mulberry32(run.seed);
    const offer = activeOffer(this.career);
    this.message = `Daily ${run.day}: ${offer.title} on the ${CRANES[run.crane].label}. Same wind for everyone.`;
  }

  clockIn() {
    if (this.careerHold) {
      this.career = this.careerHold;
      this.careerHold = null;
    }
    this.daily = null;
    this.debriefHold = false;
    this.debriefLeft = 0;
    this.lastSet = null;
    if (!this.practicing) {
      this.message = this.contractLabel();
      return;
    }
    this.practicing = false;
    this.flipBilled = false;
    this.flipped = false;
    this.careerBeat = null;
    this.crane = this.career.crane;
    this.applyCrane();
    this.extension = Math.min(this.extension, this.extendMax);
    this.hauling = false;
    this.crawlerOnSite = this.career.crawlerOnSite;
    this.state = "driving";
    this.speed = 0;
    this.roll = 0;
    this.rollRate = 0;
    this.truckX = 0;
    this.truckZ = 0;
    this.heading = 0;
    this.currentSite = null;
    this.stockYard(true);
    if (this.crane === "crawler" && !this.career.crawlerOnSite) this.beginHaul();
  }

  skipTutorial() {
    const result = skipCareerTutorial(this.career);
    if (!result.ok) {
      this.message = result.message;
      return;
    }
    this.adopt(result.state);
    this.writeCareer();
    this.state = "driving";
    this.speed = 0;
    this.outrigger = 0;
    this.deployDir = 0;
    this.flipped = false;
    this.roll = 0;
    this.rollRate = 0;
    this.currentSite = null;
    this.stockYard(true);
    this.message = result.message;
  }

  private beginHaul() {
    this.hauling = true;
    this.crawlerOnSite = false;
    this.state = "driving";
    this.speed = 0;
    this.truckX = 0;
    this.truckZ = 36;
    this.heading = 0;
    this.yaw = 0;
    this.roll = 0;
    this.outrigger = 0;
    this.stow = 1;
    this.extension = 0;
    this.boomPitch = 0.18;
    this.message = "Crawler is on the lowboy. Drive to the marked pad, stop, then UNLOAD.";
  }

  private atDrop() {
    return Math.hypot(this.truckX - LOWBOY_DROP.x, this.truckZ - LOWBOY_DROP.z) < 7;
  }

  rigOrigin() {
    if (!this.hauling) return { x: this.truckX, y: this.flipped ? 0.2 : 0, z: this.truckZ };
    const h = this.heading;
    return { x: this.truckX + Math.sin(h) * 4.6, y: 0.98, z: this.truckZ + Math.cos(h) * 4.6 };
  }

  bodyHeading() {
    return this.hauling ? this.heading + Math.PI : this.heading;
  }

  usesOutriggers() {
    return this.crane !== "crawler";
  }

  companyName() {
    return this.practicing ? "Practice" : careerCompanyName(this.career);
  }

  statusLine() {
    return this.practicing ? "NOT SAVED" : statusLine(this.career);
  }

  employerLine() {
    return this.practicing ? "Practice. Cash, reputation, and the crane you own stay as they were." : employerLine(this.career);
  }

  contractLabel() {
    if (this.practicing) return `PRACTICE · ${careerContractLabel(this.career)} · NO PAY`;
    return careerContractLabel(this.career);
  }

  craneLabel() {
    const owned = this.practicing ? `OWN ${CRANES[this.career.crane].label} · ` : "";
    return `${owned}NOW ${CRANES[this.crane].label}`;
  }

  private applyContract() {
    this.to = activeOffer(this.career).pad;
  }

  private say(text: string) {
    this.message = text;
    this.toast = text;
    this.toastLeft = 3.4;
  }

  buyLabel() {
    if (this.practicing) return "PRACTICE";
    return careerBuyLabel(this.career);
  }

  buyDetail() {
    if (this.practicing) return "Practice does not buy cranes.";
    return buyDetail(this.career);
  }

  buyNext() {
    if (this.practicing) {
      this.message = "Practice does not buy cranes.";
      return;
    }
    if (this.attached) {
      this.message = "Set the load down before you buy.";
      return;
    }
    const result = buyCareerCrane(this.career);
    this.say(result.message);
    if (!result.ok) return;
    this.adopt(result.state);
    this.writeCareer();
    if (result.haul) this.beginHaul();
  }

  foundCompany() {
    if (this.practicing) {
      this.message = "Practice cannot file a company.";
      return;
    }
    const result = foundCareer(this.career);
    this.say(result.message);
    if (!result.ok) return;
    this.adopt(result.state);
    this.writeCareer();
    this.careerBeat = result.message;
    this.beatTitle = "The papers are filed";
  }

  dismissBeat() {
    this.careerBeat = null;
  }

  /** Wipe the career save and put the yard back to a brand-new hire. */
  resetCareer() {
    this.practicing = false;
    this.careerHold = null;
    this.daily = null;
    this.debriefHold = false;
    this.debriefLeft = 0;
    this.lastSet = null;
    this.career = freshCareer();
    this.crane = this.career.crane;
    this.crawlerOnSite = this.career.crawlerOnSite;
    this.applyCrane();
    this.state = "driving";
    this.speed = 0;
    this.driveSteer = 0;
    this.heading = 0;
    this.truckX = 0;
    this.truckZ = 0;
    this.currentSite = null;
    this.hauling = false;
    this.outrigger = 0;
    this.stow = 1;
    this.deployDir = 0;
    this.flipped = false;
    this.flipBilled = false;
    this.roll = 0;
    this.rollRate = 0;
    this.leanSign = 0;
    this.attached = false;
    this.airborne = false;
    this.landed = false;
    this.phase = "seek";
    this.carry = null;
    this.careerBeat = null;
    this.toast = "";
    this.toastLeft = 0;
    this.ready = false;
    this.extension = 0;
    this.boomPitch = 0.85;
    this.pitchRate = 0;
    this.yawRate = 0;
    this.score = 0;
    this.limitRatio = 0;
    this.limitState = "ok";
    this.warn = false;
    this.stockYard(true);
    this.writeCareer();
  }

  acceptJob(id: JobId) {
    if (this.practicing) {
      this.message = "Practice does not take calls.";
      return;
    }
    if (this.attached) {
      this.say("Finish this pick before you change calls.");
      return;
    }
    const result = acceptCareerJob(this.career, id);
    if (!result.ok) {
      this.say(result.message);
      return;
    }
    this.adopt(result.state);
    this.writeCareer();
    this.currentSite = null;
    this.stockYard(true);
    this.say(result.message);
  }

  roofDeck() {
    // The roof beam and the curtain-wall panel work off the high deck; the
    // rooftop unit sits on the lower floor ring.
    if (this.career.job === "roof" || this.career.job === "curtain") return ROOF;
    return FLOOR;
  }

  /** Exact place the current load has to land, and how far the hook is from it. */
  setSpot() {
    const offer = activeOffer(this.career);
    const name = loadSpec(offer.kind).label;
    if (this.roofActive) {
      const deck = this.roofDeck();
      return {
        x: deck.x,
        z: deck.z,
        y: deck.y,
        name,
        where: deck.y > 10 ? "ROOF" : "FLOOR",
        meters: Math.hypot(this.hx - deck.x, this.hz - deck.z),
      };
    }
    const pad = PADS[this.to] ?? PADS[0]!;
    const pad2 = this.secondPad;
    if (pad2 !== null) {
      // A two-pad set is scored on both ends of the load, not its centre. The
      // end offsets follow the load's live heading, so a girder lying across
      // the pads is accepted even when it is reversed, but a square-on set is
      // not, because both ends would miss their bearings.
      const second = PADS[pad2] ?? pad;
      const half = loadSpec(this.load).halfZ;
      const heading = this.loadYaw();
      const ex = Math.sin(heading) * half;
      const ez = Math.cos(heading) * half;
      const endAX = this.hx + ex;
      const endAZ = this.hz + ez;
      const endBX = this.hx - ex;
      const endBZ = this.hz - ez;
      const direct = Math.max(
        Math.hypot(endAX - pad.x, endAZ - pad.z),
        Math.hypot(endBX - second.x, endBZ - second.z),
      );
      const swapped = Math.max(
        Math.hypot(endAX - second.x, endAZ - second.z),
        Math.hypot(endBX - pad.x, endBZ - pad.z),
      );
      return {
        x: (pad.x + second.x) / 2,
        z: (pad.z + second.z) / 2,
        y: 0,
        name,
        where: "SET",
        meters: Math.min(direct, swapped),
      };
    }
    return {
      x: pad.x,
      z: pad.z,
      y: 0,
      name,
      where: "SET",
      meters: Math.hypot(this.hx - pad.x, this.hz - pad.z),
    };
  }

  private adopt(state: CareerState) {
    const craneChanged = !this.practicing && state.crane !== this.crane;
    this.career = state;
    if (!craneChanged) return;
    this.crane = state.crane;
    this.applyCrane();
    if (this.extension > this.extendMax) this.extension = this.extendMax;
  }

  private writeCareer() {
    if (this.practicing) return;
    writeCareerStore(this.career);
  }

  private billDrop() {
    this.breakFlash = 2.6;
    if (this.practicing) {
      this.message = "Practice drop. Nothing is saved.";
      return;
    }
    const result = resolveFailure(this.career, "drop");
    this.adopt(result.state);
    this.writeCareer();
    this.message = result.message;
  }

  private billFlip() {
    if (this.flipBilled) return;
    this.flipBilled = true;
    this.breakFlash = 2.6;
    if (this.practicing) {
      this.message = "Practice tip. Nothing is saved.";
      return;
    }
    const result = resolveFailure(this.career, "tip");
    this.adopt(result.state);
    this.writeCareer();
    this.message = result.message;
  }

  tuning() {
    return TUNING[this.mode];
  }

  travelLength() {
    if (this.state === "lifting" && !this.hauling) return this.baseLen + this.extension;
    if (this.crane === "tower") return 6.2;
    if (this.crane === "lattice" || this.crane === "crawler") return 7.2;
    return Math.min(this.baseLen, 7.4);
  }
  private liveMount() {
    if (this.crane !== "tower") return this.mountY;
    return 1.45 + (this.mountY - 1.45) * (1 - this.stow);
  }

  /**
   * Live radius and load-chart snapshot for the operator readout. Radius is
   * measured from the slewing axis, the way a chart is read on site, not from
   * the carrier's reference point.
   */
  loadChart() {
    const origin = this.rigOrigin();
    const face = this.bodyHeading();
    const slewX = origin.x - this.mountBack * Math.sin(face);
    const slewZ = origin.z - this.mountBack * Math.cos(face);
    const capacity = Math.max(0.35, this.chartCapacity());
    const demand = this.attached ? this.loadDemand() : 0;
    return {
      radius: Math.hypot(this.hx - slewX, this.hz - slewZ),
      capacity,
      demand,
      ratio: demand / capacity,
      extension: this.extension,
      extendMax: this.extendMax,
    };
  }

  boom(): Boom {
    const length = this.state === "lifting" && !this.hauling ? this.baseLen + this.extension : this.travelLength();
    const pitch = this.boomPitch;
    const yOnBoom = 0.15 * Math.cos(pitch) + length * Math.sin(pitch);
    const zOnBoom = 0.15 * Math.sin(pitch) - length * Math.cos(pitch);
    const face = this.bodyHeading();
    const ry = this.yaw - face;
    const lx = zOnBoom * Math.sin(ry);
    const ly = this.liveMount() + yOnBoom;
    const lz = -this.mountBack + zOnBoom * Math.cos(ry);
    const cH = Math.cos(face);
    const sH = Math.sin(face);
    const cR = Math.cos(this.roll);
    const sR = Math.sin(this.roll);
    const origin = this.rigOrigin();
    return {
      x: origin.x + cH * cR * lx - cH * sR * ly + sH * lz,
      y: origin.y + sR * lx + cR * ly,
      z: origin.z - sH * cR * lx + sH * sR * ly + cH * lz,
    };
  }

  stockYard(aim: boolean) {
    // The yard only stocks the call's material plus two decoys. Anything else
    // would be clutter on the sight line and a wasted draw call.
    const residential = this.residentialSite;
    const windFarm = this.windSite;
    const site = residential ? "residential" : windFarm ? "windFarm" : "yard";
    if (this.currentSite !== site) {
      this.currentSite = site;
      const start = residential ? MAPLE_LANE_START : windFarm ? WIND_FARM_START : { x: 0, z: 0, heading: 0 };
      this.truckX = start.x;
      this.truckZ = start.z;
      this.heading = start.heading;
      this.speed = 0;
      this.driveSteer = 0;
      this.state = "driving";
      this.outrigger = 0;
      this.stow = 1;
      this.deployDir = 0;
      this.hauling = false;
      this.flipped = false;
      this.roll = 0;
      this.rollRate = 0;
      this.attached = false;
      this.airborne = false;
      this.landed = false;
      this.carry = null;
      this.yaw = 0;
      this.yawRate = 0;
      this.pitchRate = 0;
      this.extendRate = 0;
      this.extension = 0;
      this.boomPitch = 0.85;
      this.cable = 6.2;
      this.ready = false;
      this.safetyLock = false;
      this.safetyBypass = false;
      this.padStrike = 0;
      this.boomStrike = 0;
      this.padClear = 0;
      this.boomClear = 0;
    }
    const wanted = activeOffer(this.career).kind;
    const [decoyA, decoyB] = YARD_DECOYS[wanted];
    const source = PADS[windFarm ? 10 : residential ? 9 : 8]!;
    const main = { kind: wanted, x: source.x, z: source.z };
    const decoys = windFarm
      ? [
          { kind: decoyA, x: 84, z: 69 },
          { kind: decoyB, x: 93, z: 72 },
        ]
      : residential
      ? [
          { kind: decoyA, x: -85, z: 40 },
          { kind: decoyB, x: -90, z: 33 },
        ]
      : [
          { kind: decoyA, x: 0, z: -13 },
          { kind: decoyB, x: 7, z: -9 },
        ];
    this.pieces = [main, ...decoys].map((home) => ({
      kind: home.kind,
      x: home.x,
      z: home.z,
      y: this.restY(home.kind),
      yaw: 0,
      homeX: home.x,
      homeZ: home.z,
    }));
    this.carry = null;
    this.load = wanted;
    this.cx = main.x;
    this.cz = main.z;
    this.cy = this.restY(wanted);
    this.from = windFarm ? 10 : residential ? 9 : 8;
    this.applyContract();
    this.attached = false;
    this.airborne = false;
    this.landed = false;
    this.phase = "seek";
    this.message = this.contractLabel();
    this.warn = false;
    if (!aim) return;
    const aimOrigin = residential ? MAPLE_LANE_SETUP : windFarm ? WIND_FARM_START : { x: this.truckX, z: this.truckZ };
    const dx = main.x - aimOrigin.x;
    const dz = main.z - aimOrigin.z;
    const dist = Math.hypot(dx, dz);
    this.yaw = Math.atan2(-dx, -dz);
    if (site === "yard") this.heading = this.yaw;
    this.yawRate = 0;
    this.boomPitch = this.mode === "easy" ? 0.9 : 0.55;
    this.pitchRate = 0;
    const reach = Math.max(6, dist - this.mountBack);
    const length = reach / Math.cos(this.boomPitch);
    this.extension = clamp(length - this.baseLen, 0, this.extendMax);
    this.extendRate = 0;
    this.cable = 6.2;
    this.ready = false;
  }

  private restY(kind: LoadKind) {
    return loadSpec(kind).halfY;
  }

  private park(home: boolean) {
    if (this.carry == null) return;
    const piece = this.pieces[this.carry];
    if (!piece) return;
    piece.x = home ? piece.homeX : this.hx;
    piece.z = home ? piece.homeZ : this.hz;
    piece.y = this.restY(piece.kind);
    this.cx = piece.x;
    this.cz = piece.z;
    this.cy = piece.y;
    this.carry = null;
  }

  spawnNext() {
    // A follow leg or new contract can require a different physical load.
    // Rebuild the stock yard from the active offer instead of leaving the last
    // delivered piece behind as the next mission's cargo.
    this.stockYard(false);
  }

  step(dt: number, actions: Actions) {
    if (dt <= 0 || this.careerBeat || this.boardPause || this.paused) return;
    if (this.toastLeft > 0) this.toastLeft = Math.max(0, this.toastLeft - dt);
    if (this.debriefLeft > 0 && !this.debriefHold) this.debriefLeft = Math.max(0, this.debriefLeft - dt);
    this.stepTruck(dt, actions);
    if (this.state !== "lifting" || this.flipped) {
      this.safetyLock = false;
      this.safetyBypass = false;
      this.pinHook();
      this.rideLoad();
      this.noteStructure(dt);
      return;
    }
    const tune = this.tuning();
    const pace = PACE_SCALE[this.pace];
    const follow = clamp(dt / (this.pace === "slow" ? 1.15 : tune.brake), 0, 1);
    let steer = actions.steer;
    let trolley = actions.trolley;
    let extend = actions.extend;
    let hoist = actions.hoist;
    if (this.mode === "hard") {
      this.safetyLock = false;
      this.safetyBypass = false;
    }
    if (this.safetyLock && trolley > 0.05) {
      // No separate SAFETY button: raising the boom clears the low-angle
      // interlock, while all other commands remain stopped until then.
      this.safetyLock = false;
      this.safetyBypass = true;
      this.yawRate = 0;
      this.pitchRate = 0;
      this.extendRate = 0;
      this.message = "Safety clear. Raise the boom.";
    } else if (this.safetyLock) {
      steer = 0;
      trolley = 0;
      extend = 0;
      hoist = 0;
      this.yawRate = 0;
      this.pitchRate = 0;
      this.extendRate = 0;
    } else if (
      this.mode === "easy" &&
      !this.safetyBypass &&
      this.boomPitch <= STOP_PITCH + 0.012 &&
      (trolley < -0.05 || extend > 0.05)
    ) {
      this.boomPitch = Math.max(this.boomPitch, STOP_PITCH);
      this.armSafety();
      steer = 0;
      trolley = 0;
      extend = 0;
      hoist = 0;
    }
    const handling = this.upgrades();
    this.yawRate += (steer * 0.55 * pace * handling.slew - this.yawRate) * follow;
    this.pitchRate += (trolley * 0.32 * pace - this.pitchRate) * follow;
    this.extendRate += (extend * 3.2 * pace - this.extendRate) * follow;
    this.yaw += this.yawRate * dt;
    this.boomPitch = clamp(this.boomPitch + this.pitchRate * dt, 0.12, 1.2);
    this.extension = clamp(this.extension + this.extendRate * dt, 0, this.extendMax);
    if (this.mode === "easy" && !this.safetyLock && !this.safetyBypass && this.boomPitch < STOP_PITCH) {
      this.boomPitch = STOP_PITCH;
      this.pitchRate = 0;
      this.armSafety();
    }
    if (this.mode === "easy" && this.safetyBypass && this.boomPitch > STOP_PITCH + 0.07) {
      this.safetyBypass = false;
    }
    const drop = Math.max(this.cableMin, this.boom().y - 0.35);
    const requestedCable = clamp(this.cable - hoist * 2.4 * pace * handling.hoist * dt, this.cableMin, drop);
    const b = this.boom();
    // Cargo resting on the ground is supported by it, not by a taut cable.
    // Holding DOWN must not tension the cable and drag the load sideways. A
    // deliberate hoist-up releases the ground hold so it can be picked back up.
    const grounded = this.attached && (this.landed || !this.airborne);
    const deck = this.roofActive ? this.roofDeck() : null;
    const onDeck = !!deck && Math.hypot(this.hx - deck.x, this.hz - deck.z) < this.setTolerance;
    const floorHook = (onDeck && deck ? deck.y : 0) + this.hang + this.restY(this.load);
    if (grounded && hoist <= 0.02) {
      this.hy = floorHook;
      this.cable = Math.max(this.cableMin, Math.hypot(b.x - this.hx, b.y - floorHook, b.z - this.hz));
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      this.prevBx = b.x;
      this.prevBy = b.y;
      this.prevBz = b.z;
      this.swayDeg = 0;
      this.hookSpeed = 0;
      this.updateJob(dt);
      return;
    }
    if (grounded) {
      this.landed = false;
      this.hy = floorHook;
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      this.airborne = true;
    }
    this.cable = requestedCable;
    if (!this.ready) {
      this.prevBx = b.x;
      this.prevBy = b.y;
      this.prevBz = b.z;
      this.hx = b.x;
      this.hy = b.y - this.cable;
      this.hz = b.z;
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      this.ready = true;
      this.swayDeg = 0;
      this.hookSpeed = 0;
      return;
    }

    const bvx = (b.x - this.prevBx) / dt;
    const bvy = (b.y - this.prevBy) / dt;
    const bvz = (b.z - this.prevBz) / dt;
    this.tipSpeed = Math.hypot(bvx, bvy, bvz);

    this.vy -= 9.81 * dt;

    if (this.mode === "hard") {
      while (this.gustForecast.length < 2) this.gustForecast.push(this.rollGust());
      this.gust += dt;
      if (this.gust > 4) {
        this.gust = 0;
        const next = this.gustForecast.shift() ?? this.rollGust();
        this.windAmp = next.amp;
        this.windX = next.x;
        this.windZ = next.z;
        this.gustForecast.push(this.rollGust());
      }
      const mass = this.attached ? (this.load === "blade" ? 1800 : 1100) : 400;
      const windArea = this.attached && this.load === "blade" ? 2.4 : 1;
      const acc = tune.wind * this.windAmp * (400 / mass) * windArea;
      this.vx += this.windX * acc * dt;
      this.vz += this.windZ * acc * dt;
    }

    const dampScale = this.load === "heavy" && this.attached ? 0.3 : 1;
    const damp = Math.min(0.9, tune.damp * dampScale * dt * this.upgrades().damp);
    this.vx -= this.vx * damp;
    this.vy -= this.vy * damp;
    this.vz -= this.vz * damp;

    if (tune.assist > 0) {
      const as = clamp(tune.assist * dampScale * dt, 0, 1);
      this.vx += (bvx - this.vx) * as;
      this.vz += (bvz - this.vz) * as;
    }
    if (tune.settle > 0) {
      this.vx += -(this.hx - b.x) * tune.settle * dt;
      this.vz += -(this.hz - b.z) * tune.settle * dt;
    }

    this.hx += this.vx * dt;
    this.hy += this.vy * dt;
    this.hz += this.vz * dt;

    let dx = this.hx - b.x;
    let dy = this.hy - b.y;
    let dz = this.hz - b.z;
    let len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) {
      dx = 0;
      dy = -1;
      dz = 0;
      len = 1;
    }
    const inv = 1 / len;
    const dirx = dx * inv;
    const diry = dy * inv;
    const dirz = dz * inv;
    this.hx = b.x + dirx * this.cable;
    this.hy = b.y + diry * this.cable;
    this.hz = b.z + dirz * this.cable;
    const radial = this.vx * dirx + this.vy * diry + this.vz * dirz;
    this.vx -= dirx * radial;
    this.vy -= diry * radial;
    this.vz -= dirz * radial;

    if (this.attached) {
      // Enforce the cargo's floor plane after the cable projection; otherwise
      // the tether constraint can put a low load back through the ground.
      const floorHook = this.hang + this.restY(this.load);
      const cargoBottom = this.hy - this.hang - this.restY(this.load);
      if (cargoBottom < 0) {
        this.hy = floorHook;
        if (this.vy < 0) this.vy = 0;
        // Frame-rate independent friction, so a grounded load does not skate.
        // Round loads keep rolling, so a hurried set drifts off the mark.
        const groundFriction = Math.exp(-(loadSpec(this.load).rolling ? 7 : 14) * dt);
        this.vx *= groundFriction;
        this.vz *= groundFriction;
      }
    }

    this.prevBx = b.x;
    this.prevBy = b.y;
    this.prevBz = b.z;

    const cosHang = clamp(-diry, -1, 1);
    this.swayDeg = (Math.acos(cosHang) * 180) / Math.PI;
    this.hookSpeed = Math.hypot(this.vx, this.vy, this.vz);
    if (this.attached) {
      this.peakSway = Math.max(this.peakSway, this.swayDeg);
      this.peakChart = Math.max(this.peakChart, this.limitRatio);
    }

    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const ox = this.hx - b.x;
    const oz = this.hz - b.z;
    this.along = ox * fx + oz * fz;
    this.side = ox * rx + oz * rz;

    this.updateJob(dt);
    if (this.safetyLock) this.message = "Safety stop at 44°. Raise the boom to continue.";

    if (this.phase === "broke") {
      this.breakFlash -= dt;
      if (this.breakFlash <= 0) this.spawnNext();
    } else if (this.phase === "done") {
      this.deliverFlash -= dt;
      if (this.deliverFlash <= 0) this.spawnNext();
    }
    this.noteStructure(dt);
  }

  setWorkLights(on: boolean) {
    this.lightsOn = on;
  }

  requestSafety() {
    if (!this.safetyLock) return;
    this.safetyLock = false;
    this.safetyBypass = true;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.extendRate = 0;
    this.message = "Safety cleared. Raise the boom above 44° to arm it again.";
  }

  private armSafety() {
    this.safetyLock = true;
    this.safetyBypass = false;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.extendRate = 0;
    // A 44° boom-angle safety interlock is not a load-chart overload.
    // Keep the interlock active, but do not light the overload warning.
    this.warn = false;
    this.message = "Safety stop at 44°. Raise the boom to continue.";
  }

  requestHook() {
    if (this.attached || this.latch == null || !this.hookReady) {
      this.message = "Move the hook closer, then tap HOOK.";
      return;
    }
    const piece = this.pieces[this.latch];
    if (!piece) return;
    // Center the hook on the ground-level pickup point when the player
    // latches within a few inches. Match cable length to that point so the
    // load starts supported by the ground instead of being snatched upward.
    const pickupY = piece.y + this.hang;
    const boom = this.boom();
    this.hx = piece.x;
    this.hy = pickupY;
    this.hz = piece.z;
    this.cable = Math.max(this.cableMin, Math.hypot(boom.x - this.hx, boom.y - this.hy, boom.z - this.hz));
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.prevBx = boom.x;
    this.prevBy = boom.y;
    this.prevBz = boom.z;
    this.carry = this.latch;
    this.load = piece.kind;
    piece.yaw = this.yaw;
    this.cx = piece.x;
    this.cz = piece.z;
    this.cy = piece.y;
    this.attached = true;
    this.airborne = false;
    this.landed = false;
    this.hookReady = false;
    this.phase = "carry";
    this.peakSway = 0;
    this.peakChart = 0;
    const noun = loadSpec(piece.kind).noun;
    const spot = this.setSpot();
    const haul = Math.hypot(piece.x - spot.x, piece.z - spot.z) > 18;
    this.message = this.limitState === "ok"
      ? haul
        ? `${noun} on the hook. Stow the pads and drive it to the ring.`
        : `${noun} on the hook. Set it in the amber ring.`
      : this.message;
  }

  requestRelease() {
    if (!this.attached) return;
    if (!this.landed) {
      this.message = "Lower the load fully into the amber set zone before releasing.";
      return;
    }
    const off = this.setSpot().meters;
    if (off < this.setTolerance) {
      this.succeed(off);
      return;
    }
    this.park(false);
    this.attached = false;
    this.airborne = false;
    this.landed = false;
    this.leanSign = 0;
    this.phase = "seek";
    this.limitRatio = 0;
    this.limitState = "ok";
    this.limitHold = 0;
    this.warn = false;
    this.shiftRoll(0, 0.35);
    this.message = `Load released ${off.toFixed(1)} m outside the ring. No payment. Reposition and try again.`;
  }

  /** Signed corrections from the hook to the closest pickup, in crane-control axes. */
  hookAlignment() {
    if (this.latch == null) return null;
    const piece = this.pieces[this.latch];
    if (!piece) return null;

    const dx = piece.x - this.hx;
    const dz = piece.z - this.hz;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const vertical = piece.y + this.hang - this.hy;
    return {
      target: loadSpec(piece.kind).label,
      distance: Math.hypot(dx, vertical, dz),
      // Positive slew follows increasing yaw (A / left); positive reach is
      // farther out along the boom (Z / extend or lower pitch).
      slew: -dx * cos + dz * sin,
      reach: -dx * sin - dz * cos,
      hoist: vertical,
      ready: this.hookReady,
    };
  }

  /** Same corrections, but from the hanging load to the set point. Only after a manual hook. */
  carryAlignment() {
    if (!this.attached) return null;
    const spot = this.setSpot();
    const dx = spot.x - this.hx;
    const dz = spot.z - this.hz;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const targetY = spot.y + this.hang + this.restY(this.load);
    return {
      target: `${spot.name} ${spot.where}`,
      distance: Math.hypot(dx, dz),
      slew: -dx * cos + dz * sin,
      reach: -dx * sin - dz * cos,
      hoist: targetY - this.hy,
      ready: Math.hypot(dx, dz) < this.setTolerance,
    };
  }

  private updateApproach() {
    this.hookGap = 99;
    this.hookReady = false;
    this.hookLabel = "";
    this.latch = null;
    let best = 99;
    for (let i = 0; i < this.pieces.length; i++) {
      const piece = this.pieces[i]!;
      const dx = this.hx - piece.x;
      const dz = this.hz - piece.z;
      const flat = Math.hypot(dx, dz);
      const idealY = piece.y + this.hang;
      const gap = Math.hypot(flat, this.hy - idealY);
      if (gap >= best) continue;
      best = gap;
      this.latch = i;
      this.hookGap = gap;
      this.hookLabel = loadSpec(piece.kind).label;
      // Allow a little practical positioning tolerance without making the hook magnetic.
      // The hook must be within about 30 cm horizontally and 25 cm vertically.
      this.hookReady = flat < 0.3 && Math.abs(this.hy - idealY) < 0.25;
      this.load = piece.kind;
    }
  }

  requestDeploy() {
    if (this.flipped) return;
    if (this.hauling) {
      if (!this.bStopped()) {
        this.message = "Stop the lowboy first.";
        return;
      }
      if (!this.atDrop()) {
        this.message = "The lowboy has to be on the marked pad.";
        return;
      }
      const fx = -Math.sin(this.heading);
      const fz = -Math.cos(this.heading);
      this.haulX = this.truckX + fx * 14;
      this.haulZ = this.truckZ + fz * 14;
      this.haulH = this.heading;
      this.truckX = LOWBOY_DROP.x;
      this.truckZ = LOWBOY_DROP.z;
      this.hauling = false;
      this.crawlerOnSite = true;
      this.speed = 0;
      this.state = "driving";
      if (!this.practicing) {
        this.career = { ...this.career, crawlerOnSite: true };
        this.writeCareer();
      }
      this.message = "Crawler is on the ground. Stop, then LIFT. The lowboy waits.";
      return;
    }
    if (!this.usesOutriggers()) {
      if (this.state === "lifting") {
        this.state = "driving";
        this.speed = 0;
        this.message = "Tracks again. The boom folds down for the move.";
        return;
      }
      if (!this.bStopped()) {
        this.message = "Stop the crawler first.";
        return;
      }
      this.state = "lifting";
      this.speed = 0;
      this.yaw = this.heading;
      if (this.mode === "easy") this.boomPitch = Math.max(this.boomPitch, STOP_PITCH + 0.08);
      this.pitchRate = 0;
      this.message = "On the tracks. No outriggers. Boom is live.";
      return;
    }
    if (this.state === "lifting" || this.outrigger > 0.5) {
      this.state = "driving";
      this.deployDir = -1;
      this.speed = 0;
      this.message = this.attached
        ? "Stowing the pads. The load stays on the hook."
        : "Stowing the pads. The boom folds for travel.";
      return;
    }
    if (!this.bStopped()) {
      this.message = "Stop the truck first.";
      return;
    }
    if (this.career.job === "spa" && !this.atMapleSetup) {
      this.say("Drive down Maple Lane and stop in the amber driveway setup box before deploying.");
      return;
    }
    this.deployDir = 1;
    this.message = "Outriggers out, then pads down.";
  }

  requestLift() {
    if (this.flipped) {
      this.recover();
      return;
    }
    if (this.state === "lifting") {
      this.state = "driving";
      this.deployDir = -1;
      this.speed = 0;
      this.message = "Stowing outriggers.";
      return;
    }
    this.refreshGate();
    if (!this.bCanLift) {
      this.message = this.gateReason();
      return;
    }
    this.state = "lifting";
    this.speed = 0;
    this.yaw = this.heading;
    if (this.mode === "easy") this.boomPitch = Math.max(this.boomPitch, STOP_PITCH + 0.08);
    this.pitchRate = 0;
    this.message = "Pads set. Boom is live.";
  }

  recover() {
    this.flipped = false;
    this.flipBilled = false;
    this.roll = 0;
    this.rollRate = 0;
    this.leanSign = 0;
    this.speed = 0;
    this.state = "driving";
    this.deployDir = -1;
    this.message = "Upright. Stow the pads, then drive.";
  }

  private hitsYard(x: number, z: number) {
    for (const block of YARD_BLOCKS) {
      if (Math.abs(x - block.x) < block.hx + 1.7 && Math.abs(z - block.z) < block.hz + 3.8) return true;
    }
    if (this.residentialSite) {
      for (const block of RESIDENTIAL_HOUSE_BLOCKS) {
        if (Math.abs(x - block.x) < block.hx + 1.7 && Math.abs(z - block.z) < block.hz + 3.8) return true;
      }
    }
    if (this.career.job === "wind" || this.career.job === "rotor") {
      for (const block of WIND_TURBINE_BLOCKS) {
        if (Math.abs(x - block.x) < block.hx + 1.7 && Math.abs(z - block.z) < block.hz + 3.8) return true;
      }
    }
    return false;
  }

  private bStopped() {
    return Math.abs(this.speed) < 0.2;
  }

  private refreshGate() {
    if (!this.usesOutriggers()) {
      this.bCanLift = this.bStopped() && !this.flipped && Math.abs(this.roll) < 0.08;
      return;
    }
    const reach = Math.min(1, this.outrigger / 0.57);
    const down = Math.max(0, (this.outrigger - 0.57) / 0.43);
    const stopped = this.bStopped();
    const level = Math.abs(this.roll) < (2 * Math.PI) / 180;
    const contact = down >= 0.98 && !this.flipped;
    const atSite = this.career.job !== "spa" || this.atMapleSetup;
    this.bCanLift = stopped && reach >= 0.98 && down >= 0.98 && contact && level && atSite;
  }

  private gateReason() {
    if (!this.bStopped()) return "Truck is still moving.";
    if (this.career.job === "spa" && !this.atMapleSetup) return "Drive down Maple Lane and stop in the marked driveway setup box before lifting.";
    if (this.outrigger < 0.57) return "Outriggers are not fully out.";
    if (this.outrigger < 0.98) return "Pads are not down on the ground.";
    if (Math.abs(this.roll) >= (2 * Math.PI) / 180) return "Truck body is not level.";
    return "Pads are down.";
  }

  private stepTruck(dt: number, actions: Actions) {
    if (this.deployDir !== 0) {
      this.outrigger = clamp(this.outrigger + this.deployDir * (dt / 1.6), 0, 1);
      this.speed = 0;
      if (this.outrigger <= 0 || this.outrigger >= 1) this.deployDir = 0;
    }

    if (
      this.state === "driving" &&
      this.deployDir !== -1 &&
      !this.flipped &&
      this.outrigger >= 0.98 &&
      this.bStopped()
    ) {
      this.state = "lifting";
      this.speed = 0;
      this.yaw = this.heading;
      if (this.mode === "easy") this.boomPitch = Math.max(this.boomPitch, STOP_PITCH + 0.08);
      this.pitchRate = 0;
      this.message = "Pads set. Boom is live.";
    }

    const padsClear = !this.usesOutriggers() || this.outrigger < 0.05;
    const canDrive = this.state === "driving" && padsClear && this.deployDir === 0 && !this.flipped;
    const pace = PACE_SCALE[this.pace];

    if (canDrive) {
      const forwardSign = this.hauling ? -1 : 1;
      const maxV = (this.mode === "hard" ? 11 : 9) * pace * (this.hauling ? 0.62 : 1);
      const target = actions.trolley * maxV;
      const follow = 1 - Math.exp(-dt * (this.pace === "slow" ? 1.4 : this.mode === "easy" ? 2.2 : 1.15));
      this.speed += (target - this.speed) * follow;
      this.driveSteer += (actions.steer - this.driveSteer) * Math.min(1, dt * 6);
      const moving = Math.abs(this.speed) > 0.08;
      if (moving) {
        const tightness = 0.95 / (1 + Math.abs(this.speed) * 0.16);
        // Positive steer is left. Heading grows toward +X, which is left of a cab facing +Z.
        this.heading += this.driveSteer * tightness * Math.sign(this.speed) * dt;
      }
      const fx = forwardSign * Math.sin(this.heading);
      const fz = forwardSign * Math.cos(this.heading);
      const residential = this.residentialSite;
      const windFarm = this.windSite;
      const minX = residential ? -142 : windFarm ? 58 : -46;
      const maxX = residential ? -62 : windFarm ? 126 : 46;
      const minZ = residential ? 5 : windFarm ? 52 : -46;
      const maxZ = residential ? 82 : windFarm ? 128 : 46;
      const nx = clamp(this.truckX + fx * this.speed * dt, minX, maxX);
      const nz = clamp(this.truckZ + fz * this.speed * dt, minZ, maxZ);
      if (!this.hitsYard(nx, nz)) {
        this.truckX = nx;
        this.truckZ = nz;
      } else if (!this.hitsYard(nx, this.truckZ)) {
        this.truckX = nx;
        this.speed *= 0.55;
      } else if (!this.hitsYard(this.truckX, nz)) {
        this.truckZ = nz;
        this.speed *= 0.55;
      } else {
        this.speed *= 0.15;
      }

      const vx = fx * this.speed;
      const vz = fz * this.speed;
      const ax = (vx - this.prevVx) / dt;
      const az = (vz - this.prevVz) / dt;
      const rx = Math.cos(this.heading);
      const rz = -Math.sin(this.heading);
      this.lateralG = (ax * rx + az * rz) / 9.81;
      this.prevVx = vx;
      this.prevVz = vz;

      if (this.mode === "easy") {
        const rollDeg = Math.abs(this.roll) * (180 / Math.PI);
        if (rollDeg > 8) {
          this.rollRate = 0;
          this.roll += -this.roll * 6 * dt;
        } else {
          this.roll += (this.lateralG * 0.035 - this.roll) * Math.min(1, dt * 4);
        }
      } else {
        this.rollRate += (this.lateralG * 1.35 - this.roll * 1.4 - this.rollRate * 0.7) * dt;
        this.roll += this.rollRate * dt;
        if (Math.abs(this.roll) > 0.62) {
          this.flipped = true;
          this.speed = 0;
          this.billFlip();
        }
      }
    } else {
      this.speed *= Math.exp(-5 * dt);
      this.driveSteer += (0 - this.driveSteer) * Math.min(1, dt * 6);
      this.lateralG = 0;
      if (!this.flipped && this.state !== "lifting") this.roll += -this.roll * Math.min(1, dt * 3);
    }

    this.refreshGate();
    const fold = this.state !== "lifting";
    const want = fold ? 1 : 0;
    this.stow += (want - this.stow) * Math.min(1, dt * 0.55);
    if (fold) {
      const rest = this.hauling ? 0.06 : 0.05;
      this.boomPitch += (rest - this.boomPitch) * Math.min(1, dt * 0.85);
      this.extension += (0 - this.extension) * Math.min(1, dt * 0.9);
    }
    if (this.flipped) return;
    if (this.state === "lifting") return;
    if (this.hauling) {
      this.message = this.atDrop()
        ? "Lowboy is on the pad. UNLOAD."
        : "Crawler is on the lowboy. Drive to the marked pad.";
      return;
    }
    if (!this.usesOutriggers()) this.message = "Boom is down. Stop, then LIFT.";
    else if (this.deployDir > 0) this.message = "Outriggers out, then pads down.";
    else if (this.deployDir < 0) this.message = "Pads coming up. Boom folding over the cab.";
    else if (padsClear) this.message = "Boom is stowed. Stop, then DEPLOY.";
    else this.message = this.gateReason();
  }

  private pinHook() {
    this.yaw = this.hauling ? this.bodyHeading() : this.heading + Math.PI;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.extendRate = 0;
    this.cable = 0.45;
    const b = this.boom();
    this.hx = b.x;
    this.hy = b.y - this.cable;
    this.hz = b.z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.prevBx = b.x;
    this.prevBy = b.y;
    this.prevBz = b.z;
    this.ready = true;
    this.swayDeg = 0;
    this.hookSpeed = 0;
  }

  private rideLoad() {
    if (!this.attached || this.carry == null) return;
    const piece = this.pieces[this.carry];
    if (!piece) return;
    piece.x = this.hx;
    piece.z = this.hz;
    piece.y = Math.max(this.restY(piece.kind), this.hy - this.hang);
  }

  private loadDemand() {
    // An empty hook has no suspended load. Nearby yard pieces are candidates,
    // not cargo; never apply their weight to the live load chart until hooked.
    if (!this.attached) return 0;
    return loadSpec(this.load).weight;
  }

  private chartCapacity() {
    const rating =
      this.crane === "crawler"
        ? 15
        : this.crane === "tower"
          ? 11
          : this.crane === "lattice"
            ? 9
            : this.crane === "heavy"
              ? 7
              : this.crane === "yard"
                ? 5
                : 3.2;
    const angle = 0.4 + 0.6 * Math.sin(this.boomPitch);
    const reach = this.extension / Math.max(1, this.extendMax);
    const planted = this.usesOutriggers() && this.outrigger >= 0.98 ? 1.55 : 1;
    // Bought outriggers carry more chart; a worn crane carries less.
    const health = 1 - wearPenalty(this.career.wear);
    return rating * angle * (1 - 0.62 * reach) * planted * this.upgrades().capacity * health;
  }

  private updateChart(dt: number) {
    // Deployment and boom movement with an empty hook must never inherit a
    // previous load-chart alarm. No suspended cargo means zero demand.
    // A connected hook is not yet a suspended load. Keep the chart and
    // stability response clear until the cargo actually leaves the ground.
    if (!this.attached || !this.airborne) {
      this.limitRatio = 0;
      this.limitState = "ok";
      this.limitHold = 0;
      this.warn = false;
      return;
    }
    const capacity = Math.max(0.35, this.chartCapacity());
    this.limitRatio = this.loadDemand() / capacity;
    if (this.limitRatio > 1) {
      this.limitState = "over";
      this.warn = true;
      this.limitHold += dt;
      return;
    }
    this.limitHold = 0;
    if (this.limitRatio > 0.78) {
      this.limitState = "near";
      this.warn = true;
      return;
    }
    this.limitState = "ok";
    this.warn = false;
  }

  private updateJob(dt: number) {
    this.warn = false;
    if (!this.attached && !this.flipped) {
      this.leanSign = 0;
      this.shiftRoll(0, dt);
    }
    if (this.phase === "broke" || this.phase === "done") return;
    if (!this.attached) this.updateApproach();
    this.updateChart(dt);

    if (!this.attached) {
      const chart =
        this.limitState === "over" ? " Over the chart for this load." : this.limitState === "near" ? " Near the limit." : "";
      if (this.hookGap < 12) {
        this.message = this.hookReady ? `Tap HOOK.${chart}` : this.contractLabel();
      } else if (this.limitState === "over") this.message = "That load is over the chart. Shorten the boom before you lift.";
      else if (this.limitState === "near") this.message = "That load is near the limit. Watch the angle and the length.";
      else this.message = this.contractLabel();
      if (Math.abs(this.roll) > 0.04) this.message = "Load is off. Coming back level.";
      return;
    }
    this.hookReady = false;

    const carried = this.carry != null ? this.pieces[this.carry] : undefined;
    if (carried) {
      carried.x = this.hx;
      carried.z = this.hz;
      carried.y = this.hy - this.hang;
      // A load on the ground stays where it was set; only a hanging load turns
      // with the slew. That makes the last airborne heading the one graded.
      if (this.airborne) carried.yaw = this.yaw;
    }

    // Measure clearance from each load's actual resting height. Crates, beams,
    // and heavy blocks have different geometry; a shared half-height made some
    // loads appear airborne while they were still sitting on the ground.
    const bottom = carried ? carried.y - this.restY(carried.kind) : 0;
    if (bottom > 0.08) this.airborne = true;

    const gentle = this.pace === "slow";
    const fast = this.hookSpeed > (this.mode === "easy" ? 6.4 : 3.6);
    if (!gentle && this.load === "heavy" && this.limitState === "over" && fast && this.airborne) {
      this.overload(Math.abs(this.roll) > 0.22);
      return;
    }

    const limit = this.load === "heavy" ? this.tuning().impact / 1.6 : this.tuning().impact;
    if (!gentle && this.airborne && bottom < 3.4 && !this.roofActive && this.hookSpeed > limit * 0.72) this.warn = true;

    if (this.roofActive && this.airborne) {
      const deck = this.roofDeck();
      const flat = Math.hypot(this.hx - deck.x, this.hz - deck.z);
      if (flat < this.setTolerance && bottom < deck.y + 0.45 && bottom > deck.y - 1.1) {
        if (!gentle && this.hookSpeed > limit) {
          this.fail();
          return;
        }
        this.landed = true;
        this.airborne = false;
        this.vy = 0;
        if (carried) carried.y = deck.y + this.restY(carried.kind);
        this.hy = deck.y + this.hang + this.restY(this.load);
        this.message = "On the mark. Press RELEASE.";
        return;
      }
    }

    if (this.airborne && bottom <= 0.02) {
      // Snap to the exact resting height before enabling RELEASE LOAD.
      if (carried) carried.y = this.restY(carried.kind);
      this.hy = this.hang + this.restY(this.load);
      this.vy = 0;
      this.airborne = false;
      const off = this.setSpot().meters;
      if (!gentle && this.hookSpeed > limit) {
        this.fail();
        return;
      }
      this.landed = true;
      if (off < this.setTolerance) {
        this.message = "On the mark. Press RELEASE.";
        return;
      }
      this.message = "Load is on the ground but outside the amber ring. Hoist it, reposition over the ring, and lower again.";
      return;
    }

    if (this.airborne) this.applyTilt(dt);
    else {
      this.leanSign = 0;
      this.shiftRoll(0, dt);
    }
    if (this.airborne && this.limitState === "ok" && Math.abs(this.roll) < 0.08) {
      const noun = loadSpec(this.load).noun;
      const spot = this.setSpot();
      const haul = Math.hypot(this.hx - spot.x, this.hz - spot.z) > 16;
      this.message = this.roofActive
        ? this.roofDeck().y > 10
          ? `Set the ${noun} on the roof ring.`
          : `Set the ${noun} on the floor ring.`
        : haul
          ? "Pads are holding the pipe. Stow them and drive to the ring."
          : "Set it inside the amber ring.";
    }
  }

  private applyTilt(dt: number) {
    const excess = Math.max(0, this.limitRatio - 0.8);
    if (excess < 0.02) {
      this.leanSign = 0;
      this.shiftRoll(0, dt);
      return;
    }
    if (this.leanSign === 0) this.leanSign = Math.sign(this.side || 1) || 1;
    const target = this.leanSign * Math.min(0.46, excess * 0.9);
    this.shiftRoll(target, dt);
    this.warn = true;
    this.message =
      this.limitRatio > 1 ? "Tilt warning. Boom in before it goes over." : "Crane is starting to lean.";
    // The counterweight buys margin before a heavy pick goes over.
    const heldOver =
      this.load === "heavy" &&
      this.limitRatio > 1.45 / this.upgrades().stability &&
      Math.abs(this.roll) > 0.4 &&
      this.limitHold > 2.4;
    if (!heldOver) return;
    this.flipped = true;
    this.roll = this.leanSign * 1.15;
    this.rollRate = 0;
    this.park(false);
    this.attached = false;
    this.airborne = false;
    this.landed = false;
    this.phase = "broke";
    this.impulse = 0.7;
    this.billFlip();
    this.cy = this.loadRest();
    this.cx = this.hx;
    this.cz = this.hz;
  }

  private shiftRoll(target: number, dt: number) {
    const before = this.boom();
    const gain = target === 0 ? 4.8 : 0.9;
    const next = this.roll + (target - this.roll) * Math.min(1, dt * gain);
    if (Math.abs(next - this.roll) < 1e-5) return;
    this.roll = next;
    const after = this.boom();
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const dz = after.z - before.z;
    this.hx += dx;
    this.hy += dy;
    this.hz += dz;
    this.prevBx += dx;
    this.prevBy += dy;
    this.prevBz += dz;
  }

  private setAside(off: number) {
    this.park(false);
    this.attached = false;
    this.airborne = false;
    this.landed = false;
    this.leanSign = 0;
    this.phase = "seek";
    this.message = `Outside the ring by ${off.toFixed(1)} m. Call is ${this.contractLabel()}.`;
  }

  private loadRest() {
    return this.restY(this.load);
  }

  private overload(pullOver: boolean) {
    this.park(false);
    this.attached = false;
    this.airborne = false;
    this.landed = false;
    this.phase = "broke";
    this.impulse = 0.7;
    this.cy = this.loadRest();
    this.cx = this.hx;
    this.cz = this.hz;
    if (pullOver) {
      this.flipped = true;
      this.roll = Math.sign(this.side || 1) * 1.2;
      this.rollRate = 0;
      this.speed = 0;
      this.billFlip();
      return;
    }
    this.leanSign = 0;
    this.billDrop();
  }

  private report(grade: Grade, metrics: Parameters<typeof gradeSet>[0], pay: number, rep: number): SetReport {
    return {
      grade,
      ...metrics,
      pay,
      rep,
      parts: gradeBreakdown(metrics),
      cost: gradeCost(metrics).label,
      tip: gradeTipFor(metrics, this.load),
    };
  }

  private succeed(off: number) {
    const wasRoof = this.roofActive;
    const metrics = {
      off,
      tolerance: this.setTolerance,
      impact: this.hookSpeed,
      impactLimit: effectiveImpactLimit(this.tuning().impact, this.load),
      sway: this.peakSway,
      chart: this.peakChart,
      heading: this.headingError() ?? 0,
      headingTolerance: this.headingTarget === null ? 0 : (JOBS[this.career.job].headingTol ?? 0),
    };
    const grade = gradeSet(metrics);
    this.lastImpact = metrics.impact;
    this.lastImpactLimit = metrics.impactLimit;
    if (this.practicing) {
      this.score += 1;
      if (this.score > this.best) {
        this.best = this.score;
        writeBest(this.best);
      }
      this.park(true);
      this.attached = false;
      this.airborne = false;
      this.landed = false;
      this.leanSign = 0;
      this.phase = "done";
      this.deliverFlash = 1.4;
      this.message = `${wasRoof ? "Practice set on the building." : "Practice set."} Graded ${grade}. Nothing is saved.`;
      this.lastSet = this.report(grade, metrics, 0, 0);
      if (this.daily) {
        writeDailyResult({ day: this.daily.day, job: this.daily.job, grade });
        this.message = `Daily set graded ${grade}. Best of the day is kept. Nothing else is saved.`;
      }
      this.debriefLeft = 14;
      this.debriefHold = true;
      this.cy = this.loadRest();
      this.cx = PADS[this.to]!.x;
      this.cz = PADS[this.to]!.z;
      return;
    }
    const before = this.career;
    const result = resolveSet(this.career, this.load, grade, metrics);
    this.adopt(result.state);
    this.applyContract();
    this.writeCareer();
    if (result.matched) {
      this.score += 1;
      if (this.score > this.best) {
        this.best = this.score;
        writeBest(this.best);
      }
      this.lastSet = this.report(grade, metrics, result.banked, gradeRep(grade));
      this.debriefLeft = 14;
      this.debriefHold = true;
      if (campaignComplete(result.state) && !campaignComplete(before)) {
        this.careerBeat = result.message;
        this.beatTitle = "The card is full";
      }
    }
    this.park(true);
    this.attached = false;
    this.airborne = false;
    this.landed = false;
    this.leanSign = 0;
    this.phase = "done";
    this.deliverFlash = result.matched ? 2.3 : 2;
    this.message = result.message;
    this.cy = this.loadRest();
    this.cx = PADS[this.to]!.x;
    this.cz = PADS[this.to]!.z;
  }

  private noteStructure(dt: number) {
    // House strikes are a working hazard. A stowed boom crossing a roof line
    // on the drive in is not the operator swinging a load through a wall.
    if (!this.residentialSite || this.state !== "lifting") {
      this.padStrike = 0;
      this.boomStrike = 0;
      return;
    }
    let padPen = 0;
    if (this.usesOutriggers() && this.outrigger > 0.2) {
      for (const pad of this.outriggerFeet()) padPen = Math.max(padPen, this.housePenetration(pad.x, pad.z, 0.4));
    }
    let boomPen = 0;
    const tip = this.boom();
    const origin = this.rigOrigin();
    const face = this.bodyHeading();
    const root = {
      x: origin.x - this.mountBack * Math.sin(face),
      y: this.liveMount(),
      z: origin.z - this.mountBack * Math.cos(face),
    };
    for (const t of [0.35, 0.65, 1]) {
      const x = root.x + (tip.x - root.x) * t;
      const y = root.y + (tip.y - root.y) * t;
      const z = root.z + (tip.z - root.z) * t;
      boomPen = Math.max(boomPen, this.housePenetration(x, z, y));
    }
    const lines: string[] = [];
    lines.push(...this.chargeStrike("pad", padPen, dt));
    lines.push(...this.chargeStrike("boom", boomPen, dt));
    if (lines.length) this.say(lines.join(" "));
    else if (padPen >= 0.15 || boomPen >= 0.15) {
      const stuck = [
        padPen >= 0.15 ? "Outrigger through the house." : "",
        boomPen >= 0.15 ? "Boom through the house." : "",
      ].filter(Boolean);
      this.message = stuck.join(" ");
    }
  }

  private outriggerFeet() {
    const reach = Math.min(1, this.outrigger / 0.57);
    const outer = 1.35 + reach * 1.8 - 0.02;
    const origin = this.rigOrigin();
    const h = this.bodyHeading();
    const c = Math.cos(h);
    const s = Math.sin(h);
    const feet: { x: number; z: number }[] = [];
    for (const [sign, lz] of [
      [1, 1.6],
      [-1, 1.6],
      [1, -0.9],
      [-1, -0.9],
    ] as const) {
      const lx = sign * outer;
      feet.push({
        x: origin.x + lx * c + lz * s,
        z: origin.z - lx * s + lz * c,
      });
    }
    return feet;
  }

  private housePenetration(x: number, z: number, y: number) {
    let pen = 0;
    for (const house of RESIDENTIAL_HOUSE_BLOCKS) {
      if (y > house.top) continue;
      const dx = house.hx - Math.abs(x - house.x);
      const dz = house.hz - Math.abs(z - house.z);
      if (dx > 0 && dz > 0) pen = Math.max(pen, Math.min(dx, dz));
    }
    return pen;
  }

  private chargeStrike(kind: "pad" | "boom", pen: number, dt: number) {
    const deep = kind === "boom";
    const billed = deep ? this.boomStrike : this.padStrike;
    if (pen < 0.15) {
      if (deep) this.boomClear += dt;
      else this.padClear += dt;
      if ((deep ? this.boomClear : this.padClear) > 0.8) {
        if (deep) this.boomStrike = 0;
        else this.padStrike = 0;
      }
      return [];
    }
    if (deep) this.boomClear = 0;
    else this.padClear = 0;
    const due = deep ? Math.min(2800, Math.round(420 + pen * 1100)) : Math.min(1100, Math.round(160 + pen * 480));
    if (due <= billed + 40) return [];
    const extra = due - billed;
    if (deep) this.boomStrike = due;
    else this.padStrike = due;
    if (this.practicing) {
      return [deep ? "Boom through the house. Practice. No bill." : "Outrigger through the house. Practice. No bill."];
    }
    const paid = Math.min(this.career.cash, extra);
    this.career = { ...this.career, cash: this.career.cash - paid };
    this.writeCareer();
    const what = deep ? "Boom through the house." : "Outrigger through the house.";
    const bill = paid > 0 ? `Damage ${money(paid)}.` : `Damage ${money(extra)} and you had nothing left.`;
    return [`${what} ${bill} You have ${money(this.career.cash)}.`];
  }

  private fail() {
    this.park(false);
    this.attached = false;
    this.airborne = false;
    this.landed = false;
    this.leanSign = 0;
    this.phase = "broke";
    this.impulse = 0.45;
    this.billDrop();
    this.cy = this.loadRest();
    this.cx = this.hx;
    this.cz = this.hz;
  }
}
