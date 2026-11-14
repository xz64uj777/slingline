import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS, loadSettings } from "./settings.ts";

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
