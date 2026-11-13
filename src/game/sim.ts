import type { Actions } from "@/game/input";
import { CRANES } from "@/game/cranes";
import {
  acceptJob as acceptCareerJob,
  activeOffer,
  buyCrane as buyCareerCrane,
  buyDetail,
  buyLabel as careerBuyLabel,
  companyName as careerCompanyName,
  contractLabel as careerContractLabel,
  employerLine,
  foundCompany as foundCareer,
  readCareerStore,
  resolveFailure,
  resolveSet,
  statusLine,
  writeCareerStore,
  type CareerState,
  type CraneId,
  type JobId,
  type LoadKind,
} from "@/game/career";

export type { CraneId, JobId, LoadKind } from "@/game/career";
export { CRANE_CHOICES } from "@/game/cranes";

export type Mode = "easy" | "hard";
export type Pace = "slow" | "steady" | "fast";
export type JobPhase = "seek" | "carry" | "broke" | "done";

export type YardPiece = {
  kind: LoadKind;
  x: number;
  z: number;
  y: number;
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

export const LOWBOY_DROP = { x: 4, z: 10 };

export const PADS: Pad[] = [
  { x: 0, z: -9 },
  { x: 17, z: -8 },
  { x: 12, z: 14 },
  { x: -16, z: -4 },
  { x: -10, z: 16 },
  { x: 7, z: -3 },
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
  from = 0;
  to = 1;
  score = 0;
  best = 0;
  career: CareerState = readCareerStore();
  practicing = false;
  careerBeat: string | null = null;
  boardPause = false;
  toast = "";
  toastLeft = 0;
  crane: CraneId = "rental";
  message = "You work for Hargrove. Take the wage and set the crate.";
  private flipBilled = false;
  warn = false;
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

  breakFlash = 0;
  deliverFlash = 0;
  impulse = 0;

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
  readonly hang = 0.95;
  readonly cargoHalf = 0.8;

  constructor() {
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

  private applyCrane() {
    const spec = CRANES[this.crane];
    this.extendMax = spec.extend;
    this.baseLen = spec.base;
    this.mountY = spec.mount;
  }

  selectCrane(id: CraneId) {
    this.practicing = true;
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

  clockIn() {
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
    this.stockYard(true);
    if (this.crane === "crawler" && !this.career.crawlerOnSite) this.beginHaul();
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
    if (!this.hauling) return { x: this.truckX, y: this.flipped ? 0.2 : 0, z: this.truckZ };    const h = this.heading;
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
  }

  dismissBeat() {
    this.careerBeat = null;
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
    this.spawnNext();
    this.say(result.message);
  }

  roofDeck() {
    if (this.career.job === "roof") return ROOF;
    return FLOOR;
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
    const homes: { kind: LoadKind; x: number; z: number }[] = [
      { kind: "crate", x: -6, z: -8 },
      { kind: "beam", x: 0, z: -11 },
      { kind: "heavy", x: 6, z: -8 },
    ];
    this.pieces = homes.map((home) => ({
      kind: home.kind,
      x: home.x,
      z: home.z,
      y: this.restY(home.kind),
      homeX: home.x,
      homeZ: home.z,
    }));
    this.carry = null;
    const assignedKind = activeOffer(this.career).kind;
    const assignedPiece = homes.find((home) => home.kind === assignedKind) ?? homes[0]!;
    this.load = assignedPiece.kind;
    this.cx = assignedPiece.x;
    this.cz = assignedPiece.z;
    this.cy = this.restY(assignedPiece.kind);
    this.from = 0;
    this.applyContract();
    this.attached = false;
    this.airborne = false;
    this.phase = "seek";
    this.message = this.contractLabel();
    this.warn = false;
    if (!aim) return;
    // Aim at the load required by the active contract (the first DOUBLE RUN leg is the crate).
    const p = assignedPiece;
    const dist = Math.hypot(p.x, p.z);
    this.yaw = Math.atan2(-p.x, -p.z);
    this.heading = this.yaw;
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
    if (kind === "beam") return 0.32;
    if (kind === "heavy") return 1.25;
    return this.cargoHalf;
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
    this.phase = "seek";
    this.attached = false;
    this.airborne = false;
    this.message = this.contractLabel();
  }

  step(dt: number, actions: Actions) {
    if (dt <= 0 || this.careerBeat || this.boardPause) return;
    if (this.toastLeft > 0) this.toastLeft = Math.max(0, this.toastLeft - dt);
    this.stepTruck(dt, actions);
    if (this.state !== "lifting" || this.flipped) {
      this.safetyLock = false;
      this.safetyBypass = false;
      this.pinHook();
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
    } else if (      this.mode === "easy" &&
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
    this.yawRate += (steer * 0.55 * pace - this.yawRate) * follow;
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
    const requestedCable = clamp(this.cable - hoist * 2.4 * pace * dt, this.cableMin, drop);
    // Do not let continued DOWN input tension a load against the ground.
    if (this.attached && this.landed && hoist > 0) {
      const floorHook = this.hang + this.restY(this.load);
      const supportedLength = Math.hypot(b.x - this.hx, b.y - floorHook, b.z - this.hz);
      this.cable = Math.max(requestedCable, supportedLength);
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      this.hy = floorHook;
    } else {
      this.cable = requestedCable;
    }

    const b = this.boom();
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
      this.gust += dt;
      if (this.gust > 4) {
        this.gust = 0;
        const ang = Math.random() * Math.PI * 2;
        this.windAmp = 0.55 + Math.random() * 0.85;
        this.windX = Math.cos(ang);
        this.windZ = Math.sin(ang);
      }
      const mass = this.attached ? 1100 : 400;
      const acc = tune.wind * this.windAmp * (400 / mass);
      this.vx += this.windX * acc * dt;
      this.vz += this.windZ * acc * dt;
    }

    const dampScale = this.load === "heavy" && this.attached ? 0.3 : 1;
    const damp = Math.min(0.85, tune.damp * dampScale * dt);
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
      // Enforce the cargo's floor plane after the cable-length projection.
      // The previous pre-projection clamp could be undone by the tether constraint,
      // allowing the crate mesh to penetrate the ground on the same frame.
      const floorHook = this.hang + this.restY(this.load);
      const cargoBottom = this.hy - this.hang - this.restY(this.load);
      if (cargoBottom < 0) {
        this.hy = floorHook;
        if (this.vy < 0) this.vy = 0;
        const groundFriction = Math.exp(-14 * dt);
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
    this.cx = piece.x;
    this.cz = piece.z;
    this.cy = piece.y;
    this.attached = true;
    this.airborne = false;
    this.landed = false;
    this.hookReady = false;
    this.phase = "carry";
    const noun = piece.kind === "beam" ? "steel beam" : piece.kind === "heavy" ? "heavy block" : "crate";
    this.message = this.limitState === "ok" ? `${noun} on the hook. Set it in the amber ring.` : this.message;
  }

  requestRelease() {
    if (!this.attached) return;
    if (!this.landed) {
      this.message = "Lower the load fully into the amber set zone before releasing.";
      return;
    }
    const carried = this.carry != null ? this.pieces[this.carry] : undefined;
    const target = this.roofActive ? this.roofDeck() : PADS[this.to]!;
    const radius = this.roofActive ? 3.6 : 2.4;
    const onTarget = Math.hypot(this.hx - target.x, this.hz - target.z) < radius;
    if (onTarget) {
      this.succeed();
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
    this.message = "Load released outside the amber ring. No payment. Reposition and try again.";
    if (carried) {
      carried.x = this.hx;
      carried.z = this.hz;
    }
  }

  private updateApproach() {
    this.hookGap = 99;
    this.hookReady = false;
    this.hookLabel = "";
    this.latch = null;
    let best = 99;
    const requiredKind = activeOffer(this.career).kind;
    for (let i = 0; i < this.pieces.length; i++) {
      const piece = this.pieces[i]!;
      // Nearby loads are not interchangeable: only the contract's assigned kind may be hooked.
      if (piece.kind !== requiredKind) continue;
      const dx = this.hx - piece.x;
      const dz = this.hz - piece.z;
      const flat = Math.hypot(dx, dz);
      const idealY = piece.y + this.hang;
      const gap = Math.hypot(flat, this.hy - idealY);
      if (gap >= best) continue;
      best = gap;
      this.latch = i;
      this.hookGap = gap;
      this.hookLabel = piece.kind === "beam" ? "BEAM" : piece.kind === "heavy" ? "BLOCK" : "CRATE";
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
        this.state = "driving";        this.speed = 0;
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
      this.boomPitch = Math.max(this.boomPitch, STOP_PITCH + 0.08);
      this.pitchRate = 0;
      this.message = "On the tracks. No outriggers. Boom is live.";
      return;
    }
    if (this.state === "lifting" || this.outrigger > 0.5) {
      this.state = "driving";
      this.deployDir = -1;
      this.speed = 0;
      this.message = "Stowing the pads. The boom folds for travel.";
      return;
    }
    if (!this.bStopped()) {
      this.message = "Stop the truck first.";
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
      this.boomPitch = Math.max(this.boomPitch, STOP_PITCH + 0.08);
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
    this.bCanLift = stopped && reach >= 0.98 && down >= 0.98 && contact && level;
  }

  private gateReason() {
    if (!this.bStopped()) return "Truck is still moving.";
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
      this.boomPitch = Math.max(this.boomPitch, STOP_PITCH + 0.08);
      this.pitchRate = 0;
      this.message = "Pads set. Boom is live.";
    }

    const padsClear = !this.usesOutriggers() || this.outrigger < 0.05;
    const canDrive = this.state === "driving" && padsClear && this.deployDir === 0 && !this.flipped;
    const pace = PACE_SCALE[this.pace];

    if (canDrive) {
      const maxV = (this.mode === "hard" ? 11 : 9) * pace * (this.hauling ? 0.62 : 1);
      const target = -actions.trolley * maxV;
      const follow = 1 - Math.exp(-dt * (this.pace === "slow" ? 1.4 : this.mode === "easy" ? 2.2 : 1.15));
      this.speed += (target - this.speed) * follow;
      this.driveSteer += (-actions.steer - this.driveSteer) * Math.min(1, dt * 6);
      const moving = Math.abs(this.speed) > 0.08;
      if (moving) {
        const tightness = 0.95 / (1 + Math.abs(this.speed) * 0.16);
        this.heading += this.driveSteer * tightness * Math.sign(this.speed) * dt;
      } else if (Math.abs(this.driveSteer) > 0.25 && Math.abs(actions.trolley) < 0.2) {
        this.heading += this.driveSteer * 0.4 * pace * dt;
      }
      const fx = -Math.sin(this.heading);
      const fz = -Math.cos(this.heading);
      const nx = clamp(this.truckX + fx * this.speed * dt, -46, 46);
      const nz = clamp(this.truckZ + fz * this.speed * dt, -46, 46);
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

  private loadDemand() {
    // An empty hook has no suspended load. Nearby yard pieces are candidates,
    // not cargo; never apply their weight to the live load chart until hooked.
    if (!this.attached) return 0;
    if (this.load === "heavy") return 8.2;
    if (this.load === "beam") return 4.1;
    return 2;
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
    return rating * angle * (1 - 0.62 * reach);
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
      if (this.hookGap < 12) {        this.message = this.hookReady
          ? `${this.hookLabel} ${this.hookGap.toFixed(1)} m.${chart} Tap HOOK.`
          : `${this.hookLabel} ${this.hookGap.toFixed(1)} m away.${chart}`;
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
      if (flat < 3.6 && bottom < deck.y + 0.45 && bottom > deck.y - 1.1) {
        if (!gentle && this.hookSpeed > limit) {
          this.fail();
        } else {
          this.landed = true;
          this.message = "Load is resting on the building set zone. Press RELEASE LOAD to complete the delivery.";
        }
        return;
      }
    }

    if (this.airborne && bottom <= 0.02) {
      // Snap the load to its exact resting height before enabling RELEASE LOAD.
      if (carried) carried.y = this.restY(carried.kind);
      this.hy = this.hang + this.restY(this.load);
      this.vy = 0;
      const pad = PADS[this.to]!;
      const onTarget = Math.hypot(this.hx - pad.x, this.hz - pad.z) < 2.4;
      if (!gentle && this.hookSpeed > limit) {
        this.fail();
      } else {
        this.landed = true;
        this.message = onTarget
          ? "Load is inside the amber ring. Press RELEASE LOAD to complete this delivery."
          : "Load is on the ground but outside the amber ring. Move it into the target before releasing.";
      }
      return;
    }

    if (this.airborne) this.applyTilt(dt);
    else {
      this.leanSign = 0;
      this.shiftRoll(0, dt);
    }
    if (this.airborne && this.limitState === "ok" && Math.abs(this.roll) < 0.08) {
      this.message = this.roofActive
        ? this.roofDeck().y > 10
          ? "Set the beam on the roof ring."
          : "Set the beam on the floor ring."
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
    const heldOver = this.load === "heavy" && this.limitRatio > 1.45 && Math.abs(this.roll) > 0.4 && this.limitHold > 2.4;
    if (!heldOver) return;
    this.flipped = true;
    this.roll = this.leanSign * 1.15;
    this.rollRate = 0;
    this.park(false);
    this.attached = false;
    this.airborne = false;
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

  private setAside() {
    this.park(false);
    this.attached = false;
    this.airborne = false;
    this.landed = false;
    this.leanSign = 0;
    this.phase = "seek";
    this.message = `Wrong pad. Call is ${this.contractLabel()}.`;
  }

  private loadRest() {
    return this.restY(this.load);
  }

  private overload(pullOver: boolean) {
    this.park(false);
    this.attached = false;
    this.airborne = false;
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

  private succeed() {
    const wasRoof = this.roofActive;
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
      this.message = wasRoof ? "Practice set on the building. Nothing is saved." : "Practice set. Nothing is saved.";
      this.cy = this.loadRest();
      this.cx = PADS[this.to]!.x;
      this.cz = PADS[this.to]!.z;
      return;
    }
    const result = resolveSet(this.career, this.load);
    this.adopt(result.state);
    this.applyContract();
    this.writeCareer();
    if (result.matched) {
      this.score += 1;
      if (this.score > this.best) {
        this.best = this.score;
        writeBest(this.best);
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

  private fail() {
    this.park(false);
    this.attached = false;
    this.airborne = false;
    this.leanSign = 0;
    this.phase = "broke";
    this.impulse = 0.45;
    this.billDrop();
    this.cy = this.loadRest();
    this.cx = this.hx;
    this.cz = this.hz;
  }
}