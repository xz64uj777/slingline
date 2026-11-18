/**
 * Phone haptics.
 *
 * The audio cues already mark the set; a thumb on glass cannot hear a chime in
 * a noisy room, so the same four moments get a short vibration pattern. Silently
 * does nothing where the API is missing or the player turned it off.
 */

export type HapticKind = "latch" | "release" | "ready" | "grade" | "incident" | "upgrade";

const PATTERNS: Record<HapticKind, number | number[]> = {
  latch: [18],
  release: [12, 40, 18],
  ready: [22, 50, 22],
  grade: [26, 60, 26, 60, 34],
  incident: [70, 50, 70],
  upgrade: [14, 32, 14],
};

let enabled = true;
let lastAt = 0;

export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

export function hapticsEnabled() {
  return enabled;
}

export function hapticPattern(kind: HapticKind): number | number[] {
  return PATTERNS[kind];
}

/**
 * Fire one pattern. Returns false when nothing was sent, which is what the
 * tests and the dev probe read. Throttled so a bouncing state cannot buzz.
 */
export function haptic(kind: HapticKind, now = Date.now()): boolean {
  if (!enabled) return false;
  if (now - lastAt < 90) return false;
  const nav = typeof navigator === "undefined" ? null : navigator;
  if (!nav || typeof nav.vibrate !== "function") return false;
  lastAt = now;
  try {
    return nav.vibrate(PATTERNS[kind]);
  } catch {
    return false;
  }
}
