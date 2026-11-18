import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS, loadSettings } from "./settings.ts";
import { DEFAULT_BINDS } from "./input.ts";

describe("lighting setting", () => {
  it("runs jobs in daylight unless night is asked for", () => {
    assert.equal(DEFAULT_SETTINGS.night, false);
    assert.equal(loadSettings(null).night, false);
    assert.equal(loadSettings({}).night, false);
  });

  it("reads a stored night preference", () => {
    assert.equal(loadSettings({ night: true }).night, true);
    assert.equal(loadSettings({ night: "true" }).night, false);
    assert.equal(loadSettings({ night: 1 }).night, false);
  });

  it("keeps the other settings when an old save has no lighting field", () => {
    const loaded = loadSettings({ mode: "hard", pace: "fast", volume: 0.4 });
    assert.equal(loaded.mode, "hard");
    assert.equal(loaded.pace, "fast");
    assert.equal(loaded.volume, 0.4);
    assert.equal(loaded.night, false);
  });
});

describe("display and access settings", () => {
  it("defaults to adaptive quality with full motion and the amber ring", () => {
    const loaded = loadSettings(null);
    assert.equal(loaded.quality, "auto");
    assert.equal(loaded.contrast, false);
    assert.equal(loaded.reduceMotion, false);
    assert.deepEqual(loaded.binds, DEFAULT_BINDS);
  });

  it("accepts the known quality tiers and rejects anything else", () => {
    assert.equal(loadSettings({ quality: "high" }).quality, "high");
    assert.equal(loadSettings({ quality: "low" }).quality, "low");
    assert.equal(loadSettings({ quality: "ultra" }).quality, "auto");
  });

  it("reads contrast and reduced motion as strict booleans", () => {
    assert.equal(loadSettings({ contrast: true }).contrast, true);
    assert.equal(loadSettings({ contrast: "yes" }).contrast, false);
    assert.equal(loadSettings({ reduceMotion: true }).reduceMotion, true);
    assert.equal(loadSettings({ reduceMotion: 1 }).reduceMotion, false);
  });
});

describe("key bindings", () => {
  it("keeps defaults when a save has no bindings", () => {
    assert.deepEqual(loadSettings({}).binds, DEFAULT_BINDS);
  });

  it("merges a partial record over the defaults", () => {
    const loaded = loadSettings({ binds: { hoistUp: ["KeyT"], hook: ["KeyG"] } });
    assert.deepEqual(loaded.binds.hoistUp, ["KeyT"]);
    assert.deepEqual(loaded.binds.hook, ["KeyG"]);
    assert.deepEqual(loaded.binds.slewLeft, DEFAULT_BINDS.slewLeft);
  });

  it("drops impossible key codes and empty lists", () => {
    const loaded = loadSettings({
      binds: { hoistDown: ["", "not a key", 42], deploy: [], slewRight: ["KeyL", "KeyL"] },
    });
    assert.deepEqual(loaded.binds.hoistDown, DEFAULT_BINDS.hoistDown);
    assert.deepEqual(loaded.binds.deploy, DEFAULT_BINDS.deploy);
    assert.deepEqual(loaded.binds.slewRight, ["KeyL"]);
  });
});
