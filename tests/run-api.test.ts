import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { agentBrowser, cloudbox } from "../src/run.ts";

async function createBuggyRepo() {
  const dir = await mkdtemp(join(tmpdir(), "cloudbox-fixture-"));
  await mkdir(join(dir, "src"));
  await mkdir(join(dir, "test"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ type: "module", scripts: { test: "node test/add.test.js", build: "node -e 'import(\"./src/add.js\")'" } }, null, 2));
  await writeFile(join(dir, "src/add.js"), "export function add(a, b) { return a - b; }\n");
  await writeFile(join(dir, "test/add.test.js"), "import assert from 'node:assert/strict';\nimport { add } from '../src/add.js';\nassert.equal(add(1, 2), 3);\n");
  return dir;
}

describe("cloudbox.run homepage API", () => {
  it("runs a bugfix in one repo and returns full proof", async () => {
    const repo = await createBuggyRepo();
    const run = await cloudbox.run({
      computer: "local",
      repo,
      bug: "add(1, 2) returns the wrong value",
      tools: { browser: agentBrowser() },
      reproduce: "npm test",
      fix: "make add return a + b",
      verify: ["npm run build", "npm test"],
      artifact: "HANDOFF.md",
    });

    expect(run.status).toBe("passed");
    expect(run.repo.path).toBe(repo);
    expect(run.repo.commit).toEqual(expect.any(String));
    expect(run.computer).toMatchObject({ type: "local", workspace: expect.any(String) });
    expect(run.tools).toEqual(["shell", "files", "browser"]);
    expect(run.proof.reproduced).toEqual([expect.objectContaining({ cmd: "npm test", exit: expect.any(Number) })]);
    expect(run.proof.reproduced[0].exit).not.toBe(0);
    expect(run.proof.verified).toEqual([
      expect.objectContaining({ cmd: "npm run build", exit: 0 }),
      expect.objectContaining({ cmd: "npm test", exit: 0 }),
    ]);
    expect(run.proof.patch).toContain("return a + b");
    expect(run.proof.artifact.path).toBe("HANDOFF.md");
    expect(run.proof.artifact.content).toContain("Proof");
    expect(run.proof.grade).toEqual({ score: 5, max: 5 });
    expect(run.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "repo.cloned" }),
      expect.objectContaining({ type: "command", phase: "reproduce", cmd: "npm test" }),
      expect.objectContaining({ type: "write", path: "src/add.js" }),
      expect.objectContaining({ type: "artifact", path: "HANDOFF.md" }),
    ]));
  });

  it("rejects artifact path escapes", async () => {
    await expect(cloudbox.run({
      computer: "local",
      repo: await createBuggyRepo(),
      task: "bad artifact",
      verify: ["npm test"],
      artifact: "../HANDOFF.md",
    })).rejects.toMatchObject({ code: "invalid_artifact_path" });
  });

  it("rejects runs without verification", async () => {
    await expect(cloudbox.run({
      computer: "local",
      repo: await createBuggyRepo(),
      task: "no verification",
      verify: [],
      artifact: "HANDOFF.md",
    })).rejects.toMatchObject({ code: "invalid_verify" });
  });
});
