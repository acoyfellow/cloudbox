#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const image = process.env.CLOUDBOX_RUNNER_DESKTOP_IMAGE ?? "cloudbox-runner:desktop-pass1";
const container = process.env.CLOUDBOX_RUNNER_DESKTOP_CONTAINER ?? "cloudbox-runner-desktop-smoke";
const port = Number(process.env.CLOUDBOX_RUNNER_DESKTOP_PORT ?? 18081);
const out = process.env.CLOUDBOX_RUNNER_DESKTOP_PROOF_OUT ?? "artifacts/RUNNER_DESKTOP.md";
const build = !process.argv.includes("--skip-build");

function command(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", stdio: "pipe", ...options });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return result.stdout ?? "";
}

async function get(path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: response.status, text: await response.text() };
}

try {
  if (build) command("docker", ["build", "-t", image, "-f", "runner-desktop/Dockerfile", "runner"]);
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  command("docker", ["run", "-d", "--name", container, "-p", `${port}:8080`, image]);
  await new Promise((resolve) => setTimeout(resolve, 4000));

  const health = await get("/health");
  const shell = command("docker", ["exec", container, "bash", "-lc", "python3 - <<'PY'\nimport urllib.request\nprint(urllib.request.urlopen('http://127.0.0.1:7681/').read().decode('utf-8','ignore')[:1000])\nPY"]);
  const desktop = command("docker", ["exec", container, "bash", "-lc", "python3 - <<'PY'\nimport urllib.request\nprint(urllib.request.urlopen('http://127.0.0.1:6080/vnc.html').read().decode('utf-8','ignore')[:1000])\nPY"]);
  const processes = command("docker", ["exec", container, "bash", "-lc", "ps aux | grep -E 'server.mjs|shellinabox|websockify|x11vnc|Xvfb|fluxbox|chromium' | grep -v grep"]);
  const inspected = JSON.parse(command("docker", ["image", "inspect", image, "--format", "{{json .Size}}"]));
  const ok = health.status === 200 && /shellinabox|Shell In A Box/i.test(shell) && /noVNC|vnc/i.test(desktop) && /chromium/.test(processes);
  mkdirSync(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  writeFileSync(out, `# Runner Desktop Smoke\n\nStatus: ${ok ? "pass" : "fail"}\n\n- Image: ${image}\n- Image bytes: ${inspected}\n- Health: ${health.status}\n- Shell HTML: ${/shellinabox|Shell In A Box/i.test(shell)}\n- Desktop HTML: ${/noVNC|vnc/i.test(desktop)}\n- Chromium running: ${/chromium/.test(processes)}\n\n## Processes\n\n\`\`\`\n${processes}\n\`\`\`\n`);
  console.log(`${ok ? "RUNNER_DESKTOP_PASS" : "RUNNER_DESKTOP_FAIL"} ${out}`);
  if (!ok) process.exitCode = 1;
} finally {
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}
