import { createCloudbox } from "./client.ts";
import type { ContainerRunRequest, ContainerRunResult } from "./container-runner.ts";

export type ObjectGenerator<T> = (input: { schema: unknown; prompt: string }) => Promise<T> | T;

export type ProofAgent<T extends ContainerRunRequest = ContainerRunRequest> = {
  generateObject: ObjectGenerator<T>;
};

export type GenerateProofOptions<T extends ContainerRunRequest = ContainerRunRequest> = {
  agent: ProofAgent<T>;
  schema: unknown;
  prompt: string;
  cloudboxUrl?: string;
  token?: string;
  fetcher?: typeof fetch;
};

export async function generateProof<T extends ContainerRunRequest = ContainerRunRequest>({
  agent,
  schema,
  prompt,
  cloudboxUrl = "",
  token,
  fetcher = fetch,
}: GenerateProofOptions<T>): Promise<ContainerRunResult & { runId?: string }> {
  const plan = await agent.generateObject({ schema, prompt });
  return createCloudbox({ baseUrl: cloudboxUrl, token, fetcher }).run(plan);
}
