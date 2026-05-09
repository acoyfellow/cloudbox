import { createCloudboxTools } from "../src/think.ts";
import { runCloudboxAgent } from "../src/agent.ts";
import { agentLaunchSpec } from "../seed/agent-launch.ts";

// Example shape: after materializing agentLaunchSpec, give the id to the agent runner.
export async function runAgentLaunchExample(computerId: string, origin: string) {
  const tools = createCloudboxTools({ computerId, origin, fetcher: fetch });
  return runCloudboxAgent(agentLaunchSpec, tools);
}
