import { assertComputerPath, prepareOwnerComputer, type SandboxComputerBindings } from "./sandbox-computer.ts";

export const COMPUTER_CODE_CATALOG = [
  { name: "info", description: "Return the delegated computer and home directory." },
  { name: "list", description: "List files below an absolute /home/user path." },
  { name: "read", description: "Read one text file below /home/user." },
  { name: "write", description: "Write one text file below /home/user." },
  { name: "exec", description: "Execute one bounded command in /home/user." },
  { name: "repo_status", description: "Return porcelain Git status for a repository below /home/user." },
  { name: "repo_diff", description: "Return the Git diff for a repository below /home/user." },
] as const;

export type ComputerCodeBindings = SandboxComputerBindings & { LOADER?: unknown };

type CodeExecution = { result?: unknown; logs?: unknown[]; error?: string };

function path(value: unknown, fallback = "/home/user"): string {
  const candidate = typeof value === "string" && value ? value : fallback;
  if (candidate !== "/home/user") assertComputerPath(candidate);
  return candidate;
}

export async function executeComputerCode(env: ComputerCodeBindings, ownerId: string, code: string): Promise<CodeExecution> {
  if (!env.LOADER) throw new Error("LOADER binding is required for Computer Code Mode");
  if (!code || new TextEncoder().encode(code).byteLength > 32_000) throw new Error("code is required and must be <= 32000 bytes");
  const sandbox = await prepareOwnerComputer(env, { id: ownerId });
  const exec = async (command: string, cwd: string, timeoutMs = 30_000) => {
    const result = await sandbox.exec(command, { cwd, timeout: Math.min(Math.max(timeoutMs, 1), 120_000) });
    return { ok: result.success, exitCode: result.exitCode ?? (result.success ? 0 : 1), stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
  const fns: Record<string, (input: any) => Promise<unknown>> = {
    info: async () => ({ ownerId, home: "/home/user" }),
    list: async (input) => exec(`find ${JSON.stringify(path(input?.path))} -maxdepth ${Math.min(Math.max(Number(input?.depth ?? 1), 1), 4)} -print | head -500`, "/home/user"),
    read: async (input) => {
      const filePath = path(input?.path);
      const file = await sandbox.readFile(filePath);
      const content = typeof file.content === "string" ? file.content : file.content instanceof Uint8Array ? new TextDecoder().decode(file.content) : "";
      return { path: filePath, content };
    },
    write: async (input) => {
      const filePath = path(input?.path);
      if (typeof input?.content !== "string" || input.content.length > 200_000) throw new Error("content must be a string <= 200000 chars");
      await sandbox.writeFile(filePath, input.content);
      return { path: filePath, bytes: new TextEncoder().encode(input.content).byteLength };
    },
    exec: async (input) => {
      if (typeof input?.command !== "string" || !input.command || input.command.length > 2_000) throw new Error("command is required and must be <= 2000 chars");
      return exec(input.command, path(input.cwd), Number(input.timeoutMs ?? 30_000));
    },
    repo_status: async (input) => exec("git status --short --branch", path(input?.path)),
    repo_diff: async (input) => exec("git diff --no-ext-diff --", path(input?.path)),
  };
  // Keep the Worker-only package out of Node/Vitest module evaluation.
  const { DynamicWorkerExecutor } = await import("@cloudflare/codemode");
  const executor = new DynamicWorkerExecutor({ loader: env.LOADER as never, globalOutbound: null, timeout: 30_000 });
  return executor.execute(code, [{ name: "computer", fns }]) as Promise<CodeExecution>;
}
