export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  setSteer?: (v: number) => void;
  setKeys?: (codes: string[]) => void;
  /** Hook height, boom extension and cable length, for exercising the pads. */
  getHook?: () => {
    hy: number;
    extension: number;
    cable: number;
    state: string;
    pitch?: number;
    safety?: boolean;
  };
  /** Whether the game is taking input, and what it currently reads. */
  getInput?: () => { playing: boolean; boardPause: boolean; beat: string | null; actions: unknown };
  /** Read-only rig telemetry for driving a real pick in a browser test. */
  getRig?: () => unknown;
  /** Current set-ring colour, so a test can see it turn green on the mark. */
  getRing?: () => string | null;
  /** Audio context state and how many confirmation cues have fired. */
  getAudio?: () => { state: string; volume: number; cues: number } | null;
  /** A read-only copy of the live career, including upgrades and wear. */
  getCareer?: () => unknown;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}
