/**
 * Shadow budget for the yard.
 *
 * Desktop GPUs get a 2048² soft shadow map. Phones and weak devices get a
 * quarter of that resolution with the cheaper PCF filter, and devices that
 * cannot afford the pass at all run with shadows disabled — the sun still
 * lights the yard, it just stops casting.
 */
export type ShadowQuality = "high" | "low" | "off";

/** Shadow map edge length in texels, per tier. */
export const SHADOW_MAP_SIZE: Record<Exclude<ShadowQuality, "off">, number> = {
  high: 2048,
  low: 512,
};

export type DeviceProfile = {
  /** Viewport width in CSS pixels. */
  width: number;
  /** Touch-first device (coarse pointer). */
  coarsePointer: boolean;
  /** `navigator.deviceMemory` in GB, or the assumed 8 when unavailable. */
  memory: number;
  /** `navigator.hardwareConcurrency`, or the assumed 8 when unavailable. */
  cores: number;
  /** The user asked the browser to save data. */
  saveData: boolean;
};

export function shadowQualityFor(profile: DeviceProfile): ShadowQuality {
  if (profile.saveData) return "off";
  if (profile.memory <= 2 || profile.cores <= 2) return "off";
  if (profile.coarsePointer || profile.width < 800 || profile.memory <= 4) return "low";
  return "high";
}

export function detectShadowQuality(): ShadowQuality {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "high";
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return shadowQualityFor({
    width: window.innerWidth,
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    memory: nav.deviceMemory ?? 8,
    cores: nav.hardwareConcurrency ?? 8,
    saveData: nav.connection?.saveData === true,
  });
}
