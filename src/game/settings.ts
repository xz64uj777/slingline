import type { Mode, Pace } from "./sim.ts";

export type Scheme = "stick" | "arrows";
export type Sensitivity = "low" | "normal" | "high";

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
};

export const SETTINGS_KEY = "slingline-settings";

export const DEFAULT_SETTINGS: Settings = {
  mode: "easy",
  pace: "steady",
  scheme: "stick",
  sensitivity: "normal",
  volume: 1,
  night: false,
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

/**
 * Rebuild settings from stored JSON. Every field is validated on its own so a
 * half-written or older save keeps whatever still makes sense.
 */
export function loadSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const record = raw as Record<string, unknown>;
  const mode: Mode = record.mode === "hard" ? "hard" : "easy";
  const pace: Pace =
    record.pace === "slow" ? "slow" : record.pace === "fast" ? "fast" : "steady";
  const scheme: Scheme = record.scheme === "arrows" ? "arrows" : "stick";
  const sensitivity: Sensitivity =
    record.sensitivity === "low"
      ? "low"
      : record.sensitivity === "high"
        ? "high"
        : "normal";
  const stored = typeof record.volume === "number" ? record.volume : Number(record.volume);
  const volume = Number.isFinite(stored) ? clamp(stored, 0, 1) : DEFAULT_SETTINGS.volume;
  const night = record.night === true;
  return { mode, pace, scheme, sensitivity, volume, night };
}

export function readSettingsStore(): Settings {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
    const text = localStorage.getItem(SETTINGS_KEY);
    if (!text) return { ...DEFAULT_SETTINGS };
    return loadSettings(JSON.parse(text) as unknown);
  } catch {
    return { ...DEFAULT_SETTINGS };
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
