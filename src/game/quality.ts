/**
 * Frame-time governor.
 *
 * The renderer already lowers its pixel scale on slow frames. A phone that is
 * still slow after that should lose shadows and draw distance too, once, rather
 * than stutter through a whole shift. This is a small windowed decision so it
 * cannot oscillate between tiers.
 */

export type QualityAdvice = "hold" | "drop";

/** Below this frame time the yard is smooth enough to keep the high tier. */
export const SMOOTH_MS = 24;
/** A drop needs this many sampled frames to be sure it is not one hitch. */
export const SAMPLE_SIZE = 90;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

/**
 * Decide from the last window of frame times. A single long frame (a tab
 * switch, a shader compile) cannot trigger it because the median is used.
 */
export function qualityAdvice(frameTimesMs: number[]): QualityAdvice {
  if (frameTimesMs.length < SAMPLE_SIZE) return "hold";
  return median(frameTimesMs.slice(-SAMPLE_SIZE)) > SMOOTH_MS ? "drop" : "hold";
}

export class QualityGovernor {
  private samples: number[] = [];
  private dropped = false;
  private start = 0;

  /** Feed one frame; true means the caller should pin the low tier. */
  sample(frameDt: number, now: number): boolean {
    if (this.dropped) return false;
    if (this.start === 0) this.start = now;
    // Ignore the first two seconds: startup compiles shaders and lies.
    if (now - this.start < 2000) return false;
    this.samples.push(frameDt * 1000);
    if (this.samples.length > SAMPLE_SIZE * 2) this.samples.shift();
    if (qualityAdvice(this.samples) === "drop") {
      this.dropped = true;
      return true;
    }
    return false;
  }

  get didDrop() {
    return this.dropped;
  }

  reset() {
    this.samples = [];
    this.dropped = false;
    this.start = 0;
  }
}
