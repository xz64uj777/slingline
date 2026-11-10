import type { Actions } from "@/game/input";

export type Mode = "easy" | "hard";
export type Pace = "slow" | "steady" | "fast";
export type JobPhase = "seek" | "carry" | "broke" | "done";
export type LoadKind = "crate" | "beam" | "heavy";

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

const PACE_SCALE = { slow: 0.42, steady: 0.7, fast: 1 } as const;
const BEST_KEY = "slingline-best";
const CAREER_KEY = "slingline-career";
const STOP_PITCH = (44 * Math.PI) / 180;

export type CraneId = "rental" | "yard" | "heavy" | "lattice" | "tower" | "crawler";

const CRANES: Record<
  CraneId,
  { base: number; extend: number; pay: number; next: CraneId | null; price: number; label: string; mount: number }
> = {
  rental: { base: 5.5, extend: 6, pay: 500, next: "yard", price: 500, label: "RENTAL", mount: 1.32 },
  yard: { base: 8.5, extend: 14, pay: 700, next: "heavy", price: 700, label: "YARD", mount: 1.32 },
  heavy: { base: 12, extend: 20, pay: 1200, next: "lattice", price: 1200, label: "HEAVY", mount: 1.38 },
  lattice: { base: 16, extend: 26, pay: 1800, next: "tower", price: 1800, label: "LATTICE", mount: 1.38 },
  tower: { base: 14, extend: 22, pay: 2500, next: "crawler", price: 2500, label: "TOWER", mount: 16.2 },
  crawler: { base: 18, extend: 30, pay: 3200, next: null, price: 0, label: "CRAWLER", mount: 1.32 },
};

export const CRANE_CHOICES: { id: CraneId; label: string }[] = (
  Object.entries(CRANES) as [CraneId, (typeof CRANES)[CraneId]][]
).map(([id, spec]) => ({ id, label: spec.label }));

function readCareer(): { cash: number; crane: CraneId; reputation: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(CAREER_KEY) || "") as {
      cash?: number;
      crane?: CraneId;
      reputation?: number;
    };
    const crane: CraneId =
      raw.crane === "yard" ||
      raw.crane === "heavy" ||
      raw.crane === "lattice" ||
      raw.crane === "tower" ||
      raw.crane === "crawler"
        ? raw.crane
        : "rental";
    return {
      cash: Number.isFinite(raw.cash) ? Math.max(0, raw.cash as number) : 0,
      crane,
      reputation: Number.isFinite(raw.reputation) ? Math.max(0, raw.reputation as number) : 0,
    };
  } catch {
    return { cash: 0, crane: "rental", reputation: 0 };
  }
}

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
  roll = 0;
  rollRate = 0;
  outrigger = 0;
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
  phase: JobPhase = "seek";
  load: LoadKind = "crate";
  from = 0;
  to = 1;
  score = 0;
  best = 0;
  cash = 0;
  reputation = 0;
  crane: CraneId = "rental";
  message = "Lower the hook onto the crate.";
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
  readonly cableMin = 2.2;
  readonly cableMax = 14.7;
  readonly hang = 0.95;
  readonly cargoHalf = 0.8;

  constructor() {
    this.best = readBest();
    const career = readCareer();
    this.cash = career.cash;
    this.crane = career.crane;
    this.reputation = career.reputation;
    this.applyCrane();
    this.stockYard(true);
  }

  private applyCrane() {
    const spec = CRANES[this.crane];
    this.extendMax = spec.extend;
    this.baseLen = spec.base;
    this.mountY = spec.mount;
  }

  selectCrane(id: CraneId) {
    this.crane = id;
    this.applyCrane();
    if (this.extension > this.extendMax) this.extension = this.extendMax;
    this.writeCareer();
    this.message = `${CRANES[id].label} ready.`;
  }

  companyName() {
    if (this.crane === "rental") return "Temp Hire";
    if (this.crane === "lattice") return "Slingline Co";
    if (this.crane === "tower") return "Slingline Tower";
    if (this.crane === "crawler") return "Slingline Tracks";
    return "Independent";
  }

  craneLabel() {
    return `NOW ${CRANES[this.crane].label}`;
  }

  buyLabel() {
    const next = CRANES[this.crane].next;
    if (!next) return "TOP CRANE";
    const spec = CRANES[next];
    return `BUY ${spec.label} $${CRANES[this.crane].price}`;
  }

  buyNext() {
    const next = CRANES[this.crane].next;
    if (!next) {
      this.message = "You already own the crawler.";
      return;
    }
    const price = CRANES[this.crane].price;
    if (this.cash < price) {
      this.message = `Need $${price}. You have $${this.cash}.`;
      return;
    }
    this.cash -= price;
    this.crane = next;
    this.applyCrane();
    this.writeCareer();
    this.message =
      next === "yard"
        ? "Yard crane is yours. Longer boom."
        : next === "heavy"
          ? "Heavy crane is yours."
          : next === "lattice"
            ? "Lattice crane is yours."
            : next === "tower"
              ? "Tower crane is yours. The boom is up on the mast."
              : "Crawler is yours. It sits on tracks.";
  }

  private writeCareer() {
    try {
      localStorage.setItem(
        CAREER_KEY,
        JSON.stringify({ cash: this.cash, crane: this.crane, reputation: this.reputation }),
      );
    } catch {
      /* private mode */
    }
  }

  tuning() {
    return TUNING[this.mode];
  }

  boom(): Boom {
    const length = this.baseLen + this.extension;
    const pitch = this.boomPitch;
    const yOnBoom = 0.15 * Math.cos(pitch) + length * Math.sin(pitch);
    const zOnBoom = 0.15 * Math.sin(pitch) - length * Math.cos(pitch);
    const ry = this.yaw - this.heading;
    const lx = zOnBoom * Math.sin(ry);
    const ly = this.mountY + yOnBoom;
    const lz = -this.mountBack + zOnBoom * Math.cos(ry);
    const cH = Math.cos(this.heading);
    const sH = Math.sin(this.heading);
    const cR = Math.cos(this.roll);
    const sR = Math.sin(this.roll);
    return {
      x: this.truckX + cH * cR * lx - cH * sR * ly + sH * lz,
      y: sR * lx + cR * ly,
      z: this.truckZ - sH * cR * lx + sH * sR * ly + cH * lz,
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
    this.load = "crate";
    this.cx = homes[0]!.x;
    this.cz = homes[0]!.z;
    this.cy = this.restY("crate");
    this.from = 0;
    this.to = 5;
    this.attached = false;
    this.airborne = false;
    this.phase = "seek";
    this.message = "Crate, steel beam, and heavy block are out. Hook any of them.";
    this.warn = false;
    if (!aim) return;
    const p = homes[1]!;
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
    this.message = "Hook the crate, the beam, or the heavy block.";
  }

  step(dt: number, actions: Actions) {
    if (dt <= 0) return;
    this.stepTruck(dt, actions);
    if (this.state !== "lifting" || this.flipped) {
      this.safetyLock = false;
      this.safetyBypass = false;
      this.pinHook();
      return;
    }
    const tune = this.tuning();
    const pace = PACE_SCALE[this.pace];
    const follow = clamp(dt / tune.brake, 0, 1);
    let steer = actions.steer;
    let trolley = actions.trolley;
    let extend = actions.extend;
    let hoist = actions.hoist;
    if (this.mode === "hard") {
      this.safetyLock = false;
      this.safetyBypass = false;
    }
    if (this.safetyLock) {
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
    this.cable = clamp(this.cable - hoist * 2.4 * pace * dt, this.cableMin, drop);

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

    if (this.attached && !this.airborne) {
      const floorHook = this.hang + this.cargoHalf;
      if (this.hy < floorHook) {
        this.hy = floorHook;
        if (this.vy < 0) this.vy = 0;
        this.vx *= 0.9;
        this.vz *= 0.9;
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
    if (this.safetyLock) this.message = "Safety stop at 44°. Tap SAFETY to move again.";

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
    this.warn = true;
    this.message = "Safety stop at 44°. Tap SAFETY to move again.";
  }

  requestHook() {
    if (this.attached || this.latch == null || !this.hookReady) {
      this.message = "Move the hook closer, then tap HOOK.";
      return;
    }
    const piece = this.pieces[this.latch];
    if (!piece) return;
    this.carry = this.latch;
    this.load = piece.kind;
    this.cx = piece.x;
    this.cz = piece.z;
    this.cy = piece.y;
    this.attached = true;
    this.airborne = false;
    this.hookReady = false;
    this.phase = "carry";
    const noun = piece.kind === "beam" ? "steel beam" : piece.kind === "heavy" ? "heavy block" : "crate";
    this.message = this.limitState === "ok" ? `${noun} on the hook. Set it in the amber ring.` : this.message;
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
      this.hookLabel = piece.kind === "beam" ? "BEAM" : piece.kind === "heavy" ? "BLOCK" : "CRATE";
      this.hookReady = flat < 2.1 && Math.abs(this.hy - idealY) < 1.05;
    }
  }

  requestDeploy() {
    if (this.flipped) return;
    if (this.state === "lifting" || this.outrigger > 0.5) {
      this.state = "driving";
      this.deployDir = -1;
      this.speed = 0;
      this.message = "Stowing outriggers.";
      return;
    }
    if (!this.bStopped()) {
      this.message = "Stop the truck first.";
      return;
    }
    this.deployDir = 1;
    this.message = "Deploying outriggers. The boom unlocks when the pads are down.";
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
    this.message = "Pads set. Stick pitches the boom. Out and In telescope.";
  }

  recover() {
    this.flipped = false;
    this.roll = 0;
    this.rollRate = 0;
    this.speed = 0;
    this.state = "driving";
    this.deployDir = -1;
    this.message = "Upright. Stow the pads, then drive.";
  }

  private bStopped() {
    return Math.abs(this.speed) < 0.2;
  }

  private refreshGate() {
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
      this.message = "Pads set. Stick pitches the boom. Out and In telescope.";
    }

    const padsClear = this.outrigger < 0.05;
    const canDrive = this.state === "driving" && padsClear && this.deployDir === 0 && !this.flipped;
    const pace = PACE_SCALE[this.pace];

    if (canDrive) {
      const maxV = (this.mode === "hard" ? 12 : 8) * pace;
      const target = actions.trolley * maxV;
      const follow = 1 - Math.exp(-dt * (this.mode === "easy" ? 2.6 : 1.1));
      this.speed += (target - this.speed) * follow;
      const turn = actions.steer * (0.7 + Math.min(0.8, Math.abs(this.speed) * 0.1));
      if (Math.abs(this.speed) > 0.15) this.heading += turn * dt * Math.sign(this.speed);
      const fx = -Math.sin(this.heading);
      const fz = -Math.cos(this.heading);
      this.truckX = clamp(this.truckX + fx * this.speed * dt, -32, 32);
      this.truckZ = clamp(this.truckZ + fz * this.speed * dt, -32, 32);

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
          this.message = "Truck rolled. Corner was too fast.";
        }
      }
    } else {
      this.speed *= Math.exp(-5 * dt);
      this.lateralG = 0;
      if (!this.flipped && this.state !== "lifting") this.roll += -this.roll * Math.min(1, dt * 3);
    }

    this.refreshGate();
    if (this.state !== "lifting") {
      this.boomPitch += (0.85 - this.boomPitch) * Math.min(1, dt);
      this.extension += (0 - this.extension) * Math.min(1, dt);
    }
    if (this.flipped) return;
    if (this.state === "lifting") return;
    if (this.deployDir > 0) this.message = "Deploying outriggers.";
    else if (this.deployDir < 0) this.message = "Stowing outriggers.";
    else if (padsClear)
      this.message =
        this.load === "heavy"
          ? "Heavy block. A fast swing will snap the wire or pull the crane over."
          : this.load === "beam"
            ? "Steel beam. Drive over, stop, then DEPLOY."
            : "Drive to the crate. Stop, then DEPLOY.";
    else this.message = this.gateReason();
  }

  private pinHook() {
    this.yaw = this.heading;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.extendRate = 0;
    const b = this.boom();
    this.cable = Math.min(this.cable, Math.max(this.cableMin, b.y - 0.35));
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
  }

  private updateJob(dt: number) {
    this.warn = false;
    if (this.phase === "broke" || this.phase === "done") return;
    this.updateChart(dt);

    if (!this.attached) {
      this.updateApproach();
      if (this.hookGap < 12) {
        this.message = this.hookReady
          ? `${this.hookLabel} ${this.hookGap.toFixed(1)} m. Tap HOOK.`
          : `${this.hookLabel} ${this.hookGap.toFixed(1)} m away.`;
      } else if (this.limitState === "over") this.message = "Over the chart. Shorten the boom before you lift.";
      else if (this.limitState === "near") this.message = "Near the limit. Watch the angle and the length.";
      else this.message = "Hook the crate, the beam, or the heavy block.";
      return;
    }
    this.hookReady = false;

    const carried = this.carry != null ? this.pieces[this.carry] : undefined;
    if (carried) {
      carried.x = this.hx;
      carried.z = this.hz;
      carried.y = this.hy - this.hang;
    }

    const bottom = this.hy - this.hang - this.cargoHalf;
    if (bottom > 1.35) this.airborne = true;

    const fast = this.hookSpeed > (this.mode === "easy" ? 6.4 : 3.6);
    if (this.load === "heavy" && this.limitState === "over" && fast && this.airborne) {
      this.overload(Math.abs(this.roll) > 0.22);
      return;
    }

    const limit = this.load === "heavy" ? this.tuning().impact / 1.6 : this.tuning().impact;
    if (this.airborne && bottom < 3.4 && this.hookSpeed > limit * 0.72) this.warn = true;

    if (this.airborne && bottom <= 0.08) {
      const pad = PADS[this.to]!;
      const onTarget = Math.hypot(this.hx - pad.x, this.hz - pad.z) < 2.4;
      if (this.hookSpeed > limit) this.fail();
      else if (onTarget) this.succeed();
      else this.setAside();
      return;
    }

    this.applyTilt(dt);
    if (this.airborne && this.limitState === "ok" && Math.abs(this.roll) < 0.08) {
      this.message = "Set it inside the amber ring.";
    }
  }

  private applyTilt(dt: number) {
    const excess = Math.max(0, this.limitRatio - 0.8);
    const sign = Math.sign(this.side || 1);
    const target = sign * Math.min(0.46, excess * 0.9);
    this.roll += (target - this.roll) * Math.min(1, dt * 2.2);
    if (excess < 0.08) return;
    this.warn = true;
    this.message =
      this.limitRatio > 1 ? "Tilt warning. Boom in before it goes over." : "Crane is starting to lean.";
    const heldOver = this.load === "heavy" && this.limitRatio > 1.45 && Math.abs(this.roll) > 0.4 && this.limitHold > 2.4;
    if (!heldOver) return;
    this.flipped = true;
    this.roll = sign * 1.15;
    this.rollRate = 0;
    this.park(false);
    this.attached = false;
    this.airborne = false;
    this.phase = "broke";
    this.breakFlash = 1.5;
    this.impulse = 0.7;
    this.message = "Crane fell over.";
    this.cy = this.loadRest();
    this.cx = this.hx;
    this.cz = this.hz;
  }

  private setAside() {
    this.park(false);
    this.attached = false;
    this.airborne = false;
    this.phase = "seek";
    this.message = "Wrong pad. Hook it again.";
  }

  private loadRest() {
    return this.restY(this.load);
  }

  private overload(pullOver: boolean) {
    this.park(false);
    this.attached = false;
    this.airborne = false;
    this.phase = "broke";
    this.breakFlash = 1.5;
    this.impulse = 0.7;
    this.cy = this.loadRest();
    this.cx = this.hx;
    this.cz = this.hz;
    if (pullOver) {
      this.flipped = true;
      this.roll = Math.sign(this.side || 1) * 1.2;
      this.rollRate = 0;
      this.speed = 0;
      this.message = "Heavy load pulled the crane over.";
      return;
    }
    this.message = "Wire snapped.";
  }

  private succeed() {
    this.score += 1;
    const pay = CRANES[this.crane].pay * (this.load === "heavy" ? 3 : this.load === "beam" ? 2 : 1);
    this.cash += pay;
    this.reputation += 1;
    this.writeCareer();
    if (this.score > this.best) {
      this.best = this.score;
      writeBest(this.best);
    }
    this.park(true);
    this.attached = false;
    this.airborne = false;
    this.phase = "done";
    this.deliverFlash = 1.15;
    this.message = `Clean set. +$${pay}`;
    this.cy = this.loadRest();
    this.cx = PADS[this.to]!.x;
    this.cz = PADS[this.to]!.z;
  }

  private fail() {
    this.park(false);
    this.attached = false;
    this.airborne = false;
    this.phase = "broke";
    this.breakFlash = 1.35;
    this.impulse = 0.45;
    this.message = "Wire snapped.";
    this.cy = this.loadRest();
    this.cx = this.hx;
    this.cz = this.hz;
  }
}
