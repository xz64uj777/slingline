/**
 * The things a crane lifts. Each kind has one set of dimensions shared by the
 * physics (resting height, sling corners) and the yard model, so a pipe sits on
 * the ground and hangs from its own ends instead of borrowing the crate box.
 */
export type LoadKind = "crate" | "beam" | "heavy" | "pipe" | "truss" | "panel" | "hvac" | "container";

export type LoadSpec = {
  /** Half extents in metres, centred on the load's middle. */
  halfX: number;
  halfY: number;
  halfZ: number;
  /** Short tag for the HUD and hook prompt. */
  label: string;
  /** Spoken name used in messages. */
  noun: string;
  /** Body colour for the yard model. */
  color: number;
  /** Suspended weight used by the load chart, in tonnes. */
  weight: number;
};

export const LOAD_SPECS: Record<LoadKind, LoadSpec> = {
  crate: { halfX: 0.8, halfY: 0.8, halfZ: 0.8, label: "CRATE", noun: "crate", color: 0xc4894a, weight: 0.8 },
  beam: { halfX: 0.32, halfY: 0.3, halfZ: 2.15, label: "BEAM", noun: "steel beam", color: 0x8d98a4, weight: 4.1 },
  heavy: { halfX: 1.12, halfY: 1.12, halfZ: 1.12, label: "BLOCK", noun: "heavy block", color: 0x4a4038, weight: 8.2 },
  pipe: { halfX: 0.34, halfY: 0.34, halfZ: 3.2, label: "PIPE", noun: "pipe section", color: 0xb0b9c1, weight: 2.2 },
  truss: { halfX: 0.55, halfY: 0.5, halfZ: 2.6, label: "TRUSS", noun: "steel truss", color: 0xb45a35, weight: 0.8 },
  panel: { halfX: 1.7, halfY: 0.14, halfZ: 0.9, label: "PANEL", noun: "precast panel", color: 0xc5ced6, weight: 3.2 },
  hvac: { halfX: 1.0, halfY: 0.65, halfZ: 0.8, label: "HVAC", noun: "rooftop unit", color: 0x9aa6b1, weight: 3.6 },
  container: { halfX: 1.2, halfY: 1.3, halfZ: 3.0, label: "CONTAINER", noun: "container", color: 0x2f6d7a, weight: 3.6 },
};

export const LOAD_KINDS = Object.keys(LOAD_SPECS) as LoadKind[];

/** Two yard decoys per call, so the right piece is never the only shape in sight. */
export const YARD_DECOYS: Record<LoadKind, [LoadKind, LoadKind]> = {
  crate: ["beam", "pipe"],
  beam: ["crate", "panel"],
  heavy: ["container", "beam"],
  pipe: ["beam", "truss"],
  truss: ["pipe", "panel"],
  panel: ["hvac", "beam"],
  hvac: ["panel", "crate"],
  container: ["heavy", "crate"],
};

export function loadSpec(kind: LoadKind): LoadSpec {
  return LOAD_SPECS[kind];
}
