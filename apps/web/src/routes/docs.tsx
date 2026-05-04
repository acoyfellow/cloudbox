import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
});

function DocsPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[220px_1fr]">
      <aside className="space-y-2 text-sm text-kumo-strong">
        <a className="block rounded-md bg-kumo-elevated px-3 py-2 text-kumo-default" href="#start">Get started</a>
        <a className="block rounded-md px-3 py-2 hover:bg-kumo-elevated" href="#api">API</a>
        <a className="block rounded-md px-3 py-2 hover:bg-kumo-elevated" href="#cloudflare">Cloudflare</a>
        <a className="block rounded-md px-3 py-2 hover:bg-kumo-elevated" href="#research">Research mapping</a>
      </aside>
      <article className="copy-prose max-w-3xl">
        <h1 id="start" className="text-3xl font-semibold text-kumo-default">Get started</h1>
        <p className="mt-3 text-kumo-strong">
          Cloudbox provisions workspaces for testing AI agents. Each workspace includes files, collaborators, work history, downloads, and a score.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-kumo-default">Run locally</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-kumo-line bg-kumo-elevated p-4 text-sm"><code>bun install
bun run dev</code></pre>

        <h2 id="api" className="mt-8 text-xl font-semibold text-kumo-default">API</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-kumo-line bg-kumo-elevated p-4 text-sm"><code>GET  /api/demo
POST /api/generate
POST /api/runs
GET  /api/artifacts/:id
GET  /api/export</code></pre>

        <h2 id="cloudflare" className="mt-8 text-xl font-semibold text-kumo-default">Cloudflare stack</h2>
        <p className="text-kumo-strong">
          The app runs on Workers. D1 stores workspaces and runs. R2 stores downloads. Queues handle longer runs. Workers AI is the default model binding.
        </p>

        <h2 id="research" className="mt-8 text-xl font-semibold text-kumo-default">Research mapping</h2>
        <p className="text-kumo-strong">
          The product UI uses plain infrastructure wording. The code still maps to the paper: profile expansion, file planning, artifact generation, collaborators, long-running work simulation, and retrospective scoring.
        </p>
      </article>
    </div>
  );
}
