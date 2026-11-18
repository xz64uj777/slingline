/**
 * The job table.
 *
 * Every contract lives here as data, not as branches in the career logic. The
 * campaign is a list of these records: the board, the HUD and the tests all
 * read the same table, so a new call only needs a new row and a pad.
 */

import type { CraneId } from "./cranes.ts";
import type { LoadKind } from "./loads.ts";
import type { SiteTheme } from "./levels.ts";

export type JobId =
  | "yard"
  | "pipe"
  | "truss"
  | "panel"
  | "garage"
  | "container"
  | "roof"
  | "hvac"
  | "tracks"
  | "spa"
  | "wind"
  | "rotor"
  | "wall"
  | "girder"
  | "culvert"
  | "curtain";

export type JobPhase = "tutorial" | "odd" | "company";

export type JobFollow = {
  title: string;
  kind: LoadKind;
  pad: number;
  pay: number;
  ring: number;
};

export type JobDef = {
  id: JobId;
  /** Campaign number, shown on the board and the HUD. */
  no: number;
  phase: JobPhase;
  title: string;
  kind: LoadKind;
  pad: number;
  theme: SiteTheme;
  brief: string;
  pay: number;
  /** Set ring radius in metres: how far off centre the load may land. */
  ring: number;
  follow?: JobFollow;
  rep: number;
  crane: CraneId;
  roof: boolean;
  repGain: number;
  /** A second bearing pad: the load has to span both, not just reach one. */
  pad2?: number;
  /** Required load heading in radians, for loads that have to land square. */
  heading?: number;
  /** How far off that heading still reads as on-square, in degrees. */
  headingTol?: number;
  /** This call only opens once another job has been set. */
  after?: JobId;
};

/**
 * Hired work is three tutorials and two small jobs. The wages pay the filing
 * fee. After Slingline is filed, the board is only calls that change the work:
 * a backyard, the docks, one roof, a rooftop unit, the crawler, and a blade.
 * The yard move stays as the shop shift so a bad streak cannot trap the player.
 */
export const JOBS: Record<JobId, JobDef> = {
  yard: {
    id: "yard",
    no: 1,
    phase: "tutorial",
    title: "YARD MOVE",
    kind: "crate",
    pad: 5,
    theme: "yard",
    brief: "Tutorial. Hook the crate, keep the sway down, and set it inside the amber ring.",
    pay: 1800,
    rep: 0,
    crane: "rental",
    roof: false,
    repGain: 1,
    ring: 2.4,
  },
  pipe: {
    id: "pipe",
    no: 2,
    phase: "tutorial",
    title: "PIPE DROP",
    kind: "pipe",
    pad: 3,
    theme: "steel",
    brief: "Tutorial. Set the pads before you lift the pipe, or it leans the crane. The ring is across the yard. Stow, drive to it, set the pads again, and lower the pipe in.",
    pay: 2800,
    rep: 0,
    crane: "rental",
    roof: false,
    repGain: 1,
    ring: 1.6,
  },
  truss: {
    id: "truss",
    no: 3,
    phase: "tutorial",
    title: "TRUSS PICK",
    kind: "truss",
    pad: 4,
    theme: "steel",
    brief: "Tutorial. A light truss catches every gust. Set it in the ring, or skip ahead if you already know the controls.",
    pay: 2600,
    rep: 0,
    crane: "rental",
    roof: false,
    repGain: 1,
    ring: 1.2,
  },
  panel: {
    id: "panel",
    no: 4,
    phase: "odd",
    title: "PANEL SET",
    kind: "panel",
    pad: 2,
    theme: "warehouse",
    brief: "Small job. A flat panel tips if you rush it. Short pay, and it counts toward the fee.",
    pay: 3000,
    rep: 0,
    crane: "rental",
    roof: false,
    repGain: 1,
    ring: 1.3,
  },
  garage: {
    id: "garage",
    no: 5,
    phase: "odd",
    title: "GARAGE UNIT",
    kind: "hvac",
    pad: 1,
    theme: "warehouse",
    brief: "Small job. A condenser for the shop office. Short swing, and this wage should clear the filing fee.",
    pay: 3400,
    rep: 0,
    crane: "rental",
    roof: false,
    repGain: 1,
    ring: 1.4,
  },
  spa: {
    id: "spa",
    no: 1,
    phase: "company",
    title: "BACKYARD SPA DECK",
    kind: "deck",
    pad: 6,
    theme: "residential",
    brief: "Drive down Maple Lane and park in the marked setup box. Then set the deck kit and the hot tub in the backyard.",
    pay: 3200,
    follow: { title: "HOT TUB SET", kind: "hotTub", pad: 7, pay: 6200, ring: 0.95 },
    rep: 2,
    crane: "yard",
    roof: false,
    repGain: 4,
    ring: 1.2,
  },
  container: {
    id: "container",
    no: 2,
    phase: "company",
    title: "DOCK BOX",
    kind: "container",
    pad: 2,
    theme: "port",
    brief: "A loaded box at the docks. Long, heavy, and it catches the wind off the water.",
    pay: 4600,
    rep: 3,
    crane: "yard",
    roof: false,
    repGain: 2,
    ring: 1.4,
  },
  roof: {
    id: "roof",
    no: 3,
    phase: "company",
    title: "ROOF SET",
    kind: "beam",
    pad: 0,
    theme: "tower",
    brief: "One beam for the roof line. The ring is small and the boom is near its limit.",
    pay: 7000,
    rep: 4,
    crane: "yard",
    roof: true,
    repGain: 2,
    ring: 0.8,
  },
  hvac: {
    id: "hvac",
    no: 4,
    phase: "company",
    title: "ROOFTOP UNIT",
    kind: "hvac",
    pad: 0,
    theme: "tower",
    brief: "A packaged unit over the parapet. Do not clip the edge on the way down.",
    pay: 8200,
    rep: 6,
    crane: "lattice",
    roof: true,
    repGain: 3,
    ring: 0.9,
  },
  tracks: {
    id: "tracks",
    no: 5,
    phase: "company",
    title: "TRACK PICK",
    kind: "heavy",
    pad: 2,
    theme: "yard",
    brief: "The crawler arrives on the lowboy. Deliver it, then lift the base off the deck.",
    pay: 8600,
    rep: 8,
    crane: "crawler",
    roof: false,
    repGain: 3,
    ring: 1.3,
  },
  wind: {
    id: "wind",
    no: 6,
    phase: "company",
    title: "RIDGE BLADE SET",
    kind: "blade",
    pad: 11,
    theme: "windFarm",
    brief: "Lift a turbine blade from the delivery cradle to the stand beside the tower. Hard mode adds the ridge wind.",
    pay: 14800,
    follow: { title: "NACELLE SET", kind: "nacelle", pad: 11, pay: 9600, ring: 1.0 },
    rep: 10,
    crane: "heavy",
    roof: false,
    repGain: 4,
    ring: 1.4,
  },
  wall: {
    id: "wall",
    no: 8,
    phase: "company",
    title: "TILT-UP WALL",
    kind: "panel",
    pad: 6,
    theme: "residential",
    brief: "Second contract. The panel lands flat between the casting-bed guides, its long axis along them. Set the crane up square to the bed, slew until the panel is lined up, then lower it in.",
    pay: 26000,
    rep: 16,
    crane: "yard",
    roof: false,
    repGain: 5,
    ring: 0.9,
    heading: Math.PI / 2,
    headingTol: 10,
    after: "rotor",
  },
  girder: {
    id: "girder",
    no: 9,
    phase: "company",
    title: "RIVER GIRDER",
    kind: "girder",
    pad: 3,
    pad2: 12,
    theme: "port",
    brief: "Second contract. A bridge girder for the quay: both ends have to land on their bearing pads. Set up square to the span and line the girder up across it before you lower away.",
    pay: 30000,
    rep: 18,
    crane: "lattice",
    roof: false,
    repGain: 5,
    ring: 0.8,
    after: "rotor",
  },
  culvert: {
    id: "culvert",
    no: 10,
    phase: "company",
    title: "CULVERT SPAN",
    kind: "pipe",
    pad: 13,
    pad2: 14,
    theme: "port",
    brief: "Second contract. A drainage culvert for the quay: the pipe has to land on both saddles, square to the span. Line the long axis up along the saddles before you lower away.",
    pay: 30000,
    rep: 20,
    crane: "lattice",
    roof: false,
    repGain: 5,
    ring: 0.7,
    heading: Math.PI / 2,
    headingTol: 12,
    after: "girder",
  },
  curtain: {
    id: "curtain",
    no: 11,
    phase: "company",
    title: "CURTAIN WALL",
    kind: "panel",
    pad: 0,
    theme: "tower",
    brief: "Second contract. The first curtain-wall panel goes onto the tower roof, square to the facade. Clear the parapet on the way down and keep the panel lined up with the curb.",
    pay: 34000,
    rep: 22,
    crane: "lattice",
    roof: true,
    repGain: 5,
    ring: 0.7,
    heading: 0,
    headingTol: 8,
    after: "wall",
  },
  rotor: {
    id: "rotor",
    no: 7,
    phase: "company",
    title: "ROTOR LIFT",
    kind: "rotor",
    pad: 11,
    theme: "windFarm",
    brief: "Capstone. The blade and the nacelle are up. Set the rotor hub and the ridge is signed off.",
    pay: 24000,
    rep: 14,
    crane: "crawler",
    roof: false,
    repGain: 5,
    ring: 1.0,
    after: "wind",
  },
};

/** Shop shift plus the company calls. Tutorials and odd jobs are not on this board. */
export const COMPANY_JOBS: JobId[] = [
  "yard",
  "spa",
  "container",
  "roof",
  "hvac",
  "tracks",
  "wind",
  "rotor",
  "wall",
  "girder",
  "culvert",
  "curtain",
];

/** Three tutorials, then two small jobs. That is the whole hired list. */
export const RENTAL_LEVELS: JobId[] = ["yard", "pipe", "truss", "panel", "garage"];

/** Every call, in play order, so a test can open one without owning it. */
export const ALL_JOBS: JobId[] = [
  "yard",
  "pipe",
  "truss",
  "panel",
  "garage",
  "spa",
  "container",
  "roof",
  "hvac",
  "tracks",
  "wind",
  "rotor",
  "wall",
  "girder",
  "culvert",
  "curtain",
];

/** Company calls only. The yard move is a shop shift, not a level. */
export const LEVEL_COUNT = 11;

/**
 * Structural checks for the table. Returns one message per problem, so a new
 * row that points at a missing follow-up call fails a test instead of a shift.
 */
export function validateJobs(table: Record<JobId, JobDef> = JOBS, pads = 15): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [key, job] of Object.entries(table)) {
    if (job.id !== key) problems.push(`${key}: id is ${job.id}`);
    if (seen.has(job.id)) problems.push(`${job.id}: duplicate id`);
    seen.add(job.id);
    if (!(job.ring > 0)) problems.push(`${key}: ring must be positive`);
    if (!(job.pay > 0)) problems.push(`${key}: pay must be positive`);
    if (job.pad < 0 || job.pad >= pads) problems.push(`${key}: pad ${job.pad} is outside the yard`);
    if (job.follow) {
      if (!(job.follow.ring > 0)) problems.push(`${key}: follow ring must be positive`);
      if (!(job.follow.pay > 0)) problems.push(`${key}: follow pay must be positive`);
      if (job.follow.pad < 0 || job.follow.pad >= pads) problems.push(`${key}: follow pad is outside the yard`);
    }
    if (job.pad2 !== undefined) {
      if (job.pad2 < 0 || job.pad2 >= pads) problems.push(`${key}: second pad is outside the yard`);
      if (job.pad2 === job.pad) problems.push(`${key}: second pad is the first pad`);
      if (!(job.ring > 0)) problems.push(`${key}: two-pad job needs a ring`);
    }
    if (job.heading !== undefined && !(job.headingTol && job.headingTol > 0)) {
      problems.push(`${key}: heading needs a positive tolerance`);
    }
    if (job.heading === undefined && job.headingTol !== undefined) {
      problems.push(`${key}: heading tolerance without a target heading`);
    }
    if (job.after && !(job.after in table)) problems.push(`${key}: after points at unknown job ${job.after}`);
    if (job.after === key) problems.push(`${key}: cannot unlock itself`);
  }
  for (const id of ALL_JOBS) if (!(id in table)) problems.push(`missing job ${id}`);
  return problems;
}
