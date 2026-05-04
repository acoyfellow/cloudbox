import { generateArtifact, exportManifest } from "../../../packages/artifacts/src/index.ts";
import { evaluateComputer } from "../../../packages/evals/src/index.ts";
import {
  buildSyntheticComputer,
  seededComputer,
  type PersonaInput,
  type SyntheticComputer,
} from "../../../packages/synthetic-computer/src/index.ts";
// Built by TanStack Start before deploy/check. The Worker owns API routes and
// delegates page rendering to the generated app server.
// @ts-expect-error The generated server exists after `bun run build`.
import appServer from "../dist/server/server.js";

export type Env = {
  DB?: D1Database;
  ARTIFACTS?: R2Bucket;
  RUNS?: Queue;
  AI?: Ai;
  ASSETS?: Fetcher;
  CLOUDBOX_MODEL?: string;
};

type QueuedRun = {
  id: string;
  persona: string;
  mode: PersonaInput["mode"];
};

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") return json({ ok: true, name: "cloudbox" });
      if (url.pathname === "/api/demo") return json(enrich(seededComputer));
      if (url.pathname === "/api/generate" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as Partial<PersonaInput>;
        const persona = typeof body.text === "string" && body.text.trim() ? body.text.trim() : seededComputer.persona;
        const mode = body.mode === "full-paper" ? "full-paper" : body.mode === "short" ? "short" : "demo";
        const computer = buildSyntheticComputer({ text: persona, mode });
        await persistComputer(env, computer, mode);
        return json(enrich(computer), { status: 201 });
      }
      if (url.pathname === "/api/runs" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as Partial<PersonaInput>;
        const run: QueuedRun = {
          id: crypto.randomUUID(),
          persona: typeof body.text === "string" && body.text.trim() ? body.text.trim() : seededComputer.persona,
          mode: body.mode === "full-paper" ? "full-paper" : "short",
        };
        await env.RUNS?.send(run);
        return json({ queued: true, runId: run.id, mode: run.mode }, { status: 202 });
      }
      const artifactMatch = url.pathname.match(/^\/api\/artifacts\/([^/]+)$/);
      if (artifactMatch) {
        const file = seededComputer.filesystem.files.find((candidate) => candidate.id === artifactMatch[1]);
        if (!file) return json({ error: "artifact_not_found" }, { status: 404 });
        const artifact = generateArtifact(file, seededComputer.profile);
        await env.ARTIFACTS?.put(`seed/${artifact.downloadName}`, artifact.body, {
          httpMetadata: { contentType: artifact.mimeType },
        });
        return new Response(toArrayBuffer(artifact.body), {
          headers: {
            "content-type": artifact.mimeType,
            "content-disposition": `attachment; filename="${artifact.downloadName}"`,
          },
        });
      }
      if (url.pathname === "/api/export") {
        const manifest = exportManifest(seededComputer.artifacts);
        await env.ARTIFACTS?.put("seed/manifest.json", manifest, {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
        return new Response(manifest, {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "content-disposition": 'attachment; filename="cloudbox-manifest.json"',
          },
        });
      }
      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404 || hasFileExtension(url.pathname)) return assetResponse;
      }
      return appServer.fetch(request, env);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  },

  async queue(batch: MessageBatch<QueuedRun>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const computer = buildSyntheticComputer({ text: message.body.persona, mode: message.body.mode });
      await persistComputer(env, computer, message.body.mode ?? "short", message.body.id);
      message.ack();
    }
  },
};

function enrich(computer: SyntheticComputer) {
  return {
    computer,
    retrospective: evaluateComputer(computer),
    links: {
      export: "/api/export",
      artifacts: computer.filesystem.files.map((file) => ({
        id: file.id,
        path: file.path,
        href: `/api/artifacts/${file.id}`,
      })),
    },
  };
}

async function persistComputer(env: Env, computer: SyntheticComputer, mode: string, runId = computer.simulation.id) {
  try {
    await env.DB?.prepare(
      "INSERT OR REPLACE INTO computers (id, name, persona, mode, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(computer.id, computer.name, computer.persona, mode, JSON.stringify(computer), computer.createdAt)
      .run();
    await env.DB?.prepare(
      "INSERT OR REPLACE INTO runs (id, computer_id, mode, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(runId, computer.id, mode, "complete", computer.createdAt, new Date().toISOString())
      .run();
  } catch (error) {
    console.warn("Cloudbox persistence skipped", error);
  }
}

function json(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value, null, 2), {
    ...init,
    headers: { ...jsonHeaders, ...init.headers },
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function hasFileExtension(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
}
