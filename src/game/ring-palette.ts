/**
 * Set-ring palette.
 *
 * The ring is the single most important read in the game: amber means keep
 * working, green means the set is on the mark, cyan is the high-contrast
 * variant. Keeping the colours in one place means the renderer, the debrief
 * badge and the tests all agree.
 */

export const RING_AMBER = 0xffb02e;
export const RING_READY = 0x7dffa8;
export const RING_CONTRAST = 0x35e8ff;

/** The ring colour for the current state, as a display hex string. */
export function ringColorHex(onMark: boolean, contrast: boolean): string {
  if (contrast) return RING_CONTRAST.toString(16).padStart(6, "0");
  return (onMark ? RING_READY : RING_AMBER).toString(16).padStart(6, "0");
}

/** Grade badge glyph, so colour is never the only signal. */
export function gradeGlyph(grade: string): string {
  return grade === "S" ? "◆" : grade === "A" ? "▲" : grade === "B" ? "■" : "●";
}

/** Grade colour used by the debrief and the scorecard. */
export function gradeColor(grade: string): string {
  return grade === "S" ? "#e3a23a" : grade === "A" ? "#8fc17a" : grade === "B" ? "#cfd6dd" : "#e05252";
}
