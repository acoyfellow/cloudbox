export const COMPUTER_HOME = "/home/user";

type SandboxFile = { content?: string | Uint8Array };
export type ComputerSandbox = {
  exec(command: string, options?: { cwd?: string; timeout?: number; origin?: string; env?: Record<string, string> }): Promise<{ success: boolean; stdout?: string; stderr?: string; exitCode?: number }>;
  readFile(path: string): Promise<SandboxFile>;
  writeFile(path: string, content: string): Promise<unknown>;
  configureGitLabTransport?: (params: { ownerId: string; computerId: string }) => Promise<void>;
};
export type SandboxComputerBindings = {
  CLOUDBOX_SANDBOX?: DurableObjectNamespace;
  getComputerSandbox?: (ownerKey: string) => ComputerSandbox;
  configureComputerTransport?: (ownerKey: string, params: { ownerId: string; computerId: string }) => Promise<void>;
};

export type ComputerOwner = {
  id: string;
};

function ownerKey(owner: ComputerOwner): string {
  const key = owner.id.trim().toLowerCase();
  if (!key) throw new Error("computer owner identity is required");
  return key;
}

export async function getOwnerComputer(env: SandboxComputerBindings, owner: ComputerOwner): Promise<ComputerSandbox> {
  const key = `computer:${ownerKey(owner)}`;
  if (env.getComputerSandbox) return env.getComputerSandbox(key);
  if (!env.CLOUDBOX_SANDBOX) throw new Error("CLOUDBOX_SANDBOX binding is unavailable");
  // Keep the Sandbox SDK out of unit-test module evaluation: its upstream
  // containers package is Workers/bundler-oriented rather than Node ESM-safe.
  const { getSandbox } = await import("@cloudflare/sandbox");
  return getSandbox(env.CLOUDBOX_SANDBOX as never, key, {
    containerTimeouts: { instanceGetTimeoutMS: 120_000, portReadyTimeoutMS: 240_000 },
  }) as unknown as ComputerSandbox;
}

export function assertComputerPath(path: string): void {
  if (!path.startsWith(`${COMPUTER_HOME}/`) || path.includes("/../") || path.endsWith("/..") || path.includes("\0")) {
    throw new Error(`path must be inside ${COMPUTER_HOME}/ without traversal segments`);
  }
}

export async function prepareOwnerComputer(env: SandboxComputerBindings, owner: ComputerOwner) {
  const sandbox = await getOwnerComputer(env, owner);
  await sandbox.exec(`mkdir -p ${COMPUTER_HOME}/.config ${COMPUTER_HOME}/src`, {
    cwd: "/",
    timeout: 30_000,
    origin: "internal",
  });
  return sandbox;
}

export async function enableOwnerGitLabTransport(env: SandboxComputerBindings, sandbox: ComputerSandbox, owner: ComputerOwner): Promise<void> {
  const id = owner.id.trim().toLowerCase();
  const params = { ownerId: id, computerId: `personal:${id}` };
  if (sandbox.configureGitLabTransport) return sandbox.configureGitLabTransport(params);
  if (env.configureComputerTransport) return env.configureComputerTransport(`computer:${id}`, params);
  if (!env.CLOUDBOX_SANDBOX) throw new Error("computer GitLab transport is not available in this runtime");
  const stub = env.CLOUDBOX_SANDBOX.get(env.CLOUDBOX_SANDBOX.idFromName(`computer:${id}`)) as unknown as { configureGitLabTransport?: (input: typeof params) => Promise<void> };
  if (!stub.configureGitLabTransport) throw new Error("computer GitLab transport is not available in this runtime");
  await stub.configureGitLabTransport(params);
}
