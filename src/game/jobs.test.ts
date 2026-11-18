import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_JOBS, COMPANY_JOBS, JOBS, RENTAL_LEVELS, validateJobs, type JobId } from "./jobs.ts";

describe("job table", () => {
  it("has no structural problems", () => {
    assert.deepEqual(validateJobs(), []);
  });

  it("lists every call exactly once", () => {
    assert.equal(new Set(ALL_JOBS).size, ALL_JOBS.length);
    assert.equal(ALL_JOBS.length, Object.keys(JOBS).length);
    for (const id of ALL_JOBS) assert.ok(JOBS[id], `missing ${id}`);
  });

  it("keeps the hired shift and the company board disjoint", () => {
    assert.equal(RENTAL_LEVELS.length, 5);
    assert.equal(COMPANY_JOBS.length, 12);
    assert.ok(COMPANY_JOBS.includes("yard"));
    for (const id of RENTAL_LEVELS) assert.ok(!COMPANY_JOBS.includes(id) || id === "yard");
  });

  it("catches a follow-up that points off the table", () => {
    const broken = { ...JOBS, rotor: { ...JOBS.rotor, after: "missing" as JobId } };
    const problems = validateJobs(broken);
    assert.ok(problems.some((line) => line.includes("unknown job missing")));
  });

  it("catches a pad outside the yard", () => {
    const broken = { ...JOBS, yard: { ...JOBS.yard, pad: 99 } };
    assert.ok(validateJobs(broken).some((line) => line.includes("outside the yard")));
  });

  it("marks both bearings of a two-pad call, and keeps them apart", () => {
    assert.notEqual(JOBS.girder.pad2, undefined);
    assert.notEqual(JOBS.girder.pad2, JOBS.girder.pad);
    assert.deepEqual(validateJobs(), []);

    const same = { ...JOBS, girder: { ...JOBS.girder, pad2: JOBS.girder.pad } };
    assert.ok(validateJobs(same).some((line) => line.includes("second pad is the first pad")));

    const offYard = { ...JOBS, girder: { ...JOBS.girder, pad2: 99 } };
    assert.ok(validateJobs(offYard).some((line) => line.includes("second pad is outside")));
  });

  it("specifies the second-contract calls that combine both rules", () => {
    // The culvert spans two saddles and has to be square to them.
    assert.notEqual(JOBS.culvert.pad2, undefined);
    assert.equal(JOBS.culvert.heading, Math.PI / 2);
    assert.ok((JOBS.culvert.headingTol ?? 0) > 0);
    assert.equal(JOBS.culvert.after, "girder");
    assert.equal(JOBS.culvert.kind, "pipe");

    // The curtain wall is a square set on the tower roof, behind the wall.
    assert.equal(JOBS.curtain.roof, true);
    assert.equal(JOBS.curtain.heading, 0);
    assert.ok((JOBS.curtain.headingTol ?? 0) > 0);
    assert.equal(JOBS.curtain.after, "wall");
    assert.equal(JOBS.curtain.theme, "tower");
    assert.deepEqual(validateJobs(), []);
  });

  it("gives every heading target a tolerance", () => {
    assert.ok(JOBS.wall.heading !== undefined);
    assert.ok((JOBS.wall.headingTol ?? 0) > 0);

    const broken = { ...JOBS, wall: { ...JOBS.wall, headingTol: 0 } };
    assert.ok(validateJobs(broken).some((line) => line.includes("heading needs a positive tolerance")));
  });
});
