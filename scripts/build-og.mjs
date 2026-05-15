#!/usr/bin/env node
// Render web/public/og.svg → web/public/og.png at 1200×630.
// Uses Playwright (already a devDependency). Run manually when the SVG changes.

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const svgPath = resolve(root, "web/public/og.svg");
const pngPath = resolve(root, "web/public/og.png");

const svg = readFileSync(svgPath, "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#0B0D10}
  svg{display:block;width:1200px;height:630px}
</style></head><body>${svg}</body></html>`;

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(50);
  const buf = await page.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width: 1200, height: 630 },
    omitBackground: false,
  });
  writeFileSync(pngPath, buf);
  console.log(`wrote ${pngPath} (${buf.length} bytes)`);
} finally {
  await browser.close();
}
