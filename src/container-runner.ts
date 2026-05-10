export type ContainerRunRequest = {
  repo: string;
  commands?: string[];
  verify?: string[];
  artifact?: string;
  timeoutMs?: number;
};

export type ContainerRunReceipt = {
  type: "clone" | "command" | "verify" | "diff";
  cmd: string;
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
};

export type ContainerRunResult = {
  ok: boolean;
  receipts: ContainerRunReceipt[];
  artifact?: { path: string; content: string } | null;
  diff?: string;
  error?: string;
};

export async function runInContainer(runner: unknown, input: ContainerRunRequest): Promise<ContainerRunResult> {
  const binding = runner as { fetch?: typeof fetch; get?: (id: unknown) => { fetch: typeof fetch }; idFromName?: (name: string) => unknown } | undefined;
  let target: { fetch: typeof fetch } | undefined;
  if (binding?.fetch) target = binding as { fetch: typeof fetch };
  if (!target && binding?.get && binding.idFromName) target = binding.get(binding.idFromName("default"));
  if (!target?.fetch) throw new Error("CLOUDBOX_RUNNER container binding is not available");
  const response = await target.fetch("http://cloudbox-runner/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null) as ContainerRunResult | null;
  if (!response.ok || !body) throw new Error(`container run failed: ${response.status}`);
  return body;
}
