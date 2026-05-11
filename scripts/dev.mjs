#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const source = join(root, "wrangler.jsonc");
const tempDir = mkdtempSync(join(tmpdir(), "cloudbox-dev-"));
const tempConfig = join(tempDir, "wrangler.jsonc");
const config = JSON.parse(readFileSync(source, "utf8"));

// Astro's local Cloudflare dev adapter currently fails if the wrangler config
// contains Workers Containers: "Build ID should be set if containers are defined
// and enabled". Keep production wrangler.jsonc truthful, but hand Astro a local
// config without the Container-only pieces. The /api/runs route will still use
// the local demo fallback when CLOUDBOX_RUNNER is absent.
if (Array.isArray(config.durable_objects?.bindings)) {
  config.durable_objects.bindings = config.durable_objects.bindings.filter(
    (binding) => binding.name !== "CLOUDBOX_RUNNER",
  );
}
if (Array.isArray(config.migrations)) {
  config.migrations = config.migrations.filter(
    (migration) => !migration.new_sqlite_classes?.includes("CloudboxRunner"),
  );
}
delete config.containers;

writeFileSync(tempConfig, `${JSON.stringify(config, null, 2)}\n`);

const child = spawn(
  "bun",
  ["--filter", "@cloudbox/web", "dev", "--", "--host", "127.0.0.1", ...process.argv.slice(2)],
  { cwd: root, stdio: "inherit", env: { ...process.env, WRANGLER_CONFIG: tempConfig } },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
