const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "KeyR",
  "KeyF",
  "KeyH",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

const realKeys = new Set<string>();
let qaKeys: Set<string> | null = null;
let steerOverride: number | null = null;

const touch = { steer: 0, trolley: 0, hoist: 0 };

function radialDeadzone(x: number, y: number, dz = 0.15) {
  const mag = Math.hypot(x, y);
  if (mag < dz) return { x: 0, y: 0 };
  const scale = (mag - dz) / (1 - dz) / mag;
  return { x: x * scale, y: y * scale };
}

export function installInput() {
  const down = (e: KeyboardEvent) => {
    realKeys.add(e.code);
    if (GAME_KEYS.has(e.code)) e.preventDefault();
  };
  const up = (e: KeyboardEvent) => realKeys.delete(e.code);
  const clear = () => realKeys.clear();
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clear();
  });
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", clear);
    realKeys.clear();
  };
}

export function setQaKeys(codes: string[]) {
  qaKeys = new Set(codes);
}

export function setSteerOverride(v: number | null) {
  steerOverride = v;
}

/** Left on the stick is +steer (slew left). Up on the stick is +trolley (extend). */
export function setTouchAxes(steer: number, trolley: number) {
  touch.steer = steer;
  touch.trolley = trolley;
}

export function setTouchHoist(hoist: number) {
  touch.hoist = hoist;
}

export type Actions = {
  steer: number;
  trolley: number;
  hoist: number;
  modeDown: boolean;
};

const ZERO: Actions = { steer: 0, trolley: 0, hoist: 0, modeDown: false };

export function idleActions(): Actions {
  return ZERO;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function readActions(): Actions {
  const keys = qaKeys ?? realKeys;
  let steer = 0;
  let trolley = 0;
  let hoist = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) steer += 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) steer -= 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) trolley += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) trolley -= 1;
  if (keys.has("KeyQ") || keys.has("KeyR")) hoist += 1;
  if (keys.has("KeyE") || keys.has("KeyF")) hoist -= 1;

  steer += touch.steer;
  trolley += touch.trolley;
  hoist += touch.hoist;

  let modeDown = keys.has("KeyH");

  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad || pad.mapping !== "standard") continue;
    const stick = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, 0.22);
    const eased = Math.hypot(stick.x, stick.y);
    const curve = eased * eased;
    const steerPad = eased > 0 ? (-stick.x / eased) * curve : 0;
    const trolleyPad = eased > 0 ? (-stick.y / eased) * curve : 0;
    steer += steerPad;
    trolley += trolleyPad;
    if (pad.buttons[4]?.pressed) hoist += 1;
    if (pad.buttons[5]?.pressed) hoist -= 1;
    if (pad.buttons[3]?.pressed) modeDown = true;
  }

  if (steerOverride != null) steer = steerOverride;

  return {
    steer: clamp(steer, -1, 1),
    trolley: clamp(trolley, -1, 1),
    hoist: clamp(hoist, -1, 1),
    modeDown,
  };
}
