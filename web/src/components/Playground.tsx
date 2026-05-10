import { useMemo, useState } from "react";

type RunReceipt = {
  type: "clone" | "command" | "verify" | "diff";
  cmd: string;
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
};

type RunResponse = {
  ok?: boolean;
  receipts?: RunReceipt[];
  artifact?: { path: string; content: string } | null;
  diff?: string;
  error?: string;
  detail?: string;
};


export default function Playground() {
  const [repo, setRepo] = useState("https://github.com/acoyfellow/cloudbox");
  const [commands, setCommands] = useState("echo cloudbox-container-ok > HANDOFF.md");
  const [verify, setVerify] = useState("test -f HANDOFF.md");
  const [artifact, setArtifact] = useState("HANDOFF.md");
  const [timeoutMs, setTimeoutMs] = useState("30000");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [rawPayload, setRawPayload] = useState("");

  const payload = useMemo(() => ({
    repo,
    commands: lines(commands),
    verify: lines(verify),
    artifact,
    timeoutMs: Number(timeoutMs) || 30000,
  }), [repo, commands, verify, artifact, timeoutMs]);

  const displayPayload = rawPayload || JSON.stringify(payload, null, 2);

  async function runRepo(useRaw = false) {
    setRunning(true);
    setResult(null);
    try {
      const body = useRaw ? JSON.parse(displayPayload) : payload;
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json", "x-cloudbox-demo": "1" },
        body: JSON.stringify(body),
      });
      const parsed = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` })) as RunResponse;
      setResult(parsed);
    } catch (error) {
      setResult({ ok: false, error: String(error instanceof Error ? error.message : error) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-kumo-line bg-kumo-elevated/20 p-4 md:p-5">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-kumo-muted">Playground</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-kumo-default">Run a real public repo.</h2>
        <p className="mt-2 text-sm leading-6 text-kumo-strong">
          Cloudbox clones the repo in a Cloudflare Container, runs your commands, verifies the result, and returns receipts plus an artifact.
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void runRepo(false); }}>
          <Field label="GitHub repo URL" value={repo} onChange={setRepo} />
          <Textarea label="Commands" hint="One shell command per line. Public demo allows safe commands like echo/test/ls." value={commands} onChange={setCommands} rows={4} />
          <Textarea label="Verify" hint="One verification command per line." value={verify} onChange={setVerify} rows={3} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Artifact path" value={artifact} onChange={setArtifact} />
            <Field label="Timeout ms" value={timeoutMs} onChange={setTimeoutMs} />
          </div>
          <button disabled={running} className="w-full rounded-md bg-[#f38020] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
            {running ? "Running in Cloudbox..." : "Run in Cloudbox"}
          </button>
        </form>

        <div className="min-w-0 space-y-3">
          <ResultSummary result={result} running={running} />
          {result?.artifact ? (
            <Panel title="Artifact" subtitle={result.artifact.path}>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-kumo-default">{result.artifact.content}</pre>
            </Panel>
          ) : null}
          {result?.receipts?.length ? <ReceiptCards receipts={result.receipts} /> : null}
          {result ? (
            <details className="rounded-lg border border-kumo-line bg-kumo-base p-3">
              <summary className="cursor-pointer text-sm font-medium text-kumo-default">Raw response</summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-kumo-strong">{JSON.stringify(result, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      </div>

    </div>
  );
}

function ResultSummary({ result, running }: { result: RunResponse | null; running: boolean }) {
  if (running) return <Panel title="Running" subtitle="container is working"><p className="text-sm text-kumo-strong">Cloning the repo and running commands…</p></Panel>;
  if (!result) return <Panel title="Result" subtitle="waiting"><p className="text-sm text-kumo-strong">Run a repo to see receipts, logs, and artifact output.</p></Panel>;
  const receipts = result.receipts ?? [];
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <MiniStat label="Status" value={result.ok ? "passed" : "failed"} tone={result.ok ? "good" : "bad"} />
      <MiniStat label="Clone" value={statusFor(receipts, "clone")} />
      <MiniStat label="Verify" value={statusFor(receipts, "verify")} />
      <MiniStat label="Artifact" value={result.artifact?.path ?? "none"} />
      {result.error || result.detail ? <div className="sm:col-span-4 break-words rounded-lg border border-kumo-line bg-kumo-base p-3 text-sm text-kumo-danger">{result.detail ?? result.error}</div> : null}
    </div>
  );
}

function ReceiptCards({ receipts }: { receipts: RunReceipt[] }) {
  return (
    <div className="space-y-2">
      {receipts.map((receipt, index) => (
        <details key={index} className="rounded-lg border border-kumo-line bg-kumo-base p-3">
          <summary className="cursor-pointer text-sm text-kumo-default"><span className="font-mono">{receipt.type}</span> · <span className={receipt.code === 0 ? "text-kumo-strong" : "text-kumo-danger"}>{receipt.code === 0 ? "passed" : `exit ${receipt.code ?? receipt.signal}`}</span></summary>
          <div className="mt-3 space-y-2">
            <pre className="whitespace-pre-wrap break-words rounded-md bg-kumo-elevated p-2 font-mono text-xs text-kumo-default">$ {receipt.cmd}</pre>
            {receipt.stdout ? <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-kumo-strong">{receipt.stdout}</pre> : null}
            {receipt.stderr ? <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-kumo-danger">{receipt.stderr}</pre> : null}
          </div>
        </details>
      ))}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-kumo-line bg-kumo-base p-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{title}</div><div className="break-all font-mono text-xs text-kumo-muted">{subtitle}</div></div><div className="mt-3">{children}</div></div>;
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return <div className="min-w-0 rounded-lg border border-kumo-line bg-kumo-base p-3"><div className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{label}</div><div className={`mt-1 break-words font-mono text-sm ${tone === "bad" ? "text-kumo-danger" : "text-kumo-default"}`}>{value}</div></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block min-w-0"><span className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 font-mono text-xs text-kumo-default outline-none focus:border-kumo-strong" /></label>;
}

function Textarea({ label, hint, value, onChange, rows, mono = true }: { label: string; hint?: string; value: string; onChange: (value: string) => void; rows: number; mono?: boolean }) {
  return <label className="block min-w-0"><span className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{label}</span>{hint ? <span className="ml-2 text-xs text-kumo-muted">{hint}</span> : null}<textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} className={`mt-2 w-full resize-y rounded-md border border-kumo-line bg-kumo-base p-3 ${mono ? "font-mono" : ""} text-xs leading-5 text-kumo-default outline-none focus:border-kumo-strong`} /></label>;
}

function lines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function statusFor(receipts: RunReceipt[], type: RunReceipt["type"]): string {
  const matching = receipts.filter((receipt) => receipt.type === type);
  if (!matching.length) return "pending";
  return matching.every((receipt) => receipt.code === 0) ? "passed" : "failed";
}
