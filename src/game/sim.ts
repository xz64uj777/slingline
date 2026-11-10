import type { Actions } from "@/game/input";

export type Mode = "easy" | "hard";
export type Pace = "slow" | "steady" | "fast";
export type JobPhase = "seek" | "carry" | "broke" | "done";
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

export type CraneId = "rental" | "yard" | "heavy" | "lattice" | "tower";

const CRANES: Record<
  CraneId,
  { base: number; extend: number; pay: number; next: CraneId | null; price: number; label: string; mount: number }
> = {
  rental: { base: 5.5, extend: 6, pay: 500, next: "yard", price: 500, label: "RENTAL", mount: 2.15 },
  yard: { base: 8.5, extend: 14, pay: 700, next: "heavy", price: 700, label: "YARD", mount: 2.15 },
  heavy: { base: 12, extend: 20, pay: 1200, next: "lattice", price: 1200, label: "HEAVY", mount: 2.35 },
  lattice: { base: 16, extend: 26, pay: 1800, next: "tower", price: 1800, label: "LATTICE", mount: 2.5 },
  tower: { base: 14, extend: 22, pay: 2500, next: null, price: 0, label: "TOWER", mount: 14 },
};

function readCareer(): { cash: number; crane: CraneId; reputation: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(CAREER_KEY) || "") as {
      cash?: number;
      crane?: CraneId;
      reputation?: number;
    };
    const crane: CraneId =
      raw.crane === "yard" || raw.crane === "heavy" || raw.crane === "lattice" || raw.crane === "tower"
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
    this.place(0, 5, true);
  }

  private applyCrane() {
    const spec = CRANES[this.crane];
    this.extendMax = spec.extend;
    this.baseLen = spec.base;
    this.mountY = spec.mount;
  }

  companyName() {
    if (this.crane === "rental") return "Temp Hire";
    if (this.crane === "lattice") return "Slingline Co";
    if (this.crane === "tower") return "Slingline Tower";
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
      this.message = "You already own the tower crane.";
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
            : "Tower crane is yours. The boom is up on the mast.";
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
    const reach = this.mountBack + Math.cos(this.boomPitch) * length;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    return {
      x: this.truckX + fx * reach,
      y: this.mountY + Math.sin(this.boomPitch) * length,
      z: this.truckZ + fz * reach,
    };
  }

  place(from: number, to: number, aim: boolean) {
    this.from = from;
    this.to = to;
    const p = PADS[from]!;
    this.cx = p.x;
    this.cy = this.cargoHalf;
    this.cz = p.z;
    this.attached = false;
    this.airborne = false;
    this.phase = "seek";
    this.message =
      this.state === "lifting"
        ? "Lower the hook onto the crate."
        : "Drive to the crate. Stop, then deploy the pads.";
    this.warn = false;
    if (aim) {
      const dist = Math.hypot(p.x, p.z);
      this.yaw = Math.atan2(-p.x, -p.z);
      this.heading = this.yaw;
      this.yawRate = 0;
      this.boomPitch = 0.55;
      this.pitchRate = 0;
      const reach = Math.max(6, dist - this.mountBack);
      const length = reach / Math.cos(this.boomPitch);
      this.extension = clamp(length - this.baseLen, 0, this.extendMax);
      this.extendRate = 0;
      this.cable = 6.2;
      this.ready = false;
    }
  }

  spawnNext() {
    let from = Math.floor(Math.random() * PADS.length);
    let to = Math.floor(Math.random() * PADS.length);
    if (to === from) to = (to + 1) % PADS.length;
    this.place(from, to, false);
  }

  step(dt: number, actions: Actions) {
    if (dt <= 0) return;
    this.stepTruck(dt, actions);
    if (this.state !== "lifting" || this.flipped) {
      this.pinHook();
      return;
    }
    const tune = this.tuning();
    const pace = PACE_SCALE[this.pace];
    const follow = clamp(dt / tune.brake, 0, 1);
    this.yawRate += (actions.steer * 0.55 * pace - this.yawRate) * follow;
    this.pitchRate += (actions.trolley * 0.32 * pace - this.pitchRate) * follow;
    this.extendRate += (actions.extend * 3.2 * pace - this.extendRate) * follow;
    this.yaw += this.yawRate * dt;
    this.boomPitch = clamp(this.boomPitch + this.pitchRate * dt, 0.12, 1.2);
    this.extension = clamp(this.extension + this.extendRate * dt, 0, this.extendMax);
    const drop = Math.max(this.cableMin, this.boom().y - 0.9);
    this.cable = clamp(this.cable - actions.hoist * 2.4 * pace * dt, this.cableMin, Math.min(16, drop));

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
    const bvz = (b.z - this.prevBz) / dt;

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

    const damp = Math.min(0.85, tune.damp * dt);
    this.vx -= this.vx * damp;
    this.vy -= this.vy * damp;
    this.vz -= this.vz * damp;

    if (tune.assist > 0) {
      const as = clamp(tune.assist * dt, 0, 1);
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

    this.updateJob();

    if (this.phase === "broke") {
      this.breakFlash -= dt;
      if (this.breakFlash <= 0) this.spawnNext();
    } else if (this.phase === "done") {
      this.deliverFlash -= dt;
      if (this.deliverFlash <= 0) this.spawnNext();
    }
  }

  requestDeploy() {
    if (this.state !== "driving" || this.flipped) return;
    this.refreshGate();
    if (!this.bStopped()) {
      this.message = "Stop the truck first.";
      return;
    }
    this.deployDir = this.outrigger > 0.5 ? -1 : 1;
    this.message = this.deployDir > 0 ? "Deploying outriggers." : "Stowing outriggers.";
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
    return "Pads set. Tap LIFT.";
  }

  private stepTruck(dt: number, actions: Actions) {
    if (this.deployDir !== 0) {
      this.outrigger = clamp(this.outrigger + this.deployDir * (dt / 1.6), 0, 1);
      this.speed = 0;
      if (this.outrigger <= 0 || this.outrigger >= 1) this.deployDir = 0;
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
    else if (padsClear) this.message = "Drive to the crate. Stop, then DEPLOY.";
    else this.message = this.gateReason();
  }

  private pinHook() {
    this.yaw = this.heading;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.extendRate = 0;
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

  private updateJob() {
    this.warn = false;
    if (this.phase === "broke" || this.phase === "done") return;

    if (!this.attached) {
      const dx = this.hx - this.cx;
      const dz = this.hz - this.cz;
      const dist = Math.hypot(dx, dz);
      const idealY = this.cy + this.hang;
      const snatch = this.tuning().snatch;
      if (dist < 1.4 && Math.abs(this.hy - idealY) < 0.8 && this.hookSpeed < snatch) {
        this.attached = true;
        this.airborne = false;
        this.phase = "carry";
        this.message = "Lift clear, then set it in the amber ring.";
      } else if (dist < 2.2 && this.hookSpeed >= snatch) {
        this.message = "Too fast to hook. Let the swing die.";
      } else {
        this.message = "Lower the hook onto the crate.";
      }
      return;
    }

    const bottom = this.hy - this.hang - this.cargoHalf;
    if (bottom > 1.35) this.airborne = true;

    const limit = this.tuning().impact;
    if (this.airborne && bottom < 3.4 && this.hookSpeed > limit * 0.72) this.warn = true;

    if (this.airborne && bottom <= 0.08) {
      const pad = PADS[this.to]!;
      const onTarget = Math.hypot(this.hx - pad.x, this.hz - pad.z) < 2.4;
      if (this.hookSpeed > limit) this.fail();
      else if (onTarget) this.succeed();
      else this.setAside();
    } else if (this.airborne) {
      this.message = this.warn ? "Too fast. Ease it down." : "Set it inside the amber ring.";
    }
  }

  private setAside() {
    this.cx = this.hx;
    this.cz = this.hz;
    this.cy = this.cargoHalf;
    this.attached = false;
    this.airborne = false;
    this.phase = "seek";
    this.message = "Wrong pad. Hook it again.";
  }

  private succeed() {
    this.score += 1;
    const pay = CRANES[this.crane].pay;
    this.cash += pay;
    this.reputation += 1;
    this.writeCareer();
    if (this.score > this.best) {
      this.best = this.score;
      writeBest(this.best);
    }
    this.attached = false;
    this.airborne = false;
    this.phase = "done";
    this.deliverFlash = 1.15;
    this.message = `Clean set. +$${pay}`;
    this.cy = this.cargoHalf;
    this.cx = PADS[this.to]!.x;
    this.cz = PADS[this.to]!.z;
  }

  private fail() {
    this.attached = false;
    this.airborne = false;
    this.phase = "broke";
    this.breakFlash = 1.35;
    this.impulse = 0.45;
    this.message = "Sling parted.";
    this.cy = this.cargoHalf;
    this.cx = this.hx;
    this.cz = this.hz;
  }
}
