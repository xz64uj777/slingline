import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Actions } from "./input.ts";
import { CraneSim } from "./sim.ts";

const STEP = 1 / 60;

const IDLE: Actions = { steer: 0, trolley: 0, hoist: 0, extend: 0, modeDown: false };

/** Small deterministic LCG so a hard-mode run (wind gusts) repeats exactly. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function run(sim: CraneSim, seconds: number, actions: Partial<Actions> = {}): void {
  const held = { ...IDLE, ...actions };
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) sim.step(STEP, held);
}

/** Steps with a held control and returns the largest sway reading, in degrees. */
function swayPeak(sim: CraneSim, seconds: number, actions: Partial<Actions> = {}): number {
  const held = { ...IDLE, ...actions };
  let peak = 0;
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
    sim.step(STEP, held);
    peak = Math.max(peak, sim.swayDeg);
  }
  return peak;
}

/**
 * Puts the crane into lifting mode with the boom tip over piece `index` and the
 * hook hanging at that load's pickup height. The carrier is placed by moving it
 * relative to the boom tip, so this does not depend on the yard layout numbers.
 */
function hangOver(sim: CraneSim, index: number): void {
  const piece = sim.pieces[index]!;
  sim.state = "lifting";
  sim.flipped = false;
  sim.heading = 0;
  sim.yaw = 0;
  sim.boomPitch = 0.85;
  sim.yawRate = 0;
  sim.pitchRate = 0;
  sim.extendRate = 0;
  sim.extension = 0;
  sim.cable = 6;
  sim.ready = false;
  sim.step(STEP, IDLE);
  // Slide the carrier until the boom tip is directly above the load.
  sim.truckX += piece.x - sim.hx;
  sim.truckZ += piece.z - sim.hz;
  sim.ready = false;
  sim.step(STEP, IDLE);
  // Match the cable length to the pickup height for this kind of load.
  sim.cable = Math.max(sim.cableMin, sim.cable + sim.hy - (piece.y + sim.hang));
  sim.ready = false;
  sim.step(STEP, IDLE);
  sim.step(STEP, IDLE);
}

function hookUp(sim: CraneSim, index: number): void {
  hangOver(sim, index);
  sim.requestHook();
}

describe("hook pickup", () => {
  it("hooks a load the hook is resting on and starts the carry", () => {
    const sim = new CraneSim();
    hangOver(sim, 0);
    const crate = sim.pieces[0]!;

    assert.equal(sim.hookReady, true, `pickup gap ${sim.hookGap}`);
    sim.requestHook();

    assert.equal(sim.attached, true);
    assert.equal(sim.carry, 0);
    assert.equal(sim.phase, "carry");
    assert.equal(sim.hx, crate.x);
    assert.equal(sim.hz, crate.z);
  });

  it("refuses a hook outside the pickup tolerance", () => {
    const sim = new CraneSim();
    hangOver(sim, 0);
    assert.equal(sim.hookReady, true);

    sim.cable += 0.8;
    sim.ready = false;
    sim.step(STEP, IDLE); // re-pin the hook below the higher boom tip
    sim.step(STEP, IDLE); // then re-measure the approach

    assert.equal(sim.hookReady, false);
    assert.ok(sim.hookGap > 0.25);
    sim.requestHook();
    assert.equal(sim.attached, false);
    assert.match(sim.message, /closer/i);
  });

  it("only offers a hook, never a distant load", () => {
    const sim = new CraneSim();
    hangOver(sim, 0);
    sim.yaw += 0.4;
    sim.ready = false;
    sim.step(STEP, IDLE); // re-pin the hook below the slewed boom tip
    sim.step(STEP, IDLE); // then re-measure the approach

    assert.equal(sim.hookReady, false);
    sim.requestHook();
    assert.equal(sim.attached, false);
  });
});

describe("hook release", () => {
  it("sets the load down where the hook is and clears the chart", () => {
    const sim = new CraneSim();
    hookUp(sim, 0);
    run(sim, 1.2, { hoist: 1 });

    assert.equal(sim.airborne, true);
    assert.ok(sim.limitRatio > 0);
    const piece = sim.pieces[0]!;
    const hx = sim.hx;
    const hz = sim.hz;

    sim.requestRelease();

    assert.equal(sim.attached, false);
    assert.equal(sim.carry, null);
    assert.equal(sim.phase, "seek");
    assert.equal(sim.limitRatio, 0);
    assert.equal(sim.limitState, "ok");
    assert.equal(piece.x, hx);
    assert.equal(piece.z, hz);
    assert.equal(piece.y, 0.8);
  });

  it("ignores release when nothing is on the hook", () => {
    const sim = new CraneSim();
    sim.requestRelease();

    assert.equal(sim.attached, false);
    assert.equal(sim.phase, "seek");
  });
});

describe("load chart", () => {
  it("keeps an empty hook off the chart even with loads in reach", () => {
    const sim = new CraneSim();
    hangOver(sim, 2);

    assert.equal(sim.attached, false);
    assert.equal(sim.limitRatio, 0);
    assert.equal(sim.limitState, "ok");
    assert.equal(sim.warn, false);
  });

  it("clears the chart until the load actually leaves the ground", () => {
    const sim = new CraneSim();
    hangOver(sim, 0);
    sim.requestHook();

    // Hooked but still resting on the ground.
    sim.step(STEP, IDLE);
    assert.equal(sim.attached, true);
    assert.equal(sim.airborne, false);
    assert.equal(sim.limitRatio, 0);
    assert.equal(sim.limitState, "ok");

    run(sim, 1.2, { hoist: 1 });
    assert.equal(sim.airborne, true);
    assert.ok(sim.limitRatio > 0);
  });

  it("reads inside the chart at short reach and over it at full reach", () => {
    const sim = new CraneSim();
    hookUp(sim, 0);
    run(sim, 1.2, { hoist: 1 });
    assert.equal(sim.airborne, true);
    assert.equal(sim.limitState, "ok");
    const shortReach = sim.limitRatio;

    sim.extension = sim.extendMax;
    sim.step(STEP, IDLE);

    assert.equal(sim.limitState, "over");
    assert.ok(sim.limitRatio > shortReach);
    assert.ok(sim.limitRatio > 1);
    assert.equal(sim.warn, true);
  });

  it("puts a heavy block over the rental chart at short reach", () => {
    const sim = new CraneSim();
    hookUp(sim, 2);
    run(sim, 1.2, { hoist: 1 });

    assert.equal(sim.airborne, true);
    assert.equal(sim.load, "heavy");
    assert.equal(sim.limitState, "over");
    assert.ok(sim.limitRatio > 1);
  });
});

describe("outrigger interlock", () => {
  it("will not lift before the pads are set", () => {
    const sim = new CraneSim();
    sim.requestLift();

    assert.equal(sim.state, "driving");
    assert.match(sim.message, /outrigger/i);
  });

  it("will not lift on pads that are only partway down", () => {
    const sim = new CraneSim();
    sim.outrigger = 0.7;
    sim.requestLift();

    assert.equal(sim.state, "driving");
    assert.match(sim.message, /pads are not down/i);
  });

  it("sets the pads, lifts, and locks out driving", () => {
    const sim = new CraneSim();
    sim.requestDeploy();
    assert.equal(sim.deployDir, 1);

    run(sim, 2);
    assert.equal(sim.outrigger, 1);
    assert.equal(sim.state, "lifting");

    const { truckX, truckZ } = sim;
    run(sim, 1, { trolley: 1 });
    assert.equal(sim.truckX, truckX);
    assert.equal(sim.truckZ, truckZ);

    sim.requestDeploy();
    assert.equal(sim.state, "driving");
    assert.equal(sim.deployDir, -1);
  });

  it("will not deploy while the carrier is rolling", () => {
    const sim = new CraneSim();
    sim.speed = 5;
    sim.requestDeploy();

    assert.equal(sim.deployDir, 0);
    assert.match(sim.message, /stop/i);
  });
});

describe("sway", () => {
  it("swings further in hard mode than with the easy-mode assist", () => {
    const easy = new CraneSim();
    easy.mode = "easy";
    hangOver(easy, 0);
    const easyPeak = swayPeak(easy, 1.2, { steer: 1 });

    const hard = new CraneSim();
    hard.mode = "hard";
    hangOver(hard, 0);
    const hardPeak = swayPeak(hard, 1.2, { steer: 1 });

    assert.ok(easyPeak > 0.5, `easy sway stayed flat at ${easyPeak}`);
    assert.ok(hardPeak > easyPeak, `easy ${easyPeak} should be under hard ${hardPeak}`);
  });

  it("settles back toward vertical when the slew stops", () => {
    const sim = new CraneSim();
    hangOver(sim, 0);
    const peak = swayPeak(sim, 1.2, { steer: 1 });

    run(sim, 3);

    assert.ok(sim.swayDeg < peak * 0.5, `sway ${sim.swayDeg} from peak ${peak}`);
    assert.ok(sim.swayDeg < 2);
  });
});

describe("deterministic wind", () => {
  it("repeats a hard-mode run exactly for the same seed", () => {
    const first = new CraneSim(seeded(7));
    first.mode = "hard";
    hangOver(first, 0);
    run(first, 6, { steer: 0.6 });

    const second = new CraneSim(seeded(7));
    second.mode = "hard";
    hangOver(second, 0);
    run(second, 6, { steer: 0.6 });

    assert.equal(first.windAmp, second.windAmp);
    assert.equal(first.windX, second.windX);
    assert.equal(first.hx, second.hx);
    assert.equal(first.hy, second.hy);
    assert.equal(first.hz, second.hz);
    assert.equal(first.swayDeg, second.swayDeg);
  });

  it("changes the gust pattern with the seed", () => {
    const first = new CraneSim(seeded(1));
    first.mode = "hard";
    hangOver(first, 0);
    run(first, 6, { steer: 0.6 });

    const second = new CraneSim(seeded(2));
    second.mode = "hard";
    hangOver(second, 0);
    run(second, 6, { steer: 0.6 });

    assert.notEqual(first.windAmp, 0.8);
    assert.notEqual(second.windAmp, 0.8);
    assert.notEqual(first.windX, second.windX);
    assert.notEqual(first.hx, second.hx);
  });
});
