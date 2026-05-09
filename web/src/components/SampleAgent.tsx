// React island for /demo.
//
// Materializes the seeded dogfood spec on mount, then exposes a button that
// runs the same Cloudbox agent runner used by scripts/dogfood.mjs. The runner
// chooses tool calls from the spec and every call is recorded as a receipt.

import { useEffect, useState } from "react";
import {
  materialize,
  list as listFiles,
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

export default function SampleAgent({ spec }: Props) {
  const [computer, setComputer] = useState<Materialized | null>(null);
  const [files, setFiles] = useState<ListedFile[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runSpec, setRunSpec] = useState<ComputerSpec | null>(null);

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
      await refresh(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function refresh(id: string) {
    const res = await fetchReceipts(id);
    setReceipts(res.receipts);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-8">
      <aside className="flex flex-col gap-4">
        <SpecCard computer={computer} files={files} />

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
      </aside>

      <section className="min-w-0">
        <ReceiptsLog receipts={receipts} running={running} />
      </section>
    </div>
  );
}

function SpecCard({
  computer,
  files,
}: {
  computer: Materialized | null;
  files: ListedFile[];
}) {
  return (
    <div className="rounded-lg border border-kumo-line bg-kumo-elevated p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">
        Spec
      </div>
      <div className="mt-1 font-mono text-sm text-kumo-default">
        {computer ? computer.id : "materializing..."}
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-kumo-strong">
        Files
      </div>
      <ul className="mt-2 space-y-1 font-mono text-xs leading-5 text-kumo-default">
        {files.map((file) => (
          <li key={file.path} className="flex items-baseline justify-between gap-3">
            <span className="truncate" title={file.path}>{file.path}</span>
            <span className="shrink-0 text-kumo-strong">{file.kind}</span>
          </li>
        ))}
      </ul>
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

function ReceiptsLog({ receipts, running }: { receipts: Receipt[]; running: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-kumo-line bg-kumo-elevated">
      <header className="flex items-center justify-between border-b border-kumo-line px-4 py-2.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">Receipts</div>
        <div className="text-xs text-kumo-strong">
          {receipts.length} {running ? "· streaming" : ""}
        </div>
      </header>
      {receipts.length === 0 ? (
        <div className="p-8 text-center text-sm text-kumo-strong">
          Click <span className="font-mono">Run sample agent</span> to see receipts stream in.
        </div>
      ) : (
        <ol className="divide-y divide-kumo-line text-sm">
          {receipts.map((r, i) => (
            <li key={i} className="flex items-baseline gap-3 px-4 py-2">
              <span className="w-12 shrink-0 font-mono text-xs text-kumo-strong">{r.kind}</span>
              <ReceiptDetail kind={r.kind} payload={r.payload} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ReceiptDetail({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  switch (kind) {
    case "init":
      return <span className="text-xs text-kumo-strong">materialized · {String(payload.fileCount)} files</span>;
    case "read":
      return <span className="font-mono text-xs text-kumo-default">{String(payload.path)}</span>;
    case "ask":
      return (
        <span className="font-mono text-xs text-kumo-default">
          → {String(payload.who)} · "{truncate(String(payload.message), 60)}"
        </span>
      );
    case "submit":
      return (
        <span className="font-mono text-xs text-kumo-default">
          {String(payload.objective)} = {String(payload.decision ?? "(no decision)")}
        </span>
      );
    case "write":
      return (
        <span className="font-mono text-xs text-kumo-default">
          {String(payload.path)} · {String(payload.bytes)}b
        </span>
      );
    case "grade":
      return (
        <span className="font-mono text-xs text-kumo-default">
          {String(payload.score)}/{String(payload.max)}
        </span>
      );
    default:
      return <span className="text-xs text-kumo-strong">{JSON.stringify(payload)}</span>;
  }
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
