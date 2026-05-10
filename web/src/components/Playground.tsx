import { useMemo, useState } from "react";

type ApiStep = {
  id: string;
  label: string;
  method: "GET" | "POST";
  path: string;
  body?: string;
};

type ApiResult = {
  step: string;
  status: number;
  ok: boolean;
  body: unknown;
};

const defaultSpec = `{
  "name": "agent-launch-readiness",
  "runId": "browser-playground",
  "profile": { "role": "release engineer" },
  "filesystem": [
    { "path": "README.md", "kind": "memo", "description": "Product positioning" },
    { "path": "docs/quickstart.md", "kind": "runbook", "description": "Install path" }
  ],
  "collaborators": [
    { "id": "skeptic", "role": "reviewer", "focus": "Call out anything that is not proven." }
  ],
  "objectives": [
    { "id": "launch-readiness", "title": "Launch readiness", "expectedArtifact": "artifacts/launch-note.md" }
  ],
  "rubric": [
    { "id": "read-readme", "weight": 1, "must": "read README", "mustEvent": { "type": "read", "path": "README.md" } },
    { "id": "ask-skeptic", "weight": 1, "must": "ask skeptic", "mustEvent": { "type": "asked", "who": "skeptic" } },
    { "id": "write-artifact", "weight": 1, "must": "write artifact", "mustEvent": { "type": "wrote", "path": "artifacts/launch-note.md" } },
    { "id": "submit", "weight": 1, "must": "submit launch readiness", "mustEvent": { "type": "submitted", "objective": "launch-readiness" } }
  ]
}`;

const defaultRun = `{
  "repo": "https://github.com/acoyfellow/cloudbox",
  "commands": ["echo cloudbox-container-ok > HANDOFF.md"],
  "verify": ["test -f HANDOFF.md"],
  "artifact": "HANDOFF.md",
  "timeoutMs": 30000
}`;

export default function Playground() {
  const [mode, setMode] = useState<"workspace" | "repo">("repo");
  const [spec, setSpec] = useState(defaultSpec);
  const [repoRun, setRepoRun] = useState(defaultRun);
  const [computerId, setComputerId] = useState("");
  const [artifactPath, setArtifactPath] = useState("artifacts/launch-note.md");
  const [message, setMessage] = useState("What would make this demo untrustworthy?");
  const [artifactContent, setArtifactContent] = useState("# Launch note\n\nCloudbox produced a receipt-backed artifact.\n");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ApiResult[]>([]);

  const steps = useMemo<ApiStep[]>(() => {
    if (mode === "repo") {
      return [{ id: "runs", label: "Run public repo", method: "POST", path: "/api/runs", body: repoRun }];
    }
    const id = computerId || "$ID";
    return [
      { id: "materialize", label: "Materialize workspace", method: "POST", path: "/api/computers", body: spec },
      { id: "list", label: "List files", method: "GET", path: `/api/c/${id}/list` },
      { id: "read", label: "Read README", method: "GET", path: `/api/c/${id}/read?path=README.md` },
      { id: "ask", label: "Ask collaborator", method: "POST", path: `/api/c/${id}/ask`, body: JSON.stringify({ who: "skeptic", message }, null, 2) },
      { id: "write", label: "Write artifact", method: "POST", path: `/api/c/${id}/write`, body: JSON.stringify({ path: artifactPath, content: artifactContent }, null, 2) },
      { id: "submit", label: "Submit decision", method: "POST", path: `/api/c/${id}/submit`, body: JSON.stringify({ objective: "launch-readiness", decision: "ship" }, null, 2) },
      { id: "grade", label: "Grade receipts", method: "GET", path: `/api/c/${id}/grade` },
      { id: "receipts", label: "Inspect receipts", method: "GET", path: `/api/c/${id}/receipts` },
    ];
  }, [mode, repoRun, computerId, spec, message, artifactPath, artifactContent]);

  async function runStep(step: ApiStep) {
    setRunning(true);
    try {
      const path = step.path.replace("$ID", computerId);
      if (path.includes("$ID") || /\/api\/c\/($|\/)/.test(path)) throw new Error("materialize a workspace first");
      const response = await fetch(path, {
        method: step.method,
        headers: { "content-type": "application/json", "x-cloudbox-demo": "1" },
        body: step.method === "POST" ? step.body : undefined,
      });
      const body = await response.json().catch(() => null);
      const maybeMaterialized = body as { id?: string } | null;
      if (step.id === "materialize" && maybeMaterialized?.id) setComputerId(maybeMaterialized.id);
      setResults((prev) => [{ step: step.label, status: response.status, ok: response.ok, body }, ...prev].slice(0, 8));
    } catch (error) {
      setResults((prev) => [{ step: step.label, status: 0, ok: false, body: { error: String(error instanceof Error ? error.message : error) } }, ...prev].slice(0, 8));
    } finally {
      setRunning(false);
    }
  }

  async function runAll() {
    for (const step of steps) await runStep(step);
  }

  return (
    <div className="rounded-2xl border border-kumo-line bg-kumo-elevated/20 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-kumo-muted">Playground</p>
          <h2 className="mt-1 text-xl font-semibold text-kumo-default">Run the real API surface.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-kumo-strong">Edit the payload, run individual API steps, or run the whole flow against a public GitHub repo or a receipt-backed workspace.</p>
        </div>
        <div className="flex rounded-lg border border-kumo-line bg-kumo-base p-1 text-sm">
          <button onClick={() => setMode("repo")} className={`rounded-md px-3 py-1.5 ${mode === "repo" ? "bg-kumo-elevated text-kumo-default" : "text-kumo-strong"}`}>Repo run</button>
          <button onClick={() => setMode("workspace")} className={`rounded-md px-3 py-1.5 ${mode === "workspace" ? "bg-kumo-elevated text-kumo-default" : "text-kumo-strong"}`}>Workspace</button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-3">
          {mode === "repo" ? (
            <Editor label="POST /api/runs" value={repoRun} onChange={setRepoRun} />
          ) : (
            <>
              <Editor label="POST /api/computers" value={spec} onChange={setSpec} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Computer id" value={computerId} onChange={setComputerId} placeholder="materialize first" />
                <Field label="Artifact path" value={artifactPath} onChange={setArtifactPath} />
              </div>
              <Field label="Ask message" value={message} onChange={setMessage} />
              <Editor label="Artifact content" value={artifactContent} onChange={setArtifactContent} small />
            </>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex gap-2">
            <button onClick={runAll} disabled={running} className="rounded-md bg-[#f38020] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{running ? "Running..." : "Run flow"}</button>
            <button onClick={() => setResults([])} className="rounded-md border border-kumo-line px-4 py-2 text-sm text-kumo-default hover:bg-kumo-elevated">Clear</button>
          </div>
          <div className="overflow-hidden rounded-lg border border-kumo-line bg-kumo-base">
            {steps.map((step) => (
              <button key={step.id} onClick={() => runStep(step)} className="grid w-full grid-cols-[4.5rem_minmax(0,1fr)] gap-2 border-b border-kumo-line px-3 py-2 text-left text-xs last:border-b-0 hover:bg-kumo-elevated">
                <span className="font-mono text-kumo-strong">{step.method}</span>
                <span className="min-w-0 break-all font-mono text-kumo-default">{step.path}</span>
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {results.map((result, index) => (
              <div key={index} className="rounded-lg border border-kumo-line bg-kumo-base p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-kumo-default">{result.step}</span>
                  <span className={result.ok ? "text-kumo-strong" : "text-kumo-danger"}>{result.status}</span>
                </div>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-kumo-strong">{JSON.stringify(result.body, null, 2)}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Editor({ label, value, onChange, small = false }: { label: string; value: string; onChange: (value: string) => void; small?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} className={`${small ? "min-h-32" : "min-h-72"} mt-2 w-full resize-y rounded-md border border-kumo-line bg-kumo-base p-3 font-mono text-xs leading-5 text-kumo-default outline-none focus:border-kumo-strong`} />
    </label>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 font-mono text-xs text-kumo-default outline-none focus:border-kumo-strong" />
    </label>
  );
}
