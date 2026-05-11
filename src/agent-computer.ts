import { createCloudbox, type CloudboxClientOptions } from "./client.ts";
import type { ContainerRunResult } from "./container-runner.ts";

export type ToolName = "shell" | "read" | "write";

export type BootOptions = {
  repo: string;
  timeoutMs?: number;
};

export type BoxTool = {
  description: string;
  parameters: unknown;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

export type AgentBox = {
  repo: string;
  shell: (cmd: string) => Promise<ContainerRunResult>;
  read: (path: string) => Promise<ContainerRunResult>;
  write: (path: string, content: string) => Promise<ContainerRunResult>;
  tools: (names?: ToolName[]) => Record<ToolName, BoxTool>;
  submit: (artifact: string) => Promise<ContainerRunResult & { runId?: string }>;
};

export function createAgentComputer(options: CloudboxClientOptions = {}) {
  const cloudbox = createCloudbox(options);

  return {
    async boot({ repo, timeoutMs = 30_000 }: BootOptions): Promise<AgentBox> {
      const history: string[] = [];
      let submittedArtifact = "HANDOFF.md";
      const run = (commands: string[], artifact = submittedArtifact) => cloudbox.run({ repo, commands, artifact, timeoutMs });
      const box: AgentBox = {
        repo,
        async shell(cmd) {
          history.push(cmd);
          return run([cmd]);
        },
        async read(path) {
          return run([`test -f ${quote(path)} && cat ${quote(path)}`]);
        },
        async write(path, content) {
          history.push(`write ${path}`);
          return run([`cat > ${quote(path)} <<'CLOUDBOX_EOF'\n${content}\nCLOUDBOX_EOF`], path);
        },
        tools(names = ["shell", "read", "write"]) {
          const all: Record<ToolName, BoxTool> = {
            shell: { description: "Run a shell command inside the Cloudbox computer.", parameters: { type: "object", properties: { cmd: { type: "string" } }, required: ["cmd"] }, execute: ({ cmd }) => box.shell(String(cmd)) },
            read: { description: "Read a file from the Cloudbox computer.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }, execute: ({ path }) => box.read(String(path)) },
            write: { description: "Write a file in the Cloudbox computer.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] }, execute: ({ path, content }) => box.write(String(path), String(content)) },
          };
          return Object.fromEntries(names.map((name) => [name, all[name]])) as Record<ToolName, BoxTool>;
        },
        async submit(artifact) {
          submittedArtifact = artifact;
          return cloudbox.run({ repo, commands: history.length ? history : [`test -f ${quote(artifact)}`], verify: [`test -f ${quote(artifact)}`], artifact, timeoutMs });
        },
      };
      return box;
    },
  };
}

function quote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
