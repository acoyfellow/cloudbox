import type { ContainerRunRequest, ContainerRunResult } from "./container-runner.ts";
import { createAgentComputer } from "./agent-computer.ts";

export type CloudboxClientOptions = {
  baseUrl?: string;
  token?: string;
  fetcher?: typeof fetch;
};

export function createCloudbox({ baseUrl = "", token, fetcher = fetch }: CloudboxClientOptions = {}) {
  return {
    async boot(input: { repo: string; timeoutMs?: number }) {
      return createAgentComputer({ baseUrl, token, fetcher }).boot(input);
    },
    async run(input: ContainerRunRequest): Promise<ContainerRunResult & { runId?: string }> {
      const response = await fetcher(`${baseUrl}/api/runs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });
      const body = await response.json().catch(() => null) as (ContainerRunResult & { runId?: string; detail?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.detail ?? body?.error ?? `Cloudbox run failed: ${response.status}`);
      return body;
    },
  };
}
