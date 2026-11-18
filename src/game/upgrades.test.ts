import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_UPGRADE,
  UPGRADES,
  buyUpgrade,
  freshUpgrades,
  readUpgrades,
  serviceCost,
  serviceCrane,
  upgradeCost,
  upgradeEffects,
  wearAfterSet,
  wearLabel,
  wearPenalty,
} from "./upgrades.ts";

describe("upgrade shop", () => {
  it("starts every part at level zero", () => {
    const state = freshUpgrades();
    for (const id of Object.keys(state) as (keyof typeof state)[]) assert.equal(state[id], 0);
    assert.equal(upgradeCost("winch", state), UPGRADES.winch.costs[0]);
  });

  it("buys one level and takes the cash", () => {
    const purchase = buyUpgrade(1000, freshUpgrades(), "winch");
    assert.equal(purchase.ok, true);
    assert.equal(purchase.cash, 100);
    assert.equal(purchase.upgrades.winch, 1);
    assert.match(purchase.message, /WINCH levelled to 1/);
  });

  it("refuses a part the player cannot afford", () => {
    const purchase = buyUpgrade(50, freshUpgrades(), "winch");
    assert.equal(purchase.ok, false);
    assert.equal(purchase.cash, 50);
    assert.equal(purchase.upgrades.winch, 0);
    assert.match(purchase.message, /Need/);
  });

  it("tops out and refuses another level", () => {
    const maxed = { ...freshUpgrades(), slew: MAX_UPGRADE };
    assert.equal(upgradeCost("slew", maxed), null);
    const purchase = buyUpgrade(99999, maxed, "slew");
    assert.equal(purchase.ok, false);
    assert.match(purchase.message, /top level/);
  });

  it("keeps effects monotonic and legible", () => {
    const base = upgradeEffects(freshUpgrades());
    assert.deepEqual(base, { slew: 1, hoist: 1, damp: 1, capacity: 1, stability: 1 });
    const built = upgradeEffects({ winch: 2, slew: 3, damping: 1, outrigger: 2, counterweight: 1 });
    assert.ok(built.hoist > base.hoist);
    assert.ok(built.slew > base.slew);
    assert.ok(built.damp > base.damp);
    assert.ok(built.capacity > base.capacity);
    assert.ok(built.stability > base.stability);
  });

  it("reads only known levels from a save", () => {
    const read = readUpgrades({ winch: 9, slew: -2, damping: "2", outrigger: 1.9, rubbish: 4 });
    assert.equal(read.winch, MAX_UPGRADE);
    assert.equal(read.slew, 0);
    assert.equal(read.damping, 2);
    assert.equal(read.outrigger, 1);
    assert.equal(read.counterweight, 0);
  });
});

describe("crane wear", () => {
  it("adds less wear for a clean set than a sloppy one", () => {
    const clean = wearAfterSet(0, "S", 0.2, 5);
    const sloppy = wearAfterSet(0, "C", 4.5, 5);
    assert.ok(clean < sloppy);
    assert.ok(clean > 0);
  });

  it("never goes past a hundred", () => {
    assert.equal(wearAfterSet(99, "C", 9, 1), 100);
  });

  it("costs at most fifteen percent of the chart", () => {
    assert.equal(wearPenalty(0), 0);
    assert.ok(Math.abs(wearPenalty(100) - 0.15) < 1e-9);
    assert.ok(wearPenalty(50) < wearPenalty(90));
  });

  it("labels the wear band", () => {
    assert.equal(wearLabel(0), "TIGHT");
    assert.equal(wearLabel(30), "USED");
    assert.equal(wearLabel(60), "WORN");
    assert.equal(wearLabel(90), "SHOP");
  });

  it("services a worn crane and refuses a tight one", () => {
    assert.equal(serviceCost(0), 0);
    assert.ok(serviceCost(80) > serviceCost(20));
    const serviced = serviceCrane(2000, 60);
    assert.equal(serviced.ok, true);
    assert.equal(serviced.wear, 0);
    assert.ok(serviced.cash < 2000);
    const tight = serviceCrane(2000, 0);
    assert.equal(tight.ok, false);
  });

  it("refuses a service the player cannot pay for", () => {
    const result = serviceCrane(10, 90);
    assert.equal(result.ok, false);
    assert.equal(result.wear, 90);
  });
});
