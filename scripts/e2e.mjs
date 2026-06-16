import { chromium } from "playwright";

const baseUrl = process.env.CLOUDBOX_E2E_URL ?? "http://127.0.0.1:8787";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(`${baseUrl}/demo`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Run a repo in Cloudbox/i }).waitFor();
  await page.getByText(/Define the run/i).waitFor();
  await page.getByText(/Inspect the proof/i).waitFor();
  await page.getByRole("button", { name: /Run in Cloudbox/i }).click();
  await page.getByText("cloudbox-container-ok", { exact: true }).waitFor({ timeout: 60_000 });
  await page.getByText(/runner/i).first().waitFor();
  await page.getByText(/Verify/i).first().waitFor();
  console.log(`BROWSER_E2E_PASS ${baseUrl}`);
} finally {
  await browser.close();
}
