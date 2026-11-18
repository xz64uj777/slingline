/**
 * First-shift coaching.
 *
 * A new player gets the objective line, but the order of operations is the
 * hard part: pads, then pick, then carry, then set. This turns the live rig
 * state into one short prompt at a time, so the first job teaches itself and a
 * returning player never sees it again.
 */

export type CoachStage = "deploy" | "pickup" | "carry" | "set" | "waiting" | "done";

export type CoachInput = {
  state: string;
  usesOutriggers: boolean;
  outrigger: number;
  attached: boolean;
  landed: boolean;
  canRelease: boolean;
  phase: string;
  hookReady: boolean;
  hookGap: number;
  spotMeters: number;
  tolerance: number;
  hauling?: boolean;
};

export type CoachPrompt = { stage: CoachStage; title: string; body: string };

export function coachStage(input: CoachInput): CoachStage {
  if (input.phase === "done" || input.phase === "broke") return "done";
  if (input.state !== "lifting") return "waiting";
  if (input.attached && input.canRelease) return "set";
  if (input.attached) return "carry";
  if (input.hookReady || input.hookGap < 3) return "pickup";
  if (input.usesOutriggers && input.outrigger < 0.5) return "deploy";
  return "pickup";
}

const PROMPTS: Record<CoachStage, CoachPrompt> = {
  deploy: {
    stage: "deploy",
    title: "Pads first",
    body: "Stop the carrier, then press DEPLOY. The pads must be down before the load leaves the ground.",
  },
  pickup: {
    stage: "pickup",
    title: "Hook the load",
    body: "Slew and telescope until the hook is over the marked load, lower it, then press HOOK. The HOOK button only arms when you are close.",
  },
  carry: {
    stage: "carry",
    title: "Carry it over the ring",
    body: "Move in small inputs and let the load settle. The amber ring is the target; the alignment line tells you which way to correct.",
  },
  set: {
    stage: "set",
    title: "On the mark",
    body: "The ring is green and the button says RELEASE. Press it now: the grade is already decided by your ring error, impact and sway.",
  },
  waiting: {
    stage: "waiting",
    title: "Get set up",
    body: "Drive to the work area, stop, and deploy the pads. Once the boom is out, the same controls slew, pitch and hoist.",
  },
  done: {
    stage: "done",
    title: "Read the debrief",
    body: "The card shows which reading cost you. Dismiss it, then take the next call from the board.",
  },
};

export function coachPrompt(input: CoachInput): CoachPrompt {
  return PROMPTS[coachStage(input)];
}

/** The three things the first-shift checklist tracks, in order. */
export function coachChecklist(input: CoachInput): { id: string; label: string; done: boolean }[] {
  return [
    { id: "pads", label: "Deploy the pads", done: !input.usesOutriggers || input.outrigger > 0.5 },
    { id: "hook", label: "Hook the load", done: input.attached || input.phase === "done" },
    { id: "set", label: "Land it in the ring", done: input.phase === "done" },
  ];
}
