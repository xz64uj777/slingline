import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ECONOMY,
  UPKEEP,
  activeOffer,
  assignedJob,
  buyCrane,
  canFound,
  companyName,
  contractLabel,
  downPayment,
  employerLine,
  financedAmount,
  foundCompany,
  freshCareer,
  isUnlocked,
  loadCareer,
  readCareer,
  resolveFailure,
  resolveSet,
  writeCareer,
  type CareerState,
} from "./career.ts";

function owner(partial: Partial<CareerState> = {}): CareerState {
  return {
    ...freshCareer(),
    status: "independent",
    reputation: 1,
    standing: 100,
    jobsDone: 0,
    failures: 0,
    cash: 0,
    ...partial,
  };
}

function memory() {
  const mem = new Map<string, string>();
  return {
    mem,
    storage: {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
    },
  };
}

describe("career start", () => {
  it("starts hired on Hargrove's rental with no cash", () => {
    const state = freshCareer();
    assert.equal(state.status, "hired");
    assert.equal(state.crane, "rental");
    assert.equal(state.cash, 0);
    assert.equal(state.reputation, 0);
    assert.equal(state.standing, ECONOMY.startStanding);
    assert.equal(state.job, "yard");
    assert.equal(state.roofActive, false);
    assert.equal(companyName(state), "Temp Hire");
    assert.match(employerLine(state), /Hargrove/);
    assert.match(employerLine(state), /wage/i);
  });

  it("does not treat a blank or broken save as a company", () => {
    assert.deepEqual(loadCareer(null), freshCareer());
    assert.deepEqual(loadCareer("nope"), freshCareer());
    const junk = loadCareer({ cash: -20, crane: "balloon" });
    assert.equal(junk.status, "hired");
    assert.equal(junk.cash, 0);
    assert.equal(junk.crane, "rental");
  });
});

describe("wage versus contract", () => {
  it("pays a wage that is a clear share of the contract", () => {
    const offer = activeOffer(freshCareer());
    assert.equal(offer.wage, true);
    assert.equal(offer.title, "YARD MOVE");
    assert.equal(offer.gross, 900);
    assert.equal(offer.take, Math.round(offer.gross * ECONOMY.wageShare));
    assert.ok(offer.take < offer.gross / 2);
    assert.ok(offer.take > 0);
    const label = contractLabel(freshCareer());
    assert.match(label, /WAGE/);
    assert.match(label, /OF/);
    assert.match(label, /\$315/);
    assert.match(label, /\$900/);
  });

  it("keeps the full contract after the company is filed", () => {
    const state = owner();
    const offer = activeOffer(state);
    assert.equal(offer.wage, false);
    assert.equal(offer.take, offer.gross);
    const label = contractLabel(state);
    assert.match(label, /CONTRACT/);
    assert.doesNotMatch(label, /WAGE/);
  });

  it("banks the wage, not the contract, and does not raise reputation while hired", () => {
    const result = resolveSet(freshCareer(), "crate");
    assert.equal(result.matched, true);
    assert.equal(result.banked, 315);
    assert.equal(result.state.cash, 315);
    assert.equal(result.state.reputation, 0);
    assert.equal(result.state.status, "hired");
    assert.match(result.message, /wage/i);
    assert.match(result.message, /\$900/);
  });

  it("cuts the wage on downtime and still pays something", () => {
    const state = { ...freshCareer(), downtime: 1, cash: 0, standing: 20 };
    const offer = activeOffer(state);
    assert.equal(offer.short, true);
    assert.ok(offer.take < Math.round(offer.gross * ECONOMY.wageShare));
    assert.ok(offer.take > 0);
    const paid = resolveSet(state, "crate");
    assert.equal(paid.banked, offer.take);
    assert.equal(paid.state.downtime, 0);
  });
});

describe("going independent", () => {
  it("refuses the filing until wages, jobs, and standing are all there", () => {
    assert.equal(canFound(freshCareer()).ok, false);
    const one = resolveSet(freshCareer(), "crate").state;
    assert.equal(canFound(one).ok, false);
    assert.ok(one.cash < ECONOMY.foundCash);
    const early = foundCompany(one);
    assert.equal(early.ok, false);
    assert.equal(early.state.status, "hired");
    assert.equal(early.state.cash, one.cash);

    const rich = {
      ...freshCareer(),
      cash: ECONOMY.foundCash,
      jobsDone: ECONOMY.foundJobs,
      standing: ECONOMY.foundStanding - 1,
    };
    assert.equal(canFound(rich).ok, false);
    assert.match(canFound(rich).reason, /standing/i);
    assert.equal(canFound({ ...rich, standing: ECONOMY.foundStanding, downtime: 1 }).ok, false);
    assert.match(canFound({ ...rich, standing: ECONOMY.foundStanding, downtime: 1 }).reason, /downtime/i);
  });

  it("files Slingline as a paid beat and then keeps the contract", () => {
    let state = freshCareer();
    let steps = 0;
    while (!canFound(state).ok && steps < 40) {
      state = resolveSet(state, activeOffer(state).kind).state;
      steps += 1;
    }
    assert.ok(steps >= ECONOMY.foundJobs);
    assert.ok(state.cash >= ECONOMY.foundCash);
    const filed = foundCompany(state);
    assert.equal(filed.ok, true);
    assert.equal(filed.state.status, "independent");
    assert.equal(filed.state.cash, state.cash - ECONOMY.foundFee);
    assert.ok(filed.state.cash >= 0);
    assert.match(filed.message, /Slingline/);
    assert.match(filed.message, /contract/i);
    assert.equal(companyName(filed.state), "Independent");
    assert.equal(foundCompany(filed.state).ok, false);
    const offer = activeOffer(filed.state);
    assert.equal(offer.wage, false);
    assert.equal(offer.take, offer.gross);
    assert.ok(filed.state.reputation >= 1);
  });
});

describe("save and reload", () => {
  it("round-trips a hired record and a company record", () => {
    const hiredSave = memory();
    let hired = resolveSet(freshCareer(), "crate").state;
    hired = resolveSet(hired, activeOffer(hired).kind).state;
    writeCareer(hired, hiredSave.storage);
    assert.deepEqual(readCareer(hiredSave.storage), hired);
    const raw = JSON.parse(hiredSave.mem.get("slingline-career") ?? "{}") as { v?: number; status?: string };
    assert.equal(raw.v, 2);
    assert.equal(raw.status, "hired");

    const company = owner({
      crane: "crawler",
      crawlerOnSite: true,
      cash: 80,
      note: 15,
      reputation: 4,
      job: "yard",
      failures: 2,
    });
    const companySave = memory();
    writeCareer(company, companySave.storage);
    assert.deepEqual(readCareer(companySave.storage), company);
  });

  it("migrates an old slingline-career save without wiping cash or the crane", () => {
    const newbie = loadCareer({ cash: 0, crane: "rental", reputation: 0, roofDone: false, roofActive: true });
    assert.equal(newbie.status, "hired");
    assert.equal(newbie.job, "yard");
    assert.equal(newbie.roofActive, false);

    const pocket = loadCareer({ cash: 250, crane: "rental", reputation: 1, roofDone: false, roofActive: false });
    assert.equal(pocket.status, "hired");
    assert.equal(pocket.cash, 250);
    assert.equal(pocket.crane, "rental");

    const bought = loadCareer({ cash: 400, crane: "heavy", reputation: 4, roofDone: true, roofActive: false });
    assert.equal(bought.status, "independent");
    assert.equal(bought.crane, "heavy");
    assert.equal(bought.cash, 400);
    assert.equal(bought.reputation, 4);
    assert.equal(companyName(bought), "Independent");

    const roofing = loadCareer({ cash: 100, crane: "yard", reputation: 2, roofDone: false, roofActive: true });
    assert.equal(roofing.status, "independent");
    assert.equal(roofing.job, "roof");
    assert.equal(roofing.roofActive, true);
    assert.equal(roofing.cash, 100);
  });
});

describe("job unlocks", () => {
  it("keeps Hargrove on yard moves until the record is solid, then a basic set", () => {
    assert.equal(assignedJob(freshCareer()), "yard");
    assert.equal(isUnlocked(freshCareer(), "steel").ok, false);
    assert.match(isUnlocked(freshCareer(), "steel").reason, /Hargrove|Slingline/);
    const ready = { ...freshCareer(), jobsDone: ECONOMY.hiredVarietyJobs, standing: ECONOMY.hiredVarietyStanding };
    assert.equal(assignedJob(ready), "pad");
    const low = { ...ready, standing: ECONOMY.hiredVarietyStanding - 1 };
    assert.equal(assignedJob(low), "yard");
    assert.match(isUnlocked(low, "pad").reason, /Standing/);
  });

  it("opens calls from reputation and the crane you own, and closes them again", () => {
    const freshOwner = owner();
    assert.equal(isUnlocked(freshOwner, "yard").ok, true);
    assert.equal(isUnlocked(freshOwner, "pad").ok, true);
    assert.equal(isUnlocked(freshOwner, "steel").ok, false);
    assert.match(isUnlocked(freshOwner, "steel").reason, /reputation 3/);

    const ranked = owner({ reputation: 3, crane: "rental" });
    assert.equal(isUnlocked(ranked, "steel").ok, false);
    assert.match(isUnlocked(ranked, "steel").reason, /yard crane/);
    assert.equal(isUnlocked(owner({ reputation: 3, crane: "yard" }), "steel").ok, true);

    const slipped = owner({ reputation: 2, crane: "yard", job: "steel" });
    assert.equal(isUnlocked(slipped, "steel").ok, false);

    assert.equal(isUnlocked(owner({ reputation: 9, crane: "rental" }), "roof").ok, false);
    assert.equal(isUnlocked(owner({ reputation: 8, crane: "yard" }), "roof").ok, false);
    assert.equal(isUnlocked(owner({ reputation: 9, crane: "yard" }), "roof").ok, true);
    assert.equal(isUnlocked(owner({ reputation: 6, crane: "yard" }), "floor").ok, true);
    assert.equal(isUnlocked(owner({ reputation: 12, crane: "tower" }), "tracks").ok, false);
    const waiting = isUnlocked(owner({ reputation: 12, crane: "crawler", crawlerOnSite: false }), "tracks");
    assert.equal(waiting.ok, false);
    assert.match(waiting.reason, /lowboy/);
    assert.equal(isUnlocked(owner({ reputation: 12, crane: "crawler", crawlerOnSite: true }), "tracks").ok, true);
    assert.equal(isUnlocked(owner({ reputation: 7, crane: "yard" }), "heavy").ok, false);
    assert.equal(isUnlocked(owner({ reputation: 7, crane: "heavy" }), "heavy").ok, true);
  });

  it("shrinks a yard move when callers are wary and restores it with reputation", () => {
    const wary = owner({ reputation: 0, failures: 2, job: "yard" });
    const offer = activeOffer(wary);
    assert.equal(offer.wary, true);
    assert.equal(offer.gross, Math.round(900 * ECONOMY.waryShare));
    assert.match(contractLabel(wary), /WARY/);
    const restored = owner({ reputation: 1, failures: 2, job: "yard" });
    assert.equal(activeOffer(restored).gross, 900);
  });
});

describe("purchase and upgrade", () => {
  it("will not sell a crane to a temp, and finances the one you buy", () => {
    const hired = buyCrane({ ...freshCareer(), cash: 100000 });
    assert.equal(hired.ok, false);
    assert.equal(hired.state.crane, "rental");
    assert.match(hired.message, /Hargrove|Slingline/);

    const poor = buyCrane(owner({ cash: downPayment("yard") - 1 }));
    assert.equal(poor.ok, false);
    assert.equal(poor.state.cash, downPayment("yard") - 1);

    const bought = buyCrane(owner({ cash: downPayment("yard") }));
    assert.equal(bought.ok, true);
    assert.equal(bought.state.crane, "yard");
    assert.equal(bought.state.cash, 0);
    assert.equal(bought.state.note, financedAmount("yard"));
    assert.equal(bought.haul, false);
    assert.ok(downPayment("yard") > 315 * 4);

    const tracks = buyCrane(owner({ crane: "tower", cash: downPayment("crawler") + 50 }));
    assert.equal(tracks.ok, true);
    assert.equal(tracks.haul, true);
    assert.equal(tracks.state.crane, "crawler");
    assert.equal(tracks.state.crawlerOnSite, false);
    assert.equal(tracks.state.cash, 50);
    assert.equal(companyName(tracks.state), "Slingline Tracks");
    assert.match(tracks.message, /lowboy/);
  });

  it("names the company from the crane you own", () => {
    assert.equal(companyName(owner({ crane: "yard" })), "Independent");
    assert.equal(companyName(owner({ crane: "heavy" })), "Independent");
    assert.equal(companyName(owner({ crane: "lattice" })), "Slingline Co");
    assert.equal(companyName(owner({ crane: "tower" })), "Slingline Tower");
    assert.equal(companyName(owner({ crane: "crawler", crawlerOnSite: true })), "Slingline Tracks");
  });
});

describe("failure penalties", () => {
  it("docks a hired hand and can put them on downtime", () => {
    const dropped = resolveFailure({ ...freshCareer(), cash: 400, standing: 70 }, "drop");
    assert.ok(dropped.state.standing < 70);
    assert.ok(dropped.state.cash < 400);
    assert.equal(dropped.state.cash, 400 - Math.round(315 * 0.5));
    assert.match(dropped.message, /docked/i);
    assert.equal(isUnlocked(dropped.state, "yard").ok, true);

    const tipped = resolveFailure({ ...freshCareer(), cash: 400, standing: 70 }, "tip");
    assert.equal(tipped.state.downtime, 1);
    assert.ok(tipped.state.standing <= 70 - ECONOMY.standingTip);
    assert.equal(tipped.state.cash, 400 - 315);
    assert.match(tipped.message, /yard move/i);
    assert.equal(assignedJob(tipped.state), "yard");
  });

  it("bills the shop once you own the crane and pulls locked work off the board", () => {
    const state = owner({ reputation: 3, crane: "yard", job: "steel", cash: 1000 });
    const tipped = resolveFailure(state, "tip");
    assert.ok(tipped.state.cash < 1000);
    assert.equal(tipped.state.downtime, 1);
    assert.equal(isUnlocked(tipped.state, "steel").ok, false);
    assert.equal(tipped.state.job, "yard");
    assert.match(tipped.message, /yard move|shop/i);
    const back = resolveSet(tipped.state, "crate");
    assert.ok(back.banked > 0);
    assert.equal(back.state.downtime, 0);
  });

  it("pays nothing for the wrong load", () => {
    const hired = resolveSet(freshCareer(), "beam");
    assert.equal(hired.matched, false);
    assert.equal(hired.banked, 0);
    assert.equal(hired.state.cash, 0);
    assert.equal(hired.state.jobsDone, 0);
    assert.ok(hired.state.standing < ECONOMY.startStanding);
    assert.match(hired.message, /No pay/);

    const company = resolveSet(owner({ reputation: 3, crane: "yard", job: "steel", cash: 50 }), "crate");
    assert.equal(company.banked, 0);
    assert.equal(company.state.cash, 50);
    assert.equal(company.state.job, "yard");
  });
});

describe("no softlock", () => {
  it("still pays a yard move after a broke, wary, note-heavy streak", () => {
    let state = owner({
      cash: 0,
      reputation: 0,
      failures: 4,
      downtime: 3,
      note: 999999,
      crane: "crawler",
      crawlerOnSite: true,
      job: "yard",
    });
    assert.equal(isUnlocked(state, "yard").ok, true);
    assert.equal(isUnlocked(state, "tracks").ok, false);
    assert.equal(isUnlocked(state, "steel").ok, false);
    let cash = 0;
    for (let i = 0; i < 4; i += 1) {
      const result = resolveSet(state, "crate");
      assert.equal(result.matched, true);
      assert.ok(result.banked > 0);
      assert.ok(result.state.cash > cash);
      cash = result.state.cash;
      state = result.state;
    }
    assert.equal(state.downtime, 0);
    assert.ok(state.reputation > 0);
    assert.ok(state.cash > UPKEEP.crawler);
  });

  it("lets a docked hire climb back onto the yard list", () => {
    let state = { ...freshCareer(), cash: 0, standing: 0 };
    for (let i = 0; i < 8; i += 1) state = resolveFailure(state, "tip").state;
    assert.equal(state.downtime, ECONOMY.downtimeCap);
    assert.equal(state.cash, 0);
    assert.equal(assignedJob(state), "yard");
    const offer = activeOffer(state);
    assert.equal(offer.short, true);
    const paid = resolveSet(state, "crate");
    assert.ok(paid.banked > 0);
    assert.ok(paid.state.standing > 0);
    assert.equal(paid.state.downtime, ECONOMY.downtimeCap - 1);
    assert.equal(isUnlocked(paid.state, "yard").ok, true);
  });
});

describe("operating costs", () => {
  it("takes fuel and a note payment without eating the whole contract", () => {
    const state = owner({ note: 5000, cash: 0, job: "yard" });
    const result = resolveSet(state, "crate");
    const notePaid = Math.min(5000, Math.round(900 * ECONOMY.noteSlice), Math.round(900 * ECONOMY.noteCap));
    assert.equal(result.banked, 900 - UPKEEP.rental - notePaid);
    assert.ok(result.banked > 0);
    assert.equal(result.state.note, 5000 - notePaid);
    assert.match(result.message, /Fuel/);
    assert.match(result.message, /Note/);
  });

  it("runs DOUBLE RUN as two crate sets followed by two beam sets", () => {
    const state = owner({ reputation: 8, crane: "heavy", job: "double", cash: 0 });
    const firstCrate = resolveSet(state, "crate");
    assert.equal(firstCrate.state.leg, 1);
    assert.match(activeOffer(firstCrate.state).title, /CRATE 2 OF 2/);

    const secondCrate = resolveSet(firstCrate.state, "crate");
    assert.equal(secondCrate.state.leg, 2);
    assert.match(activeOffer(secondCrate.state).title, /STEEL BEAM 1 OF 2/);

    const firstBeam = resolveSet(secondCrate.state, "beam");
    assert.equal(firstBeam.state.leg, 3);
    assert.match(activeOffer(firstBeam.state).title, /STEEL BEAM 2 OF 2/);

    const secondBeam = resolveSet(firstBeam.state, "beam");
    assert.equal(secondBeam.matched, true);
    assert.equal(secondBeam.state.leg, 0);
    assert.equal(secondBeam.state.job, "yard");
    assert.ok(secondBeam.banked > firstCrate.banked);
    assert.match(secondBeam.message, /All four sets delivered/);
  });
});
