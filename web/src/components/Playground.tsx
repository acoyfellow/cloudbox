import { useState } from "react";

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
  error?: string;
  detail?: string;
};

export default function Playground() {
  const [repo, setRepo] = useState("https://github.com/acoyfellow/cloudbox");
  const [command, setCommand] = useState("echo cloudbox-container-ok > HANDOFF.md");
  const [verify, setVerify] = useState("test -f HANDOFF.md");
  const [artifact, setArtifact] = useState("HANDOFF.md");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);

  async function runRepo() {
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json", "x-cloudbox-demo": "1" },
        body: JSON.stringify({
          repo,
          commands: [command].filter(Boolean),
          verify: [verify].filter(Boolean),
          artifact,
          timeoutMs: 30000,
        }),
      });
      setResult(await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` })) as RunResponse);
    } catch (error) {
      setResult({ ok: false, error: String(error instanceof Error ? error.message : error) });
    } finally {
      setRunning(false);
    }
  }

  const receipts = result?.receipts ?? [];

  return (
    <div className="rounded-2xl border border-kumo-line bg-kumo-elevated/20 p-4 md:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void runRepo(); }}>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-kumo-default md:text-4xl">Run a repo in Cloudbox.</h1>
            <p className="mt-2 text-sm leading-6 text-kumo-strong">Clone, run, verify, and inspect proof from a Cloudflare Container.</p>
          </div>

          <Field label="Repo" value={repo} onChange={setRepo} />
          <Field label="Run" value={command} onChange={setCommand} />
          <Field label="Verify" value={verify} onChange={setVerify} />
          <Field label="Artifact" value={artifact} onChange={setArtifact} />

          <button disabled={running} className="w-full rounded-md bg-[#f38020] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
            {running ? "Running…" : "Run in Cloudbox"}
          </button>
        </form>

        <div className="min-w-0 space-y-3">
          {!result && !running ? (
            <div className="rounded-lg border border-kumo-line bg-kumo-base p-4 text-sm leading-6 text-kumo-strong">
              The result will show clone, command, verify, and artifact proof.
            </div>
          ) : null}

          {running ? (
            <div className="rounded-lg border border-kumo-line bg-kumo-base p-4 text-sm leading-6 text-kumo-strong">Running in the container…</div>
          ) : null}

          {result ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Status" value={result.ok ? "passed" : "failed"} bad={result.ok === false} />
                <Stat label="Verify" value={statusFor(receipts, "verify")} />
                <Stat label="Artifact" value={result.artifact?.path ?? "none"} />
              </div>

              {result.error || result.detail ? (
                <div className="break-words rounded-lg border border-kumo-line bg-kumo-base p-3 text-sm text-kumo-danger">{result.detail ?? result.error}</div>
              ) : null}

              {result.artifact ? (
                <details open className="rounded-lg border border-kumo-line bg-kumo-base p-3">
                  <summary className="cursor-pointer text-sm font-medium text-kumo-default">Artifact</summary>
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-kumo-strong">{result.artifact.content}</pre>
                </details>
              ) : null}

              {receipts.length ? (
                <details open className="rounded-lg border border-kumo-line bg-kumo-base p-3">
                  <summary className="cursor-pointer text-sm font-medium text-kumo-default">Receipts</summary>
                  <div className="mt-3 space-y-2">
                    {receipts.map((receipt, index) => (
                      <details key={index} className="rounded-md border border-kumo-line bg-kumo-elevated p-2">
                        <summary className="cursor-pointer break-words text-xs text-kumo-default"><span className="font-mono">{receipt.type}</span> · {receipt.code === 0 ? "passed" : `exit ${receipt.code ?? receipt.signal}`}</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-kumo-strong">$ {receipt.cmd}\n{receipt.stdout || receipt.stderr}</pre>
                      </details>
                    ))}
                  </div>
                </details>
              ) : null}

              <details className="rounded-lg border border-kumo-line bg-kumo-base p-3">
                <summary className="cursor-pointer text-sm font-medium text-kumo-default">Raw JSON</summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-kumo-strong">{JSON.stringify(result, null, 2)}</pre>
              </details>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 font-mono text-xs text-kumo-default outline-none focus:border-kumo-strong" />
    </label>
  );
}

function Stat({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return <div className="min-w-0 rounded-lg border border-kumo-line bg-kumo-base p-3"><div className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{label}</div><div className={`mt-1 break-words font-mono text-sm ${bad ? "text-kumo-danger" : "text-kumo-default"}`}>{value}</div></div>;
}

function statusFor(receipts: RunReceipt[], type: RunReceipt["type"]): string {
  const matching = receipts.filter((receipt) => receipt.type === type);
  if (!matching.length) return "pending";
  return matching.every((receipt) => receipt.code === 0) ? "passed" : "failed";
}
