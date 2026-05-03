import { chromium } from "playwright";

const baseUrl = process.env.CLOUDBOX_E2E_URL ?? "http://127.0.0.1:8787";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Generate a realistic work computer/i }).waitFor();
  await page.getByText(/Margaret Elaine Forsythe/i).waitFor();
  await page.getByRole("button", { name: "Artifacts" }).click();
  await page.getByRole("heading", { name: "Final Recommendation Package" }).waitFor();
  await page.getByRole("button", { name: "Collaborators" }).click();
  await page.getByRole("heading", { name: "David Hartley" }).waitFor();
  await page.getByRole("button", { name: "Simulation Log" }).click();
  await page.getByRole("heading", { name: /Advanced 2026 model portfolio refresh/i }).first().waitFor();
  await page.getByRole("button", { name: "Retrospective" }).click();
  await page.getByText(/retrospective score/i).waitFor();
  const generated = page.waitForResponse((response) => response.url().includes("/api/generate") && response.status() === 201);
  await page.getByRole("button", { name: /Generate another synthetic computer/i }).click();
  await generated;
  await page.getByRole("heading", { name: "Profile" }).waitFor();
  console.log(`E2E passed against ${baseUrl}`);
} finally {
  await browser.close();
}
