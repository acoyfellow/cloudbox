import { chromium } from "playwright";

const baseUrl = process.env.CLOUDBOX_E2E_URL ?? "http://127.0.0.1:8787";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Give agents fake jobs/i }).waitFor();
  await page.getByText(/dogfooded run/i).waitFor();
  await page.getByRole("link", { name: "Read the docs" }).click();
  await page.getByRole("heading", { name: "Start here" }).waitFor();
  await page.goto(`${baseUrl}/demo`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Inspect a complete Cloudbox/i }).waitFor();
  await page.getByText(/Margaret Elaine Forsythe/i).waitFor();
  await page.getByRole("button", { name: "Downloads" }).click();
  await page.getByRole("heading", { name: "Final Recommendation Package" }).waitFor();
  await page.getByRole("button", { name: "Work Brief" }).click();
  await page.getByText(/David Hartley/i).waitFor();
  await page.getByRole("button", { name: "Evidence" }).click();
  await page.getByRole("heading", { name: /Advanced 2026 model portfolio refresh/i }).first().waitFor();
  await page.getByRole("button", { name: "Scorecard" }).click();
  await page.getByRole("heading", { name: /scorecard/i }).waitFor();
  const generated = page.waitForResponse((response) => response.url().includes("/api/generate") && response.status() === 201);
  await page.getByRole("button", { name: /Generate another Cloudbox/i }).click();
  await generated;
  await page.getByRole("heading", { name: "Profile" }).waitFor();
  console.log(`E2E passed against ${baseUrl}`);
} finally {
  await browser.close();
}
