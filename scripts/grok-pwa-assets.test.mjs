import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ICON_FILE,
  MANIFEST_FILE,
  iconUrl,
  renderIconPng,
  renderStaticManifest,
} from "./grok-pwa-assets.mjs";
import { grokPwaHeadTags } from "./grok-pwa-shared.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("static manifest points at the generated icon and brand colours", () => {
  const manifest = JSON.parse(renderStaticManifest({ title: "Slingline", color: "121418" }));
  assert.equal(manifest.name, "Slingline");
  assert.equal(manifest.short_name, "Slingline");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#121418");
  assert.equal(manifest.theme_color, "#121418");
  assert.deepEqual(manifest.icons, [
    { src: "/__grok/icon-180.png", sizes: "180x180", type: "image/png" },
  ]);
});

test("static manifest falls back when the og card is absent", () => {
  const manifest = JSON.parse(renderStaticManifest({}));
  assert.equal(manifest.name, "Slingline");
  assert.equal(manifest.theme_color, "#121418");
});

test("static manifest follows a subpath base", () => {
  const manifest = JSON.parse(
    renderStaticManifest({ title: "Slingline", color: "121418" }, "/slingline/"),
  );
  assert.equal(manifest.id, "/slingline/");
  assert.equal(manifest.start_url, "/slingline/");
  assert.equal(manifest.scope, "/slingline/");
  assert.equal(manifest.icons[0].src, "/slingline/__grok/icon-180.png");
  assert.equal(iconUrl("slingline"), "/slingline/__grok/icon-180.png");
});

test("head tags follow the same base", () => {
  const tags = grokPwaHeadTags("Slingline", "/slingline/")
    .map(([, tag]) => tag)
    .join("");
  assert.ok(tags.includes('href="/slingline/__grok/manifest.webmanifest"'));
  assert.ok(tags.includes('href="/slingline/__grok/icon-180.png"'));
  assert.ok(!tags.includes('href="/__grok/'));
});

test("generated icon is an opaque 180x180 RGBA png", () => {
  const png = renderIconPng();
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
  assert.equal(png[24], 8); // bit depth
  assert.equal(png[25], 6); // colour type RGBA
  assert.ok(png.length > 2000, `png only ${png.length} bytes`);
});

test("plugin emits both URLs into the client bundle", () => {
  assert.equal(MANIFEST_FILE, "__grok/manifest.webmanifest");
  assert.equal(ICON_FILE, "__grok/icon-180.png");
  const plugin = readFileSync(join(ROOT, "scripts/grok-pwa-plugin.mjs"), "utf8");
  assert.match(plugin, /this\.environment\?\.name !== "client"/);
  assert.match(plugin, /renderStaticManifest\(readOgSite\(root\), base\)/);
  assert.match(plugin, /renderIconPng\(\)/);
});
