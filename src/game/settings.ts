import type { Mode, Pace } from "./sim.ts";
import { DEFAULT_BINDS, BIND_ACTIONS, type KeyBinds } from "./input.ts";

export type Scheme = "stick" | "arrows";
export type Sensitivity = "low" | "normal" | "high";
export type Quality = "auto" | "high" | "low";

export type Settings = {
  /** Difficulty. */
  mode: Mode;
  /** Travel and slew pace. */
  pace: Pace;
  /** Thumb stick or directional buttons. */
  scheme: Scheme;
  /** Touch input scale. */
  sensitivity: Sensitivity;
  /** Master audio level, 0 = muted. */
  volume: number;
  /** Run every job after dark, not just the night call. */
  night: boolean;
  /** Render scale: auto adapts to the frame time, high and low pin it. */
  quality: Quality;
  /** High-contrast set ring for weak daylight and colour-blind players. */
  contrast: boolean;
  /** Turn off pulsing and flashing cues. */
  reduceMotion: boolean;
  /** Short vibrations on latch, mark and release. */
  haptics: boolean;
  /** On-screen text for the audio cues. */
  captions: boolean;
  /** Pull the camera to the set when the debrief opens. */
  autoFrame: boolean;
  /** Drag anywhere in the yard to slew and telescope. */
  gestureSwing: boolean;
  /** Keyboard bindings for the crane controls. */
  binds: KeyBinds;
};

export const SETTINGS_KEY = "slingline-settings";

export const DEFAULT_SETTINGS: Settings = {
  mode: "easy",
  pace: "steady",
  scheme: "arrows",
  sensitivity: "normal",
  volume: 1,
  night: false,
  quality: "auto",
  contrast: false,
  reduceMotion: false,
  haptics: true,
  captions: false,
  autoFrame: true,
  gestureSwing: false,
  binds: DEFAULT_BINDS,
};

const SENSITIVITY_VALUE: Record<Sensitivity, number> = {
  low: 0.75,
  normal: 1,
  high: 1.3,
};

/** Touch axis multiplier for a sensitivity setting. */
export function sensitivityScale(sensitivity: Sensitivity): number {
  return SENSITIVITY_VALUE[sensitivity];
}

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, value));
}

function readQuality(value: unknown): Quality {
  return value === "high" || value === "low" ? value : "auto";
}

/** Only key codes the browser reports, so a broken save cannot freeze input. */
const KEY_CODE = /^[A-Za-z0-9]{1,24}$/;

function readBinds(raw: unknown): KeyBinds {
  const next: KeyBinds = { ...DEFAULT_BINDS };
  if (!raw || typeof raw !== "object") return next;
  const record = raw as Record<string, unknown>;
  for (const action of BIND_ACTIONS) {
    const list = record[action];
    if (!Array.isArray(list)) continue;
    const codes = [...new Set(list.filter((code): code is string => typeof code === "string" && KEY_CODE.test(code)))].slice(0, 3);
    if (codes.length > 0) next[action] = codes;
  }
  return next;
}

/**
 * Rebuild settings from stored JSON. Every field is validated on its own so a
 * half-written or older save keeps whatever still makes sense.
 */
export function loadSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS, binds: { ...DEFAULT_BINDS } };
  const record = raw as Record<string, unknown>;
  const mode: Mode = record.mode === "hard" ? "hard" : "easy";
  const pace: Pace =
    record.pace === "slow" ? "slow" : record.pace === "fast" ? "fast" : "steady";
  const scheme: Scheme = record.scheme === "stick" ? "stick" : "arrows";
  const sensitivity: Sensitivity =
    record.sensitivity === "low"
      ? "low"
      : record.sensitivity === "high"
        ? "high"
        : "normal";
  const stored = typeof record.volume === "number" ? record.volume : Number(record.volume);
  const volume = Number.isFinite(stored) ? clamp(stored, 0, 1) : DEFAULT_SETTINGS.volume;
  const night = record.night === true;
  return {
    mode,
    pace,
    scheme,
    sensitivity,
    volume,
    night,
    quality: readQuality(record.quality),
    contrast: record.contrast === true,
    reduceMotion: record.reduceMotion === true,
    haptics: record.haptics !== false,
    captions: record.captions === true,
    autoFrame: record.autoFrame !== false,
    gestureSwing: record.gestureSwing === true,
    binds: readBinds(record.binds),
  };
}

export function readSettingsStore(): Settings {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS, binds: { ...DEFAULT_BINDS } };
    const text = localStorage.getItem(SETTINGS_KEY);
    if (!text) return { ...DEFAULT_SETTINGS, binds: { ...DEFAULT_BINDS } };
    return loadSettings(JSON.parse(text) as unknown);
  } catch {
    return { ...DEFAULT_SETTINGS, binds: { ...DEFAULT_BINDS } };
  }
}

export function writeSettingsStore(settings: Settings): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(loadSettings(settings)));
  } catch {
    /* private mode */
  }
}
