/**
 * Save text.
 *
 * A career can be copied out and pasted back in, so a phone that clears its
 * storage or a player moving to another browser is not a lost campaign. The
 * format is versioned in the payload itself; decoding runs the same validator
 * as a stored save, so a hand-edited string cannot inject a bad state.
 */

import { loadCareer, saveCareer, type CareerState } from "./career.ts";

const PREFIX = "SLING1.";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b == null ? "=" : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c == null ? "=" : ALPHABET[c & 63];
  }
  return out;
}

function fromBase64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return null;
  const clean = text.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/** A paste-safe string with no line breaks, for a phone clipboard. */
export function encodeSave(state: CareerState): string {
  const json = JSON.stringify(saveCareer(state));
  return PREFIX + toBase64(new TextEncoder().encode(json));
}

export type DecodedSave = { ok: true; state: CareerState } | { ok: false; message: string };

export function decodeSave(text: string): DecodedSave {
  const trimmed = text.trim();
  if (!trimmed.startsWith(PREFIX)) return { ok: false, message: "That does not look like a Slingline save. It should start with SLING1." };
  const bytes = fromBase64(trimmed.slice(PREFIX.length));
  if (!bytes) return { ok: false, message: "The save text is damaged. Copy it again from the export box." };
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return { ok: false, message: "The save text is damaged. Copy it again from the export box." };
  }
  if (!raw || typeof raw !== "object") return { ok: false, message: "The save text held no career." };
  const record = raw as Record<string, unknown>;
  if (record.v !== 2 && record.v !== 3 && record.v !== 4) {
    return { ok: false, message: "That save is from a version this build cannot read." };
  }
  const state = loadCareer(raw);
  return { ok: true, state };
}

/** A short human line describing an imported save before it is accepted. */
export function describeSave(state: CareerState): string {
  const cash = `$${Math.round(state.cash).toLocaleString("en-US")}`;
  const where = state.status === "hired" ? `Hargrove hire, standing ${state.standing}` : `Slingline, reputation ${state.reputation}`;
  return `${cash} · ${where} · ${state.jobsDone} jobs · ${state.crane} crane`;
}
