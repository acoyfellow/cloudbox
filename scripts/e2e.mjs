import { chromium } from "playwright";

const baseUrl = process.env.CLOUDBOX_E2E_URL ?? "http://127.0.0.1:8787";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(`${baseUrl}/demo`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Demo/i }).waitFor();
  await page.getByRole("button", { name: /Run agent/i }).click();
  await page.getByText(/README\.md/).first().waitFor();
  await page.getByText(/docs\/quickstart\.md/).first().waitFor();
  await page.getByText(/skeptic/).first().waitFor();
  await page.waitForFunction(() => document.body.textContent?.includes("grade"));
  console.log(`BROWSER_E2E_PASS ${baseUrl}`);
} finally {
  await browser.close();
}
