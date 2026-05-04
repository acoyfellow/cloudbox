import { chromium } from "playwright";

const baseUrl = process.env.CLOUDBOX_E2E_URL ?? "http://127.0.0.1:8787";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Provision workspaces for testing AI agents/i }).waitFor();
  await page.getByText(/Example workspace/i).waitFor();
  await page.getByRole("navigation").getByRole("link", { name: "Docs" }).click();
  await page.getByRole("heading", { name: "Get started" }).waitFor();
  await page.goto(`${baseUrl}/demo`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Provision a workspace/i }).waitFor();
  await page.locator("dt").filter({ hasText: "Files" }).waitFor();
  await page.getByText(/score/i).first().waitFor();
  await page.getByText(/Final Recommendation Package/i).waitFor();
  const generated = page.waitForResponse((response) => response.url().includes("/api/generate") && response.status() === 201);
  await page.getByRole("button", { name: /Provision workspace/i }).click();
  await generated;
  await page.locator("dt").filter({ hasText: "Files" }).waitFor();
  console.log(`E2E passed against ${baseUrl}`);
} finally {
  await browser.close();
}
