import { useState } from "react";
import { runnerReadySummary, summarizeRunnerReceipt, type RunnerLifecycleReceipt } from "./runner-receipts.ts";

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
  runnerReceipts?: RunnerLifecycleReceipt[];
  runId?: string;
  publicUrl?: string;
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
  const runnerReceipts = result?.runnerReceipts ?? [];
  const verifyReceipt = receipts.find((receipt) => receipt.type === "verify");
  const commandReceipt = receipts.find((receipt) => receipt.type === "command");
  const runnerBad = runnerReceipts.some((receipt) => receipt.type === "runner.container.not_ready" || receipt.type === "runner.container.missing");

  return (
    <div className="rounded-2xl border border-kumo-line bg-kumo-elevated/20 p-4 md:p-5">
      <div className="mb-6 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-kumo-default md:text-4xl">Run a repo in Cloudbox.</h1>
        <p className="mt-2 text-sm leading-6 text-kumo-strong">
          Cloudbox clones a public GitHub repo in a fresh Cloudflare Container, runs a command, verifies it, and returns one artifact plus receipts.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <form className="space-y-4 rounded-xl border border-kumo-line bg-kumo-base p-4" onSubmit={(event) => { event.preventDefault(); void runRepo(); }}>
          <SectionHeader step="1" title="Define the run" description="This is the structured plan your agent would send to Cloudbox." />

          <Field label="Public GitHub repo" value={repo} onChange={setRepo} />
          <Field label="Command to run" value={command} onChange={setCommand} />
          <Field label="Verification command" value={verify} onChange={setVerify} />
          <Field label="Artifact to return" value={artifact} onChange={setArtifact} />

          <button disabled={running} className="w-full rounded-md bg-[#f38020] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
            {running ? "Running…" : "Run in Cloudbox"}
          </button>
          <p className="text-xs leading-5 text-kumo-muted">
            This clones the repo, runs the command, runs the verification check, and returns the artifact path above.
          </p>
        </form>

        <div className="min-w-0 rounded-xl border border-kumo-line bg-kumo-base p-4">
          <SectionHeader step="2" title="Inspect the proof" description="The result is ordered like the run: status, artifact, verification, then receipts." />

          {!result && !running ? (
            <EmptyProof />
          ) : null}

          {running ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-kumo-line bg-kumo-elevated p-3 text-sm font-medium text-kumo-default">Running in a fresh computer…</div>
              <ProofSteps runner={false} clone={false} command={false} verify={false} artifact={false} />
            </div>
          ) : null}

          {result ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat label="Status" value={result.ok ? "passed" : "failed"} bad={result.ok === false} />
                <Stat label="Runner" value={runnerReadySummary(runnerReceipts)} bad={runnerBad} />
              </div>

              {result.error || result.detail ? (
                <div className="break-words rounded-lg border border-kumo-line bg-kumo-elevated p-3 text-sm text-kumo-danger">{result.detail ?? result.error}</div>
              ) : null}

              {result.publicUrl ? (
                <a
                  href={result.publicUrl}
                  className="flex items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-900 hover:bg-orange-100"
                >
                  <span>Share this run →</span>
                  <span className="truncate font-mono text-xs text-orange-700">{result.publicUrl.replace(/^https?:\/\//, "")}</span>
                </a>
              ) : null}

              {result.artifact ? (
                <section className="rounded-lg border border-kumo-line bg-kumo-elevated p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-kumo-default">Artifact</h2>
                    <span className="break-all font-mono text-xs text-kumo-strong">{result.artifact.path}</span>
                  </div>
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-kumo-line bg-kumo-base p-3 font-mono text-xs leading-5 text-kumo-strong">{result.artifact.content}</pre>
                </section>
              ) : null}

              <section className="rounded-lg border border-kumo-line bg-kumo-elevated p-3">
                <h2 className="text-sm font-semibold text-kumo-default">Verification</h2>
                <div className="mt-2 rounded-md border border-kumo-line bg-kumo-base p-2 text-xs text-kumo-strong">
                  {verifyReceipt ? (
                    <><span className={verifyReceipt.code === 0 ? "text-lime-700" : "text-kumo-danger"}>{verifyReceipt.code === 0 ? "✓ passed" : "✕ failed"}</span><span className="mx-2 text-kumo-muted">·</span><span className="break-all font-mono">{verifyReceipt.cmd}</span></>
                  ) : "No verification receipt returned."}
                </div>
              </section>

              <section className="rounded-lg border border-kumo-line bg-kumo-elevated p-3">
                <h2 className="text-sm font-semibold text-kumo-default">Run timeline</h2>
                <ProofSteps
                  runner={runnerReceipts.some((receipt) => receipt.type === "runner.container.ready")}
                  clone={hasPassed(receipts, "clone")}
                  command={Boolean(commandReceipt && commandReceipt.code === 0)}
                  verify={hasPassed(receipts, "verify")}
                  artifact={Boolean(result.artifact)}
                />
              </section>

              {runnerReceipts.length ? (
                <details className="rounded-lg border border-kumo-line bg-kumo-elevated p-3">
                  <summary className="cursor-pointer text-sm font-medium text-kumo-default">Runner receipts</summary>
                  <div className="mt-3 space-y-2">
                    {runnerReceipts.map((receipt, index) => (
                      <div key={index} className="rounded-md border border-kumo-line bg-kumo-base p-2 text-xs text-kumo-strong">
                        <span className="font-mono text-kumo-default">{receipt.type}</span> · {summarizeRunnerReceipt(receipt)}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              {receipts.length ? (
                <details className="rounded-lg border border-kumo-line bg-kumo-elevated p-3">
                  <summary className="cursor-pointer text-sm font-medium text-kumo-default">Work receipts</summary>
                  <div className="mt-3 space-y-2">
                    {receipts.map((receipt, index) => (
                      <details key={index} className="rounded-md border border-kumo-line bg-kumo-base p-2">
                        <summary className="cursor-pointer break-words text-xs text-kumo-default"><span className="font-mono">{receipt.type}</span> · {receipt.code === 0 ? "passed" : `exit ${receipt.code ?? receipt.signal}`}</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-kumo-strong">$ {receipt.cmd}\n{receipt.stdout || receipt.stderr}</pre>
                      </details>
                    ))}
                  </div>
                </details>
              ) : null}

              <details className="rounded-lg border border-kumo-line bg-kumo-elevated p-3">
                <summary className="cursor-pointer text-sm font-medium text-kumo-default">Raw response</summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-kumo-strong">{JSON.stringify(result, null, 2)}</pre>
              </details>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="mb-4 flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f38020] text-xs font-bold text-white">{step}</div>
      <div>
        <h2 className="text-lg font-semibold text-kumo-default">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-kumo-strong">{description}</p>
      </div>
    </div>
  );
}

function EmptyProof() {
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-dashed border-kumo-line bg-kumo-elevated p-4 text-sm leading-6 text-kumo-strong">
        Run the demo to see the Container lifecycle, command receipt, verification result, and returned artifact.
      </div>
      <ProofSteps runner={false} clone={false} command={false} verify={false} artifact={false} />
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-kumo-line bg-kumo-elevated px-3 py-2 font-mono text-xs text-kumo-default outline-none focus:border-kumo-strong" />
    </label>
  );
}

function Stat({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return <div className="min-w-0 rounded-lg border border-kumo-line bg-kumo-elevated p-3"><div className="text-xs font-semibold uppercase tracking-wide text-kumo-strong">{label}</div><div className={`mt-1 break-words font-mono text-sm ${bad ? "text-kumo-danger" : "text-kumo-default"}`}>{value}</div></div>;
}

function ProofSteps({ runner, clone, command, verify, artifact }: { runner: boolean; clone: boolean; command: boolean; verify: boolean; artifact: boolean }) {
  const steps = [
    ["Runner", runner],
    ["Clone", clone],
    ["Command", command],
    ["Verify", verify],
    ["Artifact", artifact],
  ] as const;
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-5">
      {steps.map(([label, ok]) => <ProofPill key={label} label={label} ok={ok} />)}
    </div>
  );
}

function ProofPill({ label, ok }: { label: string; ok: boolean }) {
  return <span className={`rounded-full border px-2.5 py-1 text-center text-xs font-medium ${ok ? "border-lime-200/60 bg-lime-100/40 text-lime-800" : "border-kumo-line bg-kumo-base text-kumo-strong"}`}>{ok ? "✓ " : "○ "}{label}</span>;
}

function hasPassed(receipts: RunReceipt[], type: RunReceipt["type"]): boolean {
  const matching = receipts.filter((receipt) => receipt.type === type);
  return matching.length > 0 && matching.every((receipt) => receipt.code === 0);
}
