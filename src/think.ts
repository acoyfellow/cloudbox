// Cloudbox — Think bridge.
//
// `createCloudboxTools` returns a tool set you can spread into a Think
// agent's `getTools()`. The model gets `env_list`, `env_read`, `env_write`,
// `env_ask`, `env_submit` — the same protocol the curl examples use, with
// every call recorded as a receipt the rubric grader replays.
//
// Why an `env_` prefix: Think's built-in workspace tools own the unprefixed
// names (`read`, `write`, `list`, …) for the agent's own scratch. Cloudbox
// is the *outside* world the agent operates in. Different namespace, no
// collision.
//
// The consumer wraps each tool with `tool(...)` from "ai" if they want
// Zod-validated inputs. The returned shape is the underlying contract:
// description + JSON-schema params + async execute.

export type CloudboxToolFetcher = (
  request: Request | string,
  init?: RequestInit,
) => Promise<Response>;

export type CloudboxToolsConfig = {
  /** The materialized computer's id, e.g. "cb_abcd1234". */
  computerId: string;
  /**
   * How to talk to the Cloudbox Worker. Pass:
   *   - A Service Binding (`env.CLOUDBOX.fetch.bind(env.CLOUDBOX)`)
   *   - The same Worker's own fetch (`fetch`)
   *   - Anything that resolves to a Cloudbox Worker URL.
   */
  fetcher: CloudboxToolFetcher;
  /**
   * Origin for the fetch URLs. Defaults to "https://cloudbox.local".
   * Service Bindings ignore the host; this is just for URL construction.
   */
  origin?: string;
  headers?: Record<string, string>;
};

export type CloudboxTool = {
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required: string[] };
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Build the five `env_*` tools for a materialized Cloudbox.
 *
 * @example
 *   import { Think } from "@cloudflare/think";
 *   import { createCloudboxTools } from "cloudbox/think";
 *
 *   export class TriageAgent extends Think<Env> {
 *     getModel() { ... }
 *     getTools() {
 *       return createCloudboxTools({
 *         computerId: env.CLOUDBOX_COMPUTER_ID,
 *         fetcher: env.CLOUDBOX.fetch.bind(env.CLOUDBOX),
 *       });
 *     }
 *   }
 */
export function createCloudboxTools(
  config: CloudboxToolsConfig,
): Record<"env_list" | "env_read" | "env_write" | "env_ask" | "env_submit", CloudboxTool> {
  const origin = config.origin ?? "https://cloudbox.local";
  const base = `${origin}/api/c/${config.computerId}`;

  const get = async (path: string): Promise<unknown> => {
    const r = await config.fetcher(`${base}${path}`, { headers: config.headers });
    if (!r.ok) throw new Error(`cloudbox ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  };

  const post = async (path: string, body: unknown): Promise<unknown> => {
    const r = await config.fetcher(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(config.headers ?? {}) },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`cloudbox ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  };

  return {
    env_list: {
      description:
        "List every file in the Cloudbox environment. Returns paths, kinds, and states.",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async () => get("/list"),
    },

    env_read: {
      description:
        "Read a file from the Cloudbox environment. Returns its content. The rubric records what you read; reading the design doc before the diff is often important.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path, e.g. docs/auth-redesign.md" },
        },
        required: ["path"],
      },
      execute: async (args) => get(`/read?path=${encodeURIComponent(String(args.path))}`),
    },

    env_write: {
      description:
        "Write content to a file in the Cloudbox environment. Creates a new file or overwrites an existing one.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path." },
          content: { type: "string", description: "File content (text)." },
        },
        required: ["path", "content"],
      },
      execute: async (args) => post("/write", { path: args.path, content: args.content }),
    },

    env_ask: {
      description:
        "Ask a collaborator a question. Use the collaborator's `id` (from env_list / spec, e.g. 'arch'). Their reply is recorded; the rubric may check whether you asked the right person.",
      parameters: {
        type: "object",
        properties: {
          who: { type: "string", description: "Collaborator id." },
          message: { type: "string", description: "Your question to them." },
        },
        required: ["who", "message"],
      },
      execute: async (args) => post("/ask", { who: args.who, message: args.message }),
    },

    env_submit: {
      description:
        "Submit a decision or deliverable for an objective. Required to complete the run. Use the objective's `id` and the chosen `decision` (e.g. 'approve' / 'request-changes').",
      parameters: {
        type: "object",
        properties: {
          objective: { type: "string", description: "Objective id." },
          decision: { type: "string", description: "Your chosen decision (free-form string)." },
          notes: { type: "string", description: "Optional notes / rationale." },
        },
        required: ["objective"],
      },
      execute: async (args) =>
        post("/submit", {
          objective: args.objective,
          decision: args.decision,
          notes: args.notes,
        }),
    },
  };
}
