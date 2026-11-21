import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Actions } from "./input.ts";
import { CraneSim, MAPLE_LANE_SETUP, MAPLE_LANE_START, PADS, WIND_FARM_START } from "./sim.ts";
import { JOBS } from "./jobs.ts";
import { loadSpec } from "./loads.ts";
import { dailyRun } from "./daily.ts";

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

  it("does not hook a load just because the hook is on it", () => {
    const sim = new CraneSim();
    hangOver(sim, 0);
    assert.equal(sim.hookReady, true);
    run(sim, 0.5);
    assert.equal(sim.attached, false);
    assert.equal(sim.carry, null);
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

describe("hook alignment guidance", () => {
  it("reports signed corrections in crane-control axes", () => {
    const sim = new CraneSim();
    hangOver(sim, 0);
    const piece = sim.pieces[0]!;
    sim.hx = piece.x + 2;
    sim.hz = piece.z + 3;
    sim.hy = piece.y + sim.hang - 1;

    const alignment = sim.hookAlignment();
    assert.ok(alignment);
    assert.equal(alignment.target, "CRATE");
    assert.ok(Math.abs(alignment.slew - 2) < 1e-9, "positive slew should mean left/A");
    assert.ok(Math.abs(alignment.reach - 3) < 1e-9, "positive reach should mean boom out");
    assert.ok(Math.abs(alignment.hoist - 1) < 1e-9, "positive hoist should mean raise the hook");
    assert.ok(Math.abs(alignment.distance - Math.sqrt(14)) < 1e-9);
  });

  it("points the same cues at the set only after the load is hooked", () => {
    const sim = new CraneSim();
    assert.equal(sim.carryAlignment(), null);
    hookUp(sim, 0);
    const spot = sim.setSpot();
    sim.hx = spot.x + 2;
    sim.hz = spot.z + 3;
    sim.hy = spot.y + sim.hang + 1;
    const alignment = sim.carryAlignment();
    assert.ok(alignment);
    assert.match(alignment.target, /SET/);
    assert.ok(Math.abs(alignment.slew - 2) < 1e-6);
    assert.ok(Math.abs(alignment.reach - 3) < 1e-6);
    assert.ok(alignment.hoist < 0);
  });
});

describe("deployment safety", () => {
  it("raises the boom clear of the interlock when the pads set", () => {
    const sim = new CraneSim();
    assert.equal(sim.state, "driving");

    sim.requestDeploy();
    run(sim, 2.2);

    assert.equal(sim.state, "lifting");
    assert.equal(sim.safetyLock, false);
    assert.ok(sim.boomPitch > (44 * Math.PI) / 180 + 0.07);
  });
});

describe("grounded load", () => {
  it("cannot be dragged by DOWN input and lifts again on HOIST", () => {
    const sim = new CraneSim();
    hookUp(sim, 0);
    run(sim, 1.2, { hoist: 1 });
    assert.equal(sim.airborne, true);

    for (let i = 0; i < 1600 && !sim.landed; i += 1) sim.step(STEP, { ...IDLE, hoist: -0.15 });
    assert.equal(sim.landed, true, `expected touchdown, message: ${sim.message}`);
    assert.equal(sim.airborne, false);

    const hx = sim.hx;
    const hz = sim.hz;
    run(sim, 1.5, { hoist: -1 });
    assert.equal(sim.attached, true);
    assert.ok(Math.hypot(sim.hx - hx, sim.hz - hz) < 0.05, "DOWN input dragged the grounded load");

    run(sim, 0.5, { hoist: 1 });
    assert.equal(sim.landed, false);
    assert.equal(sim.airborne, true);
  });
});

describe("set completion", () => {
  it("stays hooked when a load lands inside the amber ring until RELEASE", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "yard", cash: 0, reputation: 5 };
    hookUp(sim, 0);
    // A target directly under the pickup makes this a pure landing test.
    PADS.push({ x: sim.hx, z: sim.hz });
    sim.to = PADS.length - 1;
    try {
      run(sim, 1.2, { hoist: 1 });
      for (let i = 0; i < 1600 && !sim.landed; i += 1) sim.step(STEP, { ...IDLE, hoist: -0.15 });
      assert.equal(sim.landed, true);
      assert.equal(sim.attached, true);
      assert.notEqual(sim.phase, "done");
      sim.requestRelease();
    } finally {
      PADS.pop();
    }
    assert.equal(sim.phase, "done");
    assert.ok(sim.lastSet, "release inside the ring should grade and pay the set");
  });
});

describe("hook release", () => {
  it("keeps a suspended load on the hook until it is landed", () => {
    const sim = new CraneSim();
    hookUp(sim, 0);
    run(sim, 1.2, { hoist: 1 });

    assert.equal(sim.airborne, true);
    assert.ok(sim.limitRatio > 0);

    sim.requestRelease();

    assert.equal(sim.attached, true);
    assert.match(sim.message, /lower the load fully/i);
  });

  it("releases a landed load outside the ring and clears the chart without paying", () => {
    const sim = new CraneSim();
    hookUp(sim, 0);
    const piece = sim.pieces[0]!;
    const hx = sim.hx;
    const hz = sim.hz;
    sim.landed = true;

    sim.requestRelease();

    assert.equal(sim.attached, false);
    assert.equal(sim.carry, null);
    assert.equal(sim.phase, "seek");
    assert.equal(sim.limitRatio, 0);
    assert.equal(sim.limitState, "ok");
    assert.equal(sim.lastSet, null);
    assert.equal(piece.x, hx);
    assert.equal(piece.z, hz);
    assert.equal(piece.y, 0.8);
    assert.match(sim.message, /outside the ring/i);
  });

  it("completes a landed set inside the ring when RELEASE is pressed", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "yard", cash: 0, reputation: 5 };
    hookUp(sim, 0);
    sim.landed = true;
    sim.hx = PADS[sim.to]!.x;
    sim.hz = PADS[sim.to]!.z;

    sim.requestRelease();

    assert.equal(sim.attached, false);
    assert.equal(sim.phase, "done");
    assert.ok(sim.lastSet, "a landed release on the ring should leave a report");
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

  it("keeps the crate inside the rental chart even at full reach", () => {
    const sim = new CraneSim();
    hookUp(sim, 0);
    run(sim, 1.2, { hoist: 1 });
    assert.equal(sim.airborne, true);
    assert.equal(sim.limitState, "ok");
    const shortReach = sim.limitRatio;

    sim.extension = sim.extendMax;
    sim.step(STEP, IDLE);

    assert.ok(sim.limitRatio > shortReach);
    assert.equal(sim.limitState, "ok");
    assert.equal(sim.warn, false);
  });

  it("puts a heavy block over the rental chart at short reach", () => {
    const sim = new CraneSim();
    // The yard now stocks the call's material: put the heavy call on the pad.
    sim.career = { ...sim.career, status: "independent", job: "tracks", crane: "crawler", crawlerOnSite: true, reputation: 8 };
    sim.stockYard(true);
    hookUp(sim, 0);
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

describe("vehicle controls", () => {
  it("drives forward toward the visible cab nose and reverses with the opposite input", () => {
    const forward = new CraneSim();
    run(forward, 1, { trolley: 1 });
    assert.ok(forward.truckZ > 0.5, `forward travel was ${forward.truckZ}`);

    const reverse = new CraneSim();
    run(reverse, 1, { trolley: -1 });
    assert.ok(reverse.truckZ < -0.5, `reverse travel was ${reverse.truckZ}`);
  });

  it("steers left and right relative to the visible cab while moving forward", () => {
    const left = new CraneSim();
    const initialLeftHeading = left.heading;
    run(left, 0.8, { trolley: 1, steer: 1 });
    assert.ok(left.heading > initialLeftHeading, `left steering changed heading to ${left.heading}`);

    const right = new CraneSim();
    const initialRightHeading = right.heading;
    run(right, 0.8, { trolley: 1, steer: -1 });
    assert.ok(right.heading < initialRightHeading, `right steering changed heading to ${right.heading}`);
  });

  it("keeps the lowboy tractor moving toward its drop pad", () => {
    const sim = new CraneSim();
    sim.hauling = true;
    sim.truckZ = 36;
    run(sim, 1, { trolley: 1 });
    assert.ok(sim.truckZ < 35.5, `lowboy delivery travel was ${sim.truckZ}`);
  });
});

describe("call cargo progression", () => {
  it("restocks the next rental job and both backyard spa legs with their own cargo", () => {
    const sim = new CraneSim();

    sim.career = { ...sim.career, jobsDone: 1 };
    sim.spawnNext();
    assert.equal(sim.load, "pipe");
    assert.equal(sim.pieces[0]?.kind, "pipe");

    sim.career = {
      ...sim.career,
      status: "independent",
      crane: "yard",
      reputation: 3,
      job: "yard",
      leg: 0,
      roofActive: false,
    };
    sim.acceptJob("spa");
    assert.equal(sim.load, "deck");
    assert.equal(sim.pieces[0]?.kind, "deck");
    assert.equal(sim.to, 6);
    assert.deepEqual(PADS[sim.to], { x: -101, z: 41 });
    assert.equal(sim.from, 9);
    assert.deepEqual({ x: sim.truckX, z: sim.truckZ }, { x: MAPLE_LANE_START.x, z: MAPLE_LANE_START.z });
    assert.deepEqual(PADS[sim.from], { x: -90, z: 40 });

    sim.career = { ...sim.career, leg: 1 };
    sim.spawnNext();
    assert.equal(sim.load, "hotTub");
    assert.equal(sim.pieces[0]?.kind, "hotTub");
    assert.equal(sim.to, 7);
    assert.deepEqual(PADS[sim.to], { x: -99, z: 42 });
    assert.equal(sim.from, 9);
  });

  it("drives from Maple Lane into the marked driveway box before deploying", () => {
    const sim = new CraneSim();
    sim.career = {
      ...sim.career,
      status: "independent",
      crane: "yard",
      reputation: 3,
      job: "yard",
      leg: 0,
      roofActive: false,
    };
    sim.acceptJob("spa");
    assert.deepEqual({ x: sim.truckX, z: sim.truckZ }, { x: MAPLE_LANE_START.x, z: MAPLE_LANE_START.z });
    assert.equal(sim.atMapleSetup, false);

    sim.requestDeploy();
    assert.equal(sim.deployDir, 0);
    assert.match(sim.message, /Drive down Maple Lane/i);

    // Forward east along the street, turn north into the side drive, and stop
    // inside the amber parking box using the same held controls as the game.
    run(sim, 6.1, { trolley: 1 });
    run(sim, 3, { trolley: 1, steer: -1 });
    run(sim, 2.7, { trolley: 1 });
    run(sim, 2);
    assert.ok(Math.hypot(sim.truckX - MAPLE_LANE_SETUP.x, sim.truckZ - MAPLE_LANE_SETUP.z) <= MAPLE_LANE_SETUP.radius);
    assert.equal(sim.atMapleSetup, true);
    assert.ok(Math.abs(sim.speed) < 0.2);

    sim.requestDeploy();
    assert.equal(sim.deployDir, 1);
    run(sim, 1.8);
    assert.equal(sim.state, "lifting");
    assert.equal(sim.bCanLift, true);
  });

  it("stages the long turbine blade at the separate wind-farm ridge site", () => {
    const sim = new CraneSim();
    sim.career = {
      ...sim.career,
      status: "independent",
      crane: "heavy",
      reputation: 14,
      job: "yard",
      leg: 0,
      roofActive: false,
    };
    sim.acceptJob("wind");

    assert.equal(sim.career.job, "wind");
    assert.equal(sim.crane, "heavy");
    assert.equal(sim.load, "blade");
    assert.equal(sim.pieces[0]?.kind, "blade");
    assert.equal(sim.from, 10);
    assert.equal(sim.to, 11);
    assert.deepEqual(PADS[sim.from], { x: 87, z: 79 });
    assert.deepEqual(PADS[sim.to], { x: 97, z: 85 });
    assert.deepEqual({ x: sim.truckX, z: sim.truckZ }, { x: WIND_FARM_START.x, z: WIND_FARM_START.z });
  });

  it("keeps each of the first six call routes inside the easy-mode reach envelope", () => {
    const sim = new CraneSim();
    const easyReach = sim.mountBack + (sim.baseLen + sim.extendMax) * Math.cos((44 * Math.PI) / 180 + 0.08);
    const yardSource = PADS[8]!;
    for (const padIndex of [5, 0, 4, 1]) {
      const pad = PADS[padIndex]!;
      const span = Math.hypot(pad.x - yardSource.x, pad.z - yardSource.z);
      assert.ok(span <= easyReach * 2, `yard route to pad ${padIndex} spans ${span.toFixed(2)} m`);
    }
    const pipeRing = PADS[3]!;
    const pipeSpan = Math.hypot(pipeRing.x - yardSource.x, pipeRing.z - yardSource.z);
    assert.ok(pipeSpan > easyReach * 2, `pipe ring should be a drive, span ${pipeSpan.toFixed(2)} m`);
    const residentialSource = PADS[9]!;
    for (const padIndex of [6, 7]) {
      const pad = PADS[padIndex]!;
      const span = Math.hypot(pad.x - residentialSource.x, pad.z - residentialSource.z);
      assert.ok(span <= easyReach * 2, `Maple Lane route to pad ${padIndex} spans ${span.toFixed(2)} m`);
    }
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

describe("set ring tolerance", () => {
  it("reads the ring from the active job instead of a flat 2.4 m", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "yard" };
    assert.equal(sim.setTolerance, 2.4);

    sim.career = { ...sim.career, job: "spa" };
    assert.ok(sim.setTolerance < 1.4, `spa ring is ${sim.setTolerance} m`);

    sim.career = { ...sim.career, job: "roof" };
    assert.ok(sim.setTolerance < 1, `roof ring is ${sim.setTolerance} m`);
  });

  it("scores a two-pad girder set on both bearings, not its centre", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "girder", reputation: 20 };
    sim.stockYard(false);

    const first = PADS[JOBS.girder.pad]!;
    const second = PADS[JOBS.girder.pad2!]!;
    const axis = Math.atan2(second.x - first.x, second.z - first.z);
    sim.yaw = axis;
    sim.hx = (first.x + second.x) / 2;
    sim.hz = (first.z + second.z) / 2;

    assert.ok(sim.setSpot().meters < 0.01, `square set reads ${sim.setSpot().meters} m`);
    // End for end is still the same girder across the same two pads.
    sim.yaw = axis + Math.PI;
    assert.ok(sim.setSpot().meters < 0.01);
    // Lying square-on leaves both bearings unserved.
    sim.yaw = axis + Math.PI / 2;
    assert.ok(sim.setSpot().meters > 1.5, `square-on set reads ${sim.setSpot().meters} m`);

    sim.yaw = axis;
    sim.attached = true;
    sim.landed = true;
    assert.equal(sim.canRelease, true);
  });

  it("scores the culvert pipe on both saddles and its heading together", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "culvert", reputation: 24 };
    sim.stockYard(false);

    const first = PADS[JOBS.culvert.pad]!;
    const second = PADS[JOBS.culvert.pad2!]!;
    // The saddles are exactly the pipe's length apart, so a square set spans them.
    assert.ok(Math.abs(Math.hypot(second.x - first.x, second.z - first.z) - 2 * loadSpec("pipe").halfZ) < 0.01);

    const axis = Math.atan2(second.x - first.x, second.z - first.z);
    sim.yaw = axis;
    sim.hx = (first.x + second.x) / 2;
    sim.hz = (first.z + second.z) / 2;
    assert.ok(sim.setSpot().meters < 0.01, `spanning set reads ${sim.setSpot().meters} m`);
    assert.ok((sim.headingError() ?? 99) < 0.001);

    // Crosswise across the saddles: both ends miss and the heading is wrong.
    sim.yaw = axis + Math.PI / 2;
    assert.ok(sim.setSpot().meters > 1.5, `crosswise set reads ${sim.setSpot().meters} m`);
    assert.ok((sim.headingError() ?? 0) > 80);
  });

  it("squares the carrier heading only while the rig is being spotted", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "culvert", reputation: 24 };
    sim.stockYard(false);

    sim.heading = 0;
    assert.ok((sim.setupHeadingError() ?? 0) > 80, "the truck is across the pipe's line");
    sim.heading = Math.PI / 2;
    assert.ok((sim.setupHeadingError() ?? 99) < 0.001);
    // End for end still lines the carrier up with the same guide.
    sim.heading = Math.PI / 2 + Math.PI;
    assert.ok((sim.setupHeadingError() ?? 99) < 0.001);

    sim.state = "lifting";
    assert.equal(sim.setupHeadingError(), null, "the pads are down, so the heading is already locked in");
    sim.state = "driving";
    sim.hauling = true;
    assert.equal(sim.setupHeadingError(), null, "the crawler is on the lowboy, not spotting");
  });

  it("sets the curtain-wall panel on the high deck, square to the facade", () => {
    const sim = new CraneSim();
    // acceptJob sets roofActive from the job's roof flag on the way in.
    sim.career = { ...sim.career, status: "independent", job: "curtain", reputation: 24, roofActive: true };
    sim.stockYard(false);
    const beam = new CraneSim();
    beam.career = { ...beam.career, status: "independent", job: "roof", reputation: 24 };

    assert.equal(sim.roofActive, true);
    assert.equal(sim.roofDeck().y, beam.roofDeck().y);
    assert.equal(sim.headingTarget, 0);
    sim.yaw = 0;
    assert.ok((sim.headingError() ?? 99) < 0.001);
    sim.yaw = Math.PI / 2;
    assert.ok((sim.headingError() ?? 0) > 89);
  });

  it("gives a curtain-wall practice run the same roof deck as the career call", () => {
    const sim = new CraneSim();
    sim.practiceJob("curtain", "lattice");
    assert.equal(sim.roofActive, true);
    assert.ok(sim.roofDeck().y > 10, `practice deck is ${sim.roofDeck().y} m`);
  });

  it("reads the panel heading off the casting-bed guides", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "wall", reputation: 20 };
    sim.stockYard(false);
    assert.equal(sim.headingTarget, Math.PI / 2);

    sim.yaw = Math.PI / 2;
    assert.ok((sim.headingError() ?? 99) < 0.001);
    // End for end is the same wall on the same guides.
    sim.yaw = Math.PI / 2 + Math.PI;
    assert.ok((sim.headingError() ?? 99) < 0.001);
    sim.yaw = 0;
    assert.ok((sim.headingError() ?? 0) > 89);
  });
});

describe("work lights", () => {
  it("starts dark and toggles", () => {
    const sim = new CraneSim();
    assert.equal(sim.lightsOn, false);

    sim.setWorkLights(true);
    assert.equal(sim.lightsOn, true);

    sim.setWorkLights(false);
    assert.equal(sim.lightsOn, false);
  });

  it("only runs a day job at night when the setting asks for it", () => {
    const sim = new CraneSim();
    assert.equal(sim.night, false);
    sim.night = true;
    assert.equal(sim.night, true);
    // The lighting override does not change which job is on the hook.
    assert.equal(sim.career.job, "yard");
  });
});

describe("set grading", () => {
  /** Lands the load as the touchdown branch would, without playing the carry. */
  const land = (sim: CraneSim, off: number): void => {
    (sim as unknown as { succeed(off: number): void }).succeed(off);
  };

  it("grades a clean set, pays it, and leaves a debrief", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "yard", reputation: 5, cash: 0 };
    sim.peakSway = 0.5;
    sim.peakChart = 0.4;
    sim.hookSpeed = 0.1;

    land(sim, 0.2);

    assert.equal(sim.phase, "done");
    assert.ok(sim.lastSet, "a set should leave a report");
    assert.equal(sim.lastSet!.grade, "S");
    assert.ok(sim.lastSet!.pay > 0);
    assert.equal(sim.lastSet!.rep, 2);
    assert.ok(sim.debriefLeft > 0);
    assert.match(sim.message, /Graded S/);
  });

  it("pays a sloppy steel set less than a clean one", () => {
    const clean = new CraneSim();
    clean.career = { ...clean.career, status: "independent", job: "roof", reputation: 10, cash: 0 };
    clean.load = "beam";
    clean.peakSway = 0.5;
    clean.hookSpeed = 0.1;
    land(clean, 0.1);

    const sloppy = new CraneSim();
    sloppy.career = { ...clean.career };
    sloppy.load = "beam";
    sloppy.peakSway = 0.5;
    sloppy.hookSpeed = 0.1;
    land(sloppy, 1);

    assert.equal(clean.lastSet!.grade, "S");
    assert.equal(sloppy.lastSet!.grade, "C");
    assert.ok(sloppy.lastSet!.pay < clean.lastSet!.pay, `${sloppy.lastSet!.pay} vs ${clean.lastSet!.pay}`);
  });

  it("only grades the set that actually matched the call", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "roof", reputation: 10, cash: 0 };
    sim.load = "crate";
    land(sim, 0.1);

    assert.equal(sim.lastSet, null);
  });

  it("marks a panel down when it lands off square", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "wall", reputation: 20, cash: 0 };
    sim.stockYard(false);
    sim.load = "panel";
    sim.yaw = Math.PI / 2 + 0.35; // about 20° off the guides
    sim.peakSway = 0.5;
    sim.peakChart = 0.4;
    sim.hookSpeed = 0.1;

    land(sim, 0.1);

    assert.equal(sim.lastSet!.parts.heading, "C");
    assert.equal(sim.lastSet!.cost, "HEADING");
  });
});

describe("pipe haul", () => {
  it("keeps a rigged pipe upright and puts the ring out of boom reach", () => {
    const sim = new CraneSim();
    sim.practicing = true;
    sim.career = { ...sim.career, job: "pipe", jobsDone: 1 };
    sim.clockIn();
    assert.equal(sim.load, "pipe");
    const source = sim.pieces[0]!;
    const spot = sim.setSpot();
    assert.ok(Math.hypot(spot.x - source.x, spot.z - source.z) > 20, "the pipe ring has to be a drive");

    sim.outrigger = 1;
    sim.state = "lifting";
    hookUp(sim, 0);
    sim.outrigger = 1;
    sim.boomPitch = 0.9;
    sim.extension = 0;
    run(sim, 1.2, { hoist: 1 });
    assert.equal(sim.attached, true);
    assert.notEqual(sim.limitState, "over");
    assert.ok(Math.abs(sim.roll) < 0.05, `rigged pipe leaned ${sim.roll}`);
  });

  it("stows the pads while the pipe stays on the hook", () => {
    const sim = new CraneSim();
    sim.outrigger = 1;
    sim.state = "lifting";
    hookUp(sim, 0);
    sim.outrigger = 1;
    sim.state = "lifting";
    sim.requestDeploy();
    assert.equal(sim.attached, true);
    assert.equal(sim.deployDir, -1);
    run(sim, 2.2);
    assert.ok(sim.outrigger < 0.05, `pads still out at ${sim.outrigger}`);
    assert.equal(sim.attached, true);
    const piece = sim.pieces[sim.carry!]!;
    assert.ok(Math.hypot(piece.x - sim.truckX, piece.z - sim.truckZ) < 14, "the pipe should ride with the truck");
  });
});

describe("operator load chart", () => {
  it("reads radius from the slewing axis, not the yard origin", () => {
    const sim = new CraneSim();
    // Line the boom up with the z axis so a 10 m move is 10 m of radius.
    sim.yaw = 0;
    sim.heading = 0;
    const empty = sim.loadChart();
    assert.equal(empty.demand, 0);
    assert.equal(empty.ratio, 0);
    assert.ok(empty.capacity > 0);

    sim.hx = 0;
    sim.hz = 8;
    const near = sim.loadChart().radius;
    sim.hz = 18;
    const far = sim.loadChart().radius;
    assert.ok(far > near, `${far} should exceed ${near}`);
    assert.ok(Math.abs(far - near - 10) < 1e-9, "ten metres out is ten metres of radius");
  });

  it("loses capacity as the boom telescopes out", () => {
    const sim = new CraneSim();
    sim.boomPitch = 0.9;
    sim.extension = 0;
    const retracted = sim.loadChart();
    sim.extension = sim.extendMax;
    const extended = sim.loadChart();
    assert.ok(extended.capacity < retracted.capacity, `${extended.capacity} should be under ${retracted.capacity}`);
    assert.equal(retracted.extendMax, sim.extendMax);
  });
});

describe("house damage", () => {
  it("charges for an outrigger in the house and more when the boom is deeper", () => {
    const graze = new CraneSim();
    graze.career = { ...graze.career, status: "independent", job: "spa", cash: 5000, reputation: 4, crane: "yard" };
    graze.truckX = -93.2;
    graze.truckZ = 30;
    graze.heading = Math.PI;
    graze.yaw = Math.PI;
    graze.outrigger = 1;
    graze.state = "driving";
    graze.boomPitch = 0.05;
    graze.extension = 0;
    run(graze, 0.1);
    const grazeBill = 5000 - graze.cash;
    assert.ok(grazeBill > 0, "a pad in the wall should cost money");
    assert.match(graze.message, /house/i);

    const through = new CraneSim();
    through.career = { ...through.career, status: "independent", job: "spa", cash: 5000, reputation: 4, crane: "yard" };
    through.truckX = -90;
    through.truckZ = 30;
    through.heading = Math.PI / 2;
    through.yaw = Math.PI / 2;
    through.outrigger = 0;
    through.state = "lifting";
    through.boomPitch = 0.35;
    through.extension = through.extendMax;
    run(through, 0.1);
    const throughBill = 5000 - through.cash;
    assert.ok(throughBill > grazeBill, `boom bill ${throughBill} should exceed pad bill ${grazeBill}`);
    assert.match(through.message, /Boom through the house/);
  });
});

describe("test any job", () => {
  it("loads the chosen job and crane, then puts the career back", () => {
    const sim = new CraneSim();
    const savedJob = sim.career.job;
    const savedCrane = sim.career.crane;
    sim.practiceJob("roof", "lattice");
    assert.equal(sim.career.job, "roof");
    assert.equal(sim.crane, "lattice");
    assert.equal(sim.roofActive, true);
    assert.equal(sim.load, "beam");
    assert.match(sim.message, /Nothing is saved/);
    sim.practiceJob("spa", "heavy");
    assert.equal(sim.career.job, "spa");
    assert.equal(sim.crane, "heavy");
    assert.equal(sim.load, "deck");
    sim.clockIn();
    assert.equal(sim.practicing, false);
    assert.equal(sim.career.job, savedJob);
    assert.equal(sim.career.crane, savedCrane);
    assert.equal(sim.crane, savedCrane);
  });
});

describe("release readiness", () => {
  it("arms RELEASE only when the load is down inside the ring", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "yard" };
    hookUp(sim, 0);
    run(sim, 1.2, { hoist: 1 });

    assert.equal(sim.attached, true);
    assert.equal(sim.landed, false);
    assert.equal(sim.canRelease, false, "a load in the air is not releasable");

    sim.landed = true;
    sim.hx = PADS[sim.to]!.x;
    sim.hz = PADS[sim.to]!.z;
    assert.equal(sim.canRelease, true);

    sim.hx += sim.setTolerance + 1;
    assert.equal(sim.canRelease, false, "a load outside the ring is not releasable");
  });
});

describe("debrief hold", () => {
  const land = (sim: CraneSim, off: number): void => {
    (sim as unknown as { succeed(off: number): void }).succeed(off);
  };

  it("keeps the debrief up until the player dismisses it", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "yard", reputation: 5, cash: 0 };
    sim.peakSway = 0.4;
    sim.hookSpeed = 0.1;
    land(sim, 0.2);

    assert.ok(sim.lastSet);
    assert.equal(sim.debriefHold, true);
    const shown = sim.debriefLeft;
    run(sim, 3);
    assert.equal(sim.debriefLeft, shown, "a held debrief should not time out");

    sim.dismissDebrief();
    assert.equal(sim.debriefLeft, 0);
    assert.equal(sim.debriefHold, false);
  });

  it("names the metric that cost the grade and coaches it", () => {
    const sim = new CraneSim();
    sim.career = { ...sim.career, status: "independent", job: "roof", reputation: 10, cash: 0 };
    sim.load = "beam";
    sim.peakSway = 0.4;
    sim.hookSpeed = 0.1;
    land(sim, sim.setTolerance * 0.9);

    assert.ok(sim.lastSet);
    assert.equal(sim.lastSet!.parts.off, "C");
    assert.equal(sim.lastSet!.cost, "RING");
    assert.match(sim.lastSet!.tip, /mark|lower/i);
  });
});

describe("wind forecast", () => {
  it("lists the next two gusts while lifting in hard mode only", () => {
    const sim = new CraneSim(seeded(5));
    sim.mode = "hard";
    hangOver(sim, 0);

    const forecast = sim.windForecast();
    assert.equal(forecast.length, 2);
    assert.ok(forecast[0]!.seconds <= 4);
    assert.ok(forecast[1]!.seconds > forecast[0]!.seconds);

    sim.mode = "easy";
    assert.deepEqual(sim.windForecast(), []);
  });

  it("repeats the forecast exactly for the same seed", () => {
    const first = new CraneSim(seeded(11));
    first.mode = "hard";
    hangOver(first, 0);
    const second = new CraneSim(seeded(11));
    second.mode = "hard";
    hangOver(second, 0);

    assert.deepEqual(first.windForecast(), second.windForecast());
    run(first, 5, { steer: 0.4 });
    run(second, 5, { steer: 0.4 });
    assert.deepEqual(first.windForecast(), second.windForecast());
  });
});

describe("daily shift", () => {
  it("loads the seeded call and restores the career afterwards", () => {
    const sim = new CraneSim();
    const before = { ...sim.career };
    const runInfo = dailyRun(new Date("2026-11-17T10:00:00Z"));

    sim.practiceDaily(runInfo);
    assert.equal(sim.practicing, true);
    assert.equal(sim.daily?.day, runInfo.day);
    assert.equal(sim.career.job, runInfo.job);
    assert.equal(sim.crane, runInfo.crane);

    sim.clockIn();
    assert.equal(sim.practicing, false);
    assert.equal(sim.daily, null);
    assert.deepEqual(sim.career, before);
  });
});
