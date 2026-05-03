import { generateArtifact, exportManifest } from "../../../packages/artifacts/src/index.ts";
import { evaluateComputer } from "../../../packages/evals/src/index.ts";
import {
  buildSyntheticComputer,
  seededComputer,
  type PersonaInput,
  type SyntheticComputer,
} from "../../../packages/synthetic-computer/src/index.ts";

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
      if (env.ASSETS && url.pathname === "/demo") {
        return env.ASSETS.fetch(new Request(new URL("/demo.html", url.origin), request));
      }
      if (env.ASSETS && (url.pathname === "/docs" || url.pathname.startsWith("/docs/"))) {
        const page = docsPage(url.pathname);
        return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Not Found", { status: 404 });
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

function docsPage(pathname: string): string {
  const docs: Record<string, { title: string; body: string }> = {
    "/docs": {
      title: "Start here",
      body: `
        <p>Cloudbox creates synthetic work environments for long-horizon agent evals. The fastest path is: inspect the live demo, deploy your own Worker, then generate one environment from a role description.</p>
        <pre><code>bun install
bunx wrangler dev --local --port 8799</code></pre>
        <p>The deployed app includes the homepage, docs, demo, API, D1, R2, Queue, and Workers AI binding in one Cloudflare Worker.</p>
      `,
    },
    "/docs/quickstart": {
      title: "Quickstart",
      body: `
        <ol>
          <li>Click <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/cloudbox">Deploy to Cloudflare</a>.</li>
          <li>Open your Worker URL and inspect the dogfooded run.</li>
          <li>Go to <a href="/demo">/demo</a> and generate another Cloudbox from your own persona.</li>
          <li>Use <code>/api/export</code> to download the manifest.</li>
        </ol>
      `,
    },
    "/docs/concepts": {
      title: "Concepts",
      body: `
        <h2>Cloudbox</h2><p>A synthetic work environment: files, assignments, collaborators, activity history, artifacts, and scorecard.</p>
        <h2>Work brief</h2><p>The job an agent must complete inside the environment.</p>
        <h2>Evidence</h2><p>The files read, files created, messages exchanged, and daily work log.</p>
        <h2>Scorecard</h2><p>Rubric results plus strengths, failure modes, and extracted lessons.</p>
      `,
    },
    "/docs/api": {
      title: "API",
      body: `
        <pre><code>GET  /api/demo
POST /api/generate
POST /api/runs
GET  /api/artifacts/:id
GET  /api/export</code></pre>
        <p><code>POST /api/generate</code> accepts <code>{ text, mode }</code>. Mode is <code>demo</code>, <code>short</code>, or <code>full-paper</code>.</p>
      `,
    },
    "/docs/research": {
      title: "Research mapping",
      body: `
        <p>Cloudbox implements the main ideas from <em>Synthetic Computers at Scale for Long-Horizon Productivity Simulation</em> as a deployable Cloudflare product.</p>
        <ul>
          <li><strong>Persona expansion:</strong> <code>expandPersona</code> creates user profile, role, projects, tools, and work habits.</li>
          <li><strong>Filesystem planning:</strong> <code>planFilesystem</code> creates paths, artifacts, timestamps, and dependencies.</li>
          <li><strong>Artifact generation:</strong> <code>generateArtifact</code> creates downloadable productivity artifacts.</li>
          <li><strong>Collaboration setup:</strong> <code>createCollaborators</code> creates simulated collaborators with private reference files.</li>
          <li><strong>Long-horizon simulation:</strong> <code>runSimulation</code> records daily work, messages, and deliverables.</li>
          <li><strong>Trajectory analysis:</strong> <code>evaluateComputer</code> emits scorecard, failures, strengths, and lessons.</li>
        </ul>
      `,
    },
  };
  const doc = docs[pathname] ?? docs["/docs"];
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cloudbox Docs · ${doc.title}</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body data-page="docs">
    <header class="site-header">
      <a class="brand" href="/">Cloudbox</a>
      <nav>
        <a href="/docs">Docs</a>
        <a href="/demo">Demo</a>
        <a href="https://github.com/acoyfellow/cloudbox">GitHub</a>
      </nav>
    </header>
    <main class="docs-layout">
      <aside class="docs-nav">
        <a href="/docs">Start</a>
        <a href="/docs/quickstart">Quickstart</a>
        <a href="/docs/concepts">Concepts</a>
        <a href="/docs/api">API</a>
        <a href="/docs/research">Research</a>
      </aside>
      <article class="doc-page" id="doc-page"><h1>${doc.title}</h1>${doc.body}</article>
    </main>
  </body>
</html>`;
}
