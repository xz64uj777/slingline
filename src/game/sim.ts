import type { Actions } from "@/game/input";

export type Mode = "easy" | "hard";
export type JobPhase = "seek" | "carry" | "broke" | "done";

export type Pad = { x: number; z: number };

export const PADS: Pad[] = [
  { x: 0, z: -18 },
  { x: 17, z: -8 },
  { x: 12, z: 14 },
  { x: -16, z: -4 },
  { x: -10, z: 16 },
];

const TUNING = {
  easy: { damp: 3.4, assist: 2.4, settle: 4.2, brake: 0.42, impact: 5, wind: 0, snatch: 3.2 },
  hard: { damp: 0.22, assist: 0, settle: 0, brake: 0.12, impact: 1.45, wind: 1.35, snatch: 1.55 },
} as const;

const BEST_KEY = "slingline-best";

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
  yaw = 0;
  yawRate = 0;
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

  readonly jibY = 15.6;
  readonly trolleyMin = 7.5;
  readonly trolleyMax = 24;
  readonly cableMin = 2.2;
  readonly cableMax = 14.7;
  readonly hang = 0.95;
  readonly cargoHalf = 0.8;

  constructor() {
    this.best = readBest();
    this.place(0, 2, true);
  }

  tuning() {
    return TUNING[this.mode];
  }

  boom(): Boom {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    return { x: fx * this.trolley, y: this.jibY, z: fz * this.trolley };
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
    this.message = "Lower the hook onto the crate.";
    this.warn = false;
    if (aim) {
      const dist = Math.hypot(p.x, p.z);
      this.yaw = Math.atan2(-p.x, -p.z);
      this.yawRate = 0;
      this.trolley = clamp(dist, this.trolleyMin, this.trolleyMax);
      this.trolleySpeed = 0;
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
    const tune = this.tuning();
    const follow = clamp(dt / tune.brake, 0, 1);
    this.yawRate += (actions.steer * 0.9 - this.yawRate) * follow;
    this.trolleySpeed += (actions.trolley * 5.5 - this.trolleySpeed) * follow;
    this.yaw += this.yawRate * dt;
    const nextT = this.trolley + this.trolleySpeed * dt;
    if (nextT >= this.trolleyMax) {
      this.trolley = this.trolleyMax;
      if (this.trolleySpeed > 0) this.trolleySpeed = 0;
    } else if (nextT <= this.trolleyMin) {
      this.trolley = this.trolleyMin;
      if (this.trolleySpeed < 0) this.trolleySpeed = 0;
    } else {
      this.trolley = nextT;
    }
    this.cable = clamp(this.cable - actions.hoist * 3.5 * dt, this.cableMin, this.cableMax);

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
    if (this.score > this.best) {
      this.best = this.score;
      writeBest(this.best);
    }
    this.attached = false;
    this.airborne = false;
    this.phase = "done";
    this.deliverFlash = 1.15;
    this.message = "Clean set.";
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
