#!/usr/bin/env node
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.CLOUDBOX_BROWSER_URL ?? process.env.CLOUDBOX_E2E_URL ?? "https://cloudbox.coey.dev";
const videoDir = process.env.CLOUDBOX_BROWSER_VIDEO_DIR ?? "artifacts/browser-agent-video";
const out = process.env.CLOUDBOX_BROWSER_VIDEO_PROOF_OUT ?? "artifacts/BROWSER_AGENT_VIDEO.md";
mkdirSync(videoDir, { recursive: true });
mkdirSync(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } } });
const page = await context.newPage();
let ok = false;
let title = "";
let error = "";
try {
  await page.goto(`${url}/demo`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByText("Run a repo in Cloudbox.").waitFor({ timeout: 15_000 });
  title = await page.title();
  await page.screenshot({ path: "artifacts/browser-agent-video.png", fullPage: true });
  ok = true;
} catch (err) {
  error = err instanceof Error ? err.message : String(err);
} finally {
  await context.close();
  await browser.close();
}

const videos = readdirSync(videoDir)
  .filter((name) => name.endsWith(".webm"))
  .map((name) => ({ path: join(videoDir, name), size: statSync(join(videoDir, name)).size }))
  .filter((file) => file.size > 0)
  .sort((a, b) => b.size - a.size);
const video = videos[0];
const passed = ok && Boolean(video);

writeFileSync(out, `# Browser Agent Video Smoke\n\nStatus: ${passed ? "pass" : "fail"}\n\n- URL: ${url}/demo\n- Page title: ${title}\n- Video: ${video?.path ?? "not captured"}\n- Video bytes: ${video?.size ?? 0}\n- Screenshot: artifacts/browser-agent-video.png\n\n${error ? `## Error\n\n\`\`\`\n${error}\n\`\`\`\n` : ""}`);

if (!passed) process.exit(1);
console.log(`BROWSER_AGENT_VIDEO_PASS ${video.path}`);
