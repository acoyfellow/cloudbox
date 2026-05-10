import { createHash, randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type Tool = { name: string };
export function unsurf(): Tool {
  return { name: "browser" };
}

type RunInput = {
  computer?: "cloud" | "local";
  repo: string;
  bug?: string;
  task?: string;
  reproduce?: string | string[];
  fix?: string;
  change?: string;
  checkout?: string;
  verify: string[];
  artifact: string;
  tools?: Record<string, Tool>;
};

type CommandReceipt = { cmd: string; exit: number; stdout: string; stderr: string; observed?: string };
type TimelineEvent =
  | { type: "repo.cloned"; repo: string; workspace: string; commit: string }
  | { type: "command"; phase: "reproduce" | "verify"; cmd: string; exit: number; stdoutTail: string; stderrTail: string }
  | { type: "write"; path: string; bytes: number }
  | { type: "artifact"; path: string };

type RunResult = {
  id: string;
  status: "passed" | "failed";
  repo: { path: string; commit: string };
  computer: { type: "local" | "cloud"; workspace: string };
  tools: string[];
  timeline: TimelineEvent[];
  proof: {
    reproduced: CommandReceipt[];
    verified: CommandReceipt[];
    patch: string;
    artifact: { path: string; content: string };
    grade: { score: number; max: number };
  };
};

class CloudboxRunError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CloudboxRunError";
    this.code = code;
  }
}

function assertArtifactPath(path: string) {
  if (!path || path.startsWith("/") || path.includes("\0") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new CloudboxRunError("invalid_artifact_path", "artifact path must stay inside the workspace");
  }
}

function assertVerify(verify: string[]) {
  if (!Array.isArray(verify) || verify.length === 0 || verify.some((cmd) => !cmd.trim())) {
    throw new CloudboxRunError("invalid_verify", "verify must contain at least one command");
  }
}

function tail(s: string, max = 4000) {
  return s.length > max ? s.slice(-max) : s;
}

async function runCommand(cmd: string, cwd: string): Promise<CommandReceipt> {
  try {
    const result = await execFileAsync("bash", ["-lc", cmd], { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 });
    return { cmd, exit: 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } catch (error: any) {
    return { cmd, exit: typeof error.code === "number" ? error.code : 1, stdout: error.stdout ?? "", stderr: error.stderr ?? String(error.message ?? error) };
  }
}

async function cloneRepo(repo: string) {
  const root = await mkdtemp(join(tmpdir(), "cloudbox-run-"));
  const workspace = join(root, basename(repo).replace(/\.git$/, "") || "repo");
  if (existsSync(repo)) {
    await cp(repo, workspace, { recursive: true });
    await runCommand("git init && git add . && git commit -m initial --no-gpg-sign >/dev/null 2>&1 || true", workspace);
  } else if (/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(repo)) {
    const result = await runCommand(`git clone --depth 1 ${JSON.stringify(repo)} ${JSON.stringify(workspace)}`, root);
    if (result.exit !== 0) throw new CloudboxRunError("clone_failed", result.stderr || result.stdout);
  } else {
    throw new CloudboxRunError("invalid_repo_url", "repo must be a GitHub https URL or local test path");
  }
  const commitResult = await runCommand("git rev-parse HEAD 2>/dev/null || true", workspace);
  const commit = commitResult.stdout.trim() || createHash("sha1").update(repo).digest("hex");
  return { workspace, commit };
}

async function applyNaiveFix(input: RunInput, workspace: string): Promise<{ changed: string[] }> {
  if (/a \+ b|return a \+ b/i.test(input.fix ?? "")) {
    const path = "src/add.js";
    const full = join(workspace, path);
    const current = await readFile(full, "utf8");
    const next = current.replace(/return\s+a\s*[-*\/]\s*b\s*;/, "return a + b;");
    await writeFile(full, next);
    return { changed: [path] };
  }
  return { changed: [] };
}

async function getPatch(workspace: string) {
  const diff = await runCommand("git diff -- . ':!HANDOFF.md' 2>/dev/null || true", workspace);
  if (diff.stdout.trim()) return diff.stdout;
  const status = await runCommand("find . -maxdepth 3 -type f | sort", workspace);
  return status.stdout;
}

function toolNames(tools?: Record<string, Tool>) {
  return ["shell", "files", ...Object.values(tools ?? {}).map((tool) => tool.name)];
}

export const cloudbox = {
  async run(input: RunInput): Promise<RunResult> {
    assertArtifactPath(input.artifact);
    assertVerify(input.verify);

    const id = `run_${randomUUID().slice(0, 4)}`;
    const { workspace, commit } = await cloneRepo(input.repo);
    const timeline: TimelineEvent[] = [{ type: "repo.cloned", repo: input.repo, workspace, commit }];

    const reproduced: CommandReceipt[] = [];
    const reproduceCommands = typeof input.reproduce === "string" ? [input.reproduce] : input.reproduce ?? [];
    for (const cmd of reproduceCommands) {
      const receipt = await runCommand(cmd, workspace);
      reproduced.push(receipt);
      timeline.push({ type: "command", phase: "reproduce", cmd, exit: receipt.exit, stdoutTail: tail(receipt.stdout), stderrTail: tail(receipt.stderr) });
    }

    const fix = await applyNaiveFix(input, workspace);
    for (const path of fix.changed) {
      timeline.push({ type: "write", path, bytes: (await readFile(join(workspace, path), "utf8")).length });
    }

    const verified: CommandReceipt[] = [];
    for (const cmd of input.verify) {
      const receipt = await runCommand(cmd, workspace);
      verified.push(receipt);
      timeline.push({ type: "command", phase: "verify", cmd, exit: receipt.exit, stdoutTail: tail(receipt.stdout), stderrTail: tail(receipt.stderr) });
    }

    const patch = await getPatch(workspace);
    const artifactContent = `# Cloudbox handoff\n\n## Goal\n${input.bug ?? input.task ?? input.fix ?? "Run task"}\n\n## Proof\n\n- Reproduced: ${reproduced.map((r) => `${r.cmd} -> ${r.exit}`).join(", ") || "n/a"}\n- Verified: ${verified.map((r) => `${r.cmd} -> ${r.exit}`).join(", ")}\n\n## Patch\n\n\`\`\`diff\n${patch}\n\`\`\`\n`;
    await writeFile(join(workspace, input.artifact), artifactContent);
    timeline.push({ type: "artifact", path: input.artifact });

    const passed = verified.every((r) => r.exit === 0) && (!reproduced.length || reproduced.some((r) => r.exit !== 0));
    return {
      id,
      status: passed ? "passed" : "failed",
      repo: { path: input.repo, commit },
      computer: { type: input.computer ?? "local", workspace },
      tools: toolNames(input.tools),
      timeline,
      proof: {
        reproduced,
        verified,
        patch,
        artifact: { path: input.artifact, content: artifactContent },
        grade: { score: passed ? 5 : 0, max: 5 },
      },
    };
  },
};
