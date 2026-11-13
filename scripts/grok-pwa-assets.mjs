/**
 * Build-time PWA assets.
 *
 * The dev and preview servers answer `/__grok/manifest.webmanifest` from a
 * request handler, but the published build is static, so the same two URLs have
 * to exist as real files. The plugin emits them into the client bundle, which
 * is what the static hosts serve. `public/__grok/` is gitignored — these are
 * generated, never committed.
 */

import { deflateSync } from "node:zlib";
import { normalizeBase } from "./grok-pwa-shared.mjs";

const ICON_SIZE = 180;
/** Bumped rendering scale; shapes are drawn big and box-filtered down for AA. */
const SUPERSAMPLE = 4;

const INK = [0x12, 0x14, 0x18];
const METAL = [0x9a, 0xa3, 0xad];
const ORANGE = [0xe3, 0xa2, 0x3a];
const RED = [0xc4, 0x49, 0x2c];

const DEFAULT_NAME = "Slingline";
const DEFAULT_THEME = "#121418";

// Bundle-relative paths: the emitted files sit at the base root on the host.
export const MANIFEST_FILE = "__grok/manifest.webmanifest";
export const ICON_FILE = "__grok/icon-180.png";

/** Public URL of the emitted icon for a given Vite base. */
export function iconUrl(base = "/") {
  return `${normalizeBase(base)}__grok/icon-180.png`;
}

/** Manifest JSON for the static build, mirroring the dynamic dev response. */
export function renderStaticManifest(site = {}, base = "/") {
  const title = typeof site.title === "string" && site.title.trim() ? site.title.trim() : DEFAULT_NAME;
  const color =
    typeof site.color === "string" && /^[0-9a-f]{6}$/i.test(site.color)
      ? `#${site.color}`
      : DEFAULT_THEME;
  const prefix = normalizeBase(base);
  return JSON.stringify(
    {
      name: title,
      short_name: title,
      id: prefix,
      start_url: prefix,
      scope: prefix,
      display: "standalone",
      background_color: color,
      theme_color: color,
      icons: [
        {
          src: iconUrl(prefix),
          sizes: `${ICON_SIZE}x${ICON_SIZE}`,
          type: "image/png",
        },
      ],
    },
    null,
    2,
  );
}

// --- raster -----------------------------------------------------------------

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function fill(size, rgba, color, inside) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const i = (y * size + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
    }
  }
}

function roundedRect(size, color, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  return (px, py) => {
    const dx = Math.max(Math.abs(px - (x + w / 2)) - (w / 2 - r), 0);
    const dy = Math.max(Math.abs(py - (y + h / 2)) - (h / 2 - r), 0);
    return dx * dx + dy * dy <= r * r;
  };
}

function capsule(x1, y1, x2, y2, halfWidth) {
  return (px, py) => distanceToSegment(px, py, x1, y1, x2, y2) <= halfWidth;
}

function ring(cx, cy, radius, halfWidth) {
  return (px, py) => Math.abs(Math.hypot(px - cx, py - cy) - radius) <= halfWidth;
}

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/** The favicon mark — jib, mast, hoist rope, hook — drawn at 180². */
function renderIconRgba(size = ICON_SIZE) {
  const big = size * SUPERSAMPLE;
  const scale = big / 32; // the favicon is a 32-unit viewBox
  const layer = Buffer.alloc(big * big * 4);
  const at = (v) => v * scale;

  fill(big, layer, INK, roundedRect(big, INK, 0, 0, big, big, at(6)));

  fill(big, layer, METAL, capsule(at(7), at(8.5), at(25), at(8.5), at(1.1)));
  fill(big, layer, METAL, capsule(at(11), at(8.5), at(11), at(11.7), at(1.1)));

  fill(big, layer, ORANGE, capsule(at(19), at(8.5), at(19), at(15.6), at(1.2)));

  // Hook rope: cubic from the mast tip, curving out and back up.
  const start = [at(19), at(15.6)];
  const c1 = [at(19), at(21.2)];
  const c2 = [at(10.8), at(22.0)];
  const end = [at(10.8), at(17.2)];
  let prev = start;
  for (let step = 1; step <= 24; step += 1) {
    const next = cubic(start, c1, c2, end, step / 24);
    fill(big, layer, ORANGE, capsule(prev[0], prev[1], next[0], next[1], at(1.2)));
    prev = next;
  }

  fill(big, layer, RED, ring(at(19), at(25.2), at(2.1), at(0.75)));

  // Box-filter down to the final size.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const i = ((y * SUPERSAMPLE + sy) * big + (x * SUPERSAMPLE + sx)) * 4;
          r += layer[i];
          g += layer[i + 1];
          b += layer[i + 2];
          a += layer[i + 3];
        }
      }
      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / samples);
      out[o + 1] = Math.round(g / samples);
      out[o + 2] = Math.round(b / samples);
      out[o + 3] = Math.round(a / samples);
    }
  }
  return out;
}

// --- PNG encode -------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Opaque 180×180 apple-touch icon as PNG bytes. */
export function renderIconPng(size = ICON_SIZE) {
  return encodePng(size, size, renderIconRgba(size));
}

export const ICON_SIZE_PX = ICON_SIZE;
