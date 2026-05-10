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
  let fetcher = binding?.fetch?.bind(binding);
  if (!fetcher && binding?.get && binding.idFromName) {
    fetcher = binding.get(binding.idFromName("default")).fetch;
  }
  if (!fetcher) throw new Error("CLOUDBOX_RUNNER container binding is not available");
  const response = await fetcher("http://cloudbox-runner/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null) as ContainerRunResult | null;
  if (!response.ok || !body) throw new Error(`container run failed: ${response.status}`);
  return body;
}
