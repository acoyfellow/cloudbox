// React island for /demo.
//
// Materializes the seeded demo spec on mount, then exposes a button that
// runs the same Cloudbox agent runner used by the headless demo script. The
// runner chooses tool calls from the spec and every call is recorded as a receipt.

import { useEffect, useMemo, useState } from "react";
import {
  materialize,
  list as listFiles,
  read as readFile,
  grade,
  receipts as fetchReceipts,
  type Materialized,
  type ListedFile,
} from "@/lib/api";
import type { GradeResult, Receipt } from "../../../src/grade.ts";
import type { ComputerSpec } from "../../../src/spec.ts";
import { createCloudboxTools } from "../../../src/think.ts";
import { runCloudboxAgent } from "../../../src/agent.ts";

type Props = { spec: ComputerSpec };
type Artifact = { path: string; content: string };

export default function SampleAgent({ spec }: Props) {
  const [computer, setComputer] = useState<Materialized | null>(null);
  const [files, setFiles] = useState<ListedFile[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runSpec, setRunSpec] = useState<ComputerSpec | null>(null);
  const [rawRun, setRawRun] = useState(`{
  "repo": "https://github.com/acoyfellow/cloudbox",
  "commands": ["echo cloudbox-container-ok > HANDOFF.md"],
  "verify": ["test -f HANDOFF.md"],
  "artifact": "HANDOFF.md",
  "timeoutMs": 30000
}`);
  const [rawResult, setRawResult] = useState<unknown>(null);
  const [rawRunning, setRawRunning] = useState(false);

  useEffect(() => {
    const nextRunSpec = { ...spec, runId: `browser-${Date.now()}-${Math.random().toString(16).slice(2)}` };
    setRunSpec(nextRunSpec);
    materialize(nextRunSpec)
      .then((m) => {
        setComputer(m);
        return listFiles(m.id);
      })
      .then((res) => setFiles(res.files))
      .catch((e) => setError(e.message));
  }, [spec]);

  async function runSample() {
    if (!computer || running) return;
    setRunning(true);
    setError(null);
    setArtifact(null);
    setSelectedReceipt(null);
    setGradeResult(null);
    try {
      const id = computer.id;
      const tools = createCloudboxTools({
        computerId: id,
        origin: window.location.origin,
        fetcher: globalThis.fetch.bind(globalThis),
        headers: { "x-cloudbox-demo": "1" },
      });
      await runCloudboxAgent(runSpec ?? spec, tools);
      await refresh(id);
      await sleep(200);
      const result = await grade(id);
      setGradeResult(result);
      const latest = await refresh(id);
      const artifactPath = expectedArtifact(runSpec ?? spec);
      if (artifactPath) {
        const file = await readFile(id, artifactPath);
        setArtifact({ path: artifactPath, content: file.content });
      }
      setSelectedReceipt(latest.at(-1) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function refresh(id: string) {
    const res = await fetchReceipts(id);
    setReceipts(res.receipts);
    return res.receipts;
  }

  async function runRaw() {
    setRawRunning(true);
    setRawResult(null);
    setError(null);
    try {
      const parsed = JSON.parse(rawRun);
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      setRawResult(body);
      if (!response.ok) {
        const failure = body as { detail?: string; error?: string };
        setError(failure.detail ?? failure.error ?? `Run failed: ${response.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRawRunning(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-8">
      <aside className="flex flex-col gap-4">
        <SpecCard computer={computer} files={files} artifact={artifact} onSelectArtifact={() => setSelectedReceipt(null)} />

        <button
          type="button"
          onClick={runSample}
          disabled={!computer || running}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-kumo-contrast px-4 py-2 text-sm font-medium text-kumo-base disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? <Spinner /> : <Bolt />}
          {running ? "Agent working..." : "Run agent"}
        </button>

        {error ? (
          <div className="rounded-md border border-kumo-line bg-kumo-elevated p-3 text-sm text-kumo-danger">
            {error}
          </div>
        ) : null}

        {gradeResult ? <GradeCard result={gradeResult} /> : null}
        <RawRunForm value={rawRun} result={rawResult} running={rawRunning} onChange={setRawRun} onRun={runRaw} />
      </aside>

      <section className="grid min-w-0 gap-4">
        <RunSummary receipts={receipts} artifact={artifact} gradeResult={gradeResult} running={running} />
        <ReceiptsLog receipts={receipts} running={running} selected={selectedReceipt} onSelect={setSelectedReceipt} />
        <Inspector receipt={selectedReceipt} artifact={artifact} />
      </section>
    </div>
  );
}

function expectedArtifact(spec: ComputerSpec): string | undefined {
  return spec.objectives.find((o) => o.expectedArtifact)?.expectedArtifact;
}

function SpecCard({
  computer,
  files,
  artifact,
  onSelectArtifact,
}: {
  computer: Materialized | null;
  files: ListedFile[];
  artifact: Artifact | null;
  onSelectArtifact: () => void;
}) {
  return (
    <div className="rounded-lg border border-kumo-line bg-kumo-elevated p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">Workspace</div>
        <div className="text-xs text-kumo-strong">{files.length ? `${files.length} files` : "materializing"}</div>
      </div>
      <div className="mt-1 font-mono text-sm text-kumo-default">
        {computer ? computer.id : "materializing..."}
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-kumo-strong">Files</div>
      <ul className="mt-2 space-y-1 font-mono text-xs leading-5 text-kumo-default">
        {files.map((file) => (
          <li key={file.path} className="flex items-baseline justify-between gap-3">
            <span className="truncate" title={file.path}>{file.path}</span>
            <span className="shrink-0 text-kumo-strong">{file.kind}</span>
          </li>
        ))}
      </ul>
      {artifact ? (
        <button
          type="button"
          onClick={onSelectArtifact}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-left text-xs hover:bg-kumo-elevated"
        >
          <span>
            <span className="block font-semibold text-kumo-default">Artifact</span>
            <span className="font-mono text-kumo-strong">{artifact.path}</span>
          </span>
          <span className="text-kumo-muted">open →</span>
        </button>
      ) : null}
    </div>
  );
}

function RunSummary({
  receipts,
  artifact,
  gradeResult,
  running,
}: {
  receipts: Receipt[];
  artifact: Artifact | null;
  gradeResult: GradeResult | null;
  running: boolean;
}) {
  const counts = useMemo(() => {
    const byKind = new Map<string, number>();
    for (const receipt of receipts) byKind.set(receipt.kind, (byKind.get(receipt.kind) ?? 0) + 1);
    return byKind;
  }, [receipts]);

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <SummaryPill label="Receipts" value={String(receipts.length)} sub={running ? "streaming" : "recorded"} />
      <SummaryPill label="Reads" value={String(counts.get("read") ?? 0)} sub="files inspected" />
      <SummaryPill label="Artifact" value={artifact ? "1" : "0"} sub={artifact?.path ?? "pending"} />
      <SummaryPill label="Grade" value={gradeResult ? `${gradeResult.score}/${gradeResult.max}` : "—"} sub={gradeResult ? "from receipts" : "pending"} />
    </div>
  );
}

function SummaryPill({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-kumo-line bg-kumo-elevated p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{label}</div>
      <div className="mt-1 break-words font-mono text-lg text-kumo-default">{value}</div>
      <div className="break-words text-xs leading-5 text-kumo-strong" title={sub}>{sub}</div>
    </div>
  );
}

function RawRunForm({
  value,
  result,
  running,
  onChange,
  onRun,
}: {
  value: string;
  result: unknown;
  running: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
}) {
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-orange-950">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-orange-700">Raw repo run</div>
          <p className="mt-1 text-xs leading-5 text-orange-900">Edit the full /api/runs payload for any public GitHub repo.</p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="shrink-0 rounded-md bg-[#f38020] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {running ? "Running..." : "Run raw"}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className="mt-3 min-h-56 w-full resize-y rounded-md border border-orange-200 bg-white/80 p-3 font-mono text-xs leading-5 text-orange-950 outline-none focus:border-orange-400"
      />
      {result ? (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-white/80 p-3 font-mono text-xs leading-5 text-orange-950">{JSON.stringify(result, null, 2)}</pre>
      ) : null}
    </div>
  );
}

function GradeCard({ result }: { result: GradeResult }) {
  return (
    <div className="rounded-lg border border-kumo-line bg-kumo-elevated p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">Grade</div>
        <div className="font-mono text-sm text-kumo-default">{result.score}/{result.max}</div>
      </div>
      <ul className="mt-3 space-y-1.5 text-xs leading-5">
        {result.detail.map((d) => (
          <li key={d.id} className="flex items-start gap-2">
            <span className={`mt-0.5 shrink-0 ${d.status === "passed" ? "text-kumo-default" : d.status === "failed" ? "text-kumo-danger" : "text-kumo-strong"}`}>
              {d.status === "passed" ? "✓" : d.status === "failed" ? "✗" : "·"}
            </span>
            <div className="min-w-0">
              <div className="text-kumo-default">{d.must}</div>
              <div className="text-kumo-strong">{d.id} · {d.weight}pt · {d.status}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReceiptsLog({
  receipts,
  running,
  selected,
  onSelect,
}: {
  receipts: Receipt[];
  running: boolean;
  selected: Receipt | null;
  onSelect: (receipt: Receipt) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-kumo-line bg-kumo-elevated">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-kumo-line px-4 py-2.5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">Receipts</div>
          <div className="text-xs text-kumo-muted">click a row for metadata</div>
        </div>
        <div className="text-xs text-kumo-strong">{receipts.length} {running ? "· streaming" : ""}</div>
      </header>
      {receipts.length === 0 ? (
        <div className="p-8 text-center text-sm text-kumo-strong">
          Click <span className="font-mono">Run agent</span> to see receipts stream in.
        </div>
      ) : (
        <ol className="divide-y divide-kumo-line text-sm">
          {receipts.map((r, i) => {
            const active = selected === r;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  className={`grid w-full grid-cols-1 gap-1 px-4 py-2 text-left hover:bg-kumo-base sm:grid-cols-[5rem_minmax(0,1fr)_6rem] sm:items-baseline sm:gap-3 ${active ? "bg-kumo-base" : ""}`}
                >
                  <span className="break-words font-mono text-xs text-kumo-strong">{r.kind}</span>
                  <ReceiptDetail kind={r.kind} payload={r.payload} />
                  <span className="font-mono text-[11px] text-kumo-muted sm:text-right">{formatTime(r.ts)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Inspector({ receipt, artifact }: { receipt: Receipt | null; artifact: Artifact | null }) {
  if (!receipt && artifact) {
    return (
      <Panel title="Artifact" subtitle={artifact.path}>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-kumo-base p-4 font-mono text-xs leading-5 text-kumo-default">{artifact.content}</pre>
      </Panel>
    );
  }
  if (!receipt) return null;
  const metadata = JSON.stringify(receipt.payload ?? {}, null, 2);
  if (!metadata || metadata === "{}") return null;
  return (
    <Panel title="Receipt metadata" subtitle={`${receipt.kind} · ${new Date(receipt.ts).toLocaleString()}`}>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-kumo-base p-4 font-mono text-xs leading-5 text-kumo-default">{metadata}</pre>
    </Panel>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-kumo-line bg-kumo-elevated p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{title}</div>
        <div className="truncate font-mono text-xs text-kumo-muted" title={subtitle}>{subtitle}</div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ReceiptDetail({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  switch (kind) {
    case "init":
      return <span className="break-words text-xs text-kumo-strong">materialized · {String(payload.fileCount)} files</span>;
    case "read":
      return <span className="break-all font-mono text-xs text-kumo-default">{String(payload.path)}</span>;
    case "ask":
      return <span className="break-words font-mono text-xs text-kumo-default">→ {String(payload.who)} · "{truncate(String(payload.message), 68)}"</span>;
    case "submit":
      return <span className="break-words font-mono text-xs text-kumo-default">{String(payload.objective)} = {String(payload.decision ?? "(no decision)")}</span>;
    case "write":
      return <span className="break-all font-mono text-xs text-kumo-default">{String(payload.path)} · {String(payload.bytes)}b</span>;
    case "grade":
      return <span className="break-words font-mono text-xs text-kumo-default">{String(payload.score)}/{String(payload.max)}</span>;
    default:
      return <span className="break-words text-xs text-kumo-strong">{JSON.stringify(payload)}</span>;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trim()}…` : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Spinner() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" className="animate-spin">
      <path d="M232,128a104,104,0,0,1-208,0,8,8,0,0,1,16,0,88,88,0,1,0,88-88,8,8,0,0,1,0-16A104.11,104.11,0,0,1,232,128Z"></path>
    </svg>
  );
}

function Bolt() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
      <path d="M215.79,118.17a8,8,0,0,0-5-5.66L153.18,90.9l14.66-73.33a8,8,0,0,0-13.69-7l-112,120a8,8,0,0,0,3,13l57.63,21.61L88.16,238.43a8,8,0,0,0,13.69,7l112-120A8,8,0,0,0,215.79,118.17Z"></path>
    </svg>
  );
}
