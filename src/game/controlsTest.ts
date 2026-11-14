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
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}
