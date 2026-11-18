const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "KeyR",
  "KeyF",
  "KeyZ",
  "KeyC",
  "KeyH",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Enter",
  "Escape",
]);

/** Every action a player can rebind. */
export const BIND_ACTIONS = [
  "slewLeft",
  "slewRight",
  "driveForward",
  "driveBack",
  "hoistUp",
  "hoistDown",
  "extendOut",
  "extendIn",
  "hook",
  "deploy",
] as const;

export type ActionId = (typeof BIND_ACTIONS)[number];
export type KeyBinds = Record<ActionId, string[]>;

export const DEFAULT_BINDS: KeyBinds = {
  slewLeft: ["KeyA", "ArrowLeft"],
  slewRight: ["KeyD", "ArrowRight"],
  driveForward: ["KeyW", "ArrowUp"],
  driveBack: ["KeyS", "ArrowDown"],
  hoistUp: ["KeyQ", "KeyR"],
  hoistDown: ["KeyE", "KeyF"],
  extendOut: ["KeyZ"],
  extendIn: ["KeyC"],
  hook: ["Space"],
  deploy: ["Enter"],
};

const ACTION_LABEL: Record<ActionId, string> = {
  slewLeft: "Slew / steer left",
  slewRight: "Slew / steer right",
  driveForward: "Drive / boom up",
  driveBack: "Reverse / boom down",
  hoistUp: "Hoist up",
  hoistDown: "Hoist down",
  extendOut: "Telescope out",
  extendIn: "Telescope in",
  hook: "Hook / release",
  deploy: "Deploy / stow pads",
};

export function bindLabel(action: ActionId): string {
  return ACTION_LABEL[action];
}

/** Render a browser key code as the legend printed on a key cap. */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5).toUpperCase();
  if (code === "Space") return "SPACE";
  if (code === "Enter") return "ENTER";
  if (code === "Escape") return "ESC";
  return code.toUpperCase();
}

let binds: KeyBinds = { ...DEFAULT_BINDS };

export function setKeyBinds(next: KeyBinds) {
  binds = { ...DEFAULT_BINDS, ...next };
}

export function currentKeyBinds(): KeyBinds {
  return binds;
}

const realKeys = new Set<string>();
const pending = new Set<string>();
let qaKeys: Set<string> | null = null;
let steerOverride: number | null = null;
let touchSensitivity = 1;

const touch = { steer: 0, trolley: 0, hoist: 0, extend: 0 };

function radialDeadzone(x: number, y: number, dz = 0.15) {
  const mag = Math.hypot(x, y);
  if (mag < dz) return { x: 0, y: 0 };
  const scale = (mag - dz) / (1 - dz) / mag;
  return { x: x * scale, y: y * scale };
}

export function installInput() {
  const down = (e: KeyboardEvent) => {
    if (!e.repeat) pending.add(e.code);
    realKeys.add(e.code);
    if (GAME_KEYS.has(e.code)) e.preventDefault();
  };
  const up = (e: KeyboardEvent) => realKeys.delete(e.code);
  const clear = () => {
    realKeys.clear();
    pending.clear();
    touch.steer = 0;
    touch.trolley = 0;
    touch.hoist = 0;
    touch.extend = 0;
    steerOverride = null;
  };
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
    pending.clear();
  };
}

export function setQaKeys(codes: string[]) {
  qaKeys = new Set(codes);
}

export function setTouchSensitivity(value: number) {
  touchSensitivity = clamp(value, 0.65, 1.35);
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

export function setTouchExtend(extend: number) {
  touch.extend = extend;
}

export type Actions = {
  steer: number;
  trolley: number;
  hoist: number;
  extend: number;
  modeDown: boolean;
  /** One-shot edges, consumed by the first read of a frame. */
  hookPressed?: boolean;
  deployPressed?: boolean;
  /** Escape is handled by the UI, not the sim. */
  pausePressed?: boolean;
};

const ZERO: Actions = { steer: 0, trolley: 0, hoist: 0, extend: 0, modeDown: false };

export function idleActions(): Actions {
  return ZERO;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function readActions(): Actions {
  const keys = qaKeys ?? realKeys;
  const held = (action: ActionId) => binds[action].some((code) => keys.has(code));
  const pressed = (action: ActionId) => binds[action].some((code) => pending.has(code));
  let steer = 0;
  let trolley = 0;
  let hoist = 0;
  let extend = 0;
  if (held("slewLeft")) steer += 1;
  if (held("slewRight")) steer -= 1;
  if (held("driveForward")) trolley += 1;
  if (held("driveBack")) trolley -= 1;
  if (held("hoistUp")) hoist += 1;
  if (held("hoistDown")) hoist -= 1;
  if (held("extendOut")) extend += 1;
  if (held("extendIn")) extend -= 1;

  steer += touch.steer * touchSensitivity;
  trolley += touch.trolley * touchSensitivity;
  hoist += touch.hoist;
  extend += touch.extend;

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

  const actions: Actions = {
    steer: clamp(steer, -1, 1),
    trolley: clamp(trolley, -1, 1),
    hoist: clamp(hoist, -1, 1),
    extend: clamp(extend, -1, 1),
    modeDown,
    hookPressed: pressed("hook"),
    deployPressed: pressed("deploy"),
    pausePressed: pending.has("Escape"),
  };
  pending.clear();
  return actions;
}
