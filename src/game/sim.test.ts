import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Actions } from "./input.ts";
import { CraneSim, PADS } from "./sim.ts";

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
    sim.career = { ...sim.career, status: "independent", job: "heavy" };
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
    assert.ok(left.heading < initialLeftHeading, `left steering changed heading to ${left.heading}`);

    const right = new CraneSim();
    const initialRightHeading = right.heading;
    run(right, 0.8, { trolley: 1, steer: -1 });
    assert.ok(right.heading > initialRightHeading, `right steering changed heading to ${right.heading}`);
  });

  it("keeps the lowboy tractor moving toward its drop pad", () => {
    const sim = new CraneSim();
    sim.hauling = true;
    sim.truckZ = 36;
    run(sim, 1, { trolley: 1 });
    assert.ok(sim.truckZ < 35.5, `lowboy delivery travel was ${sim.truckZ}`);
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

    sim.career = { ...sim.career, job: "steel" };
    assert.ok(sim.setTolerance < 1.4, `steel ring is ${sim.setTolerance} m`);

    sim.career = { ...sim.career, job: "roof" };
    assert.ok(sim.setTolerance < 1, `roof ring is ${sim.setTolerance} m`);
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
    clean.career = { ...clean.career, status: "independent", job: "steel", reputation: 10, cash: 0 };
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
    sim.career = { ...sim.career, status: "independent", job: "steel", reputation: 10, cash: 0 };
    sim.load = "crate";
    land(sim, 0.1);

    assert.equal(sim.lastSet, null);
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
