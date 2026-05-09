import { unstable_dev } from "wrangler";
import { spawn } from "node:child_process";

const worker = await unstable_dev("web/dist/_worker.js/index.js", {
  config: "wrangler.jsonc",
  local: true,
  experimental: { disableExperimentalWarning: true },
});

const base = `http://${worker.address}:${worker.port}`;
const child = spawn(process.execPath, ["scripts/e2e.mjs"], {
  stdio: "inherit",
  env: { ...process.env, CLOUDBOX_E2E_URL: base },
});

child.on("exit", async (code) => {
  await worker.stop();
  process.exit(code ?? 1);
});
