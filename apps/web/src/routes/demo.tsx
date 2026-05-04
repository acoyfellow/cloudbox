import { createFileRoute } from "@tanstack/react-router";
import { ArrowClockwise, DownloadSimple } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { getDemo, provisionWorkspace, type CloudboxResponse } from "@/lib/api";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
});

function DemoPage() {
  const [brief, setBrief] = useState("A platform engineer preparing a client migration review.");
  const [result, setResult] = useState<CloudboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDemo()
      .then(setResult)
      .catch(() => setError("Could not load the example workspace."))
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setResult(await provisionWorkspace(brief));
    } catch {
      setError("Could not provision the workspace.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[0.75fr_1fr]">
      <section>
        <h1 className="text-3xl font-semibold text-kumo-default">Provision a workspace.</h1>
        <p className="mt-3 max-w-md text-base leading-7 text-kumo-strong">
          Type a job. Cloudbox returns files, work notes, downloads, and a score.
        </p>
        <form onSubmit={onSubmit} className="mt-6 rounded-lg border border-kumo-line bg-kumo-elevated p-4">
          <label htmlFor="brief" className="text-sm font-medium text-kumo-default">
            Job
          </label>
          <textarea
            id="brief"
            value={brief}
            onChange={(event) => setBrief(event.currentTarget.value)}
            rows={5}
            className="mt-2 w-full resize-none rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default outline-none focus:ring-2 focus:ring-kumo-focus"
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-kumo-default px-4 py-2 text-sm font-medium text-kumo-base disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <ArrowClockwise size={16} className="animate-spin" /> : null}
            Provision workspace
          </button>
          {error ? <p className="mt-3 text-sm text-kumo-danger">{error}</p> : null}
        </form>
      </section>

      <section className="rounded-lg border border-kumo-line bg-kumo-elevated p-4">
        {result ? <WorkspaceResult result={result} /> : <div className="text-sm text-kumo-strong">Loading workspace...</div>}
      </section>
    </div>
  );
}

function WorkspaceResult({ result }: { result: CloudboxResponse }) {
  const files = result.computer.filesystem.files.slice(0, 5);
  const activity = result.computer.simulation.activities.slice(0, 3);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b border-kumo-line pb-4">
        <div>
          <h2 className="text-lg font-semibold text-kumo-default">{result.computer.profile.occupation}</h2>
          <p className="mt-1 text-sm text-kumo-strong">{result.computer.profile.organization}</p>
        </div>
        <div className="rounded-md bg-kumo-base px-2 py-1 text-sm text-kumo-strong">{result.retrospective.percentage}%</div>
      </div>

      <dl className="mt-4 space-y-4">
        <ResultBlock label="Task">{result.computer.profile.currentProjects[0]}</ResultBlock>
        <ResultBlock label="Files">
          <ul className="space-y-1">
            {files.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3">
                <span>{file.title}</span>
                <span className="text-xs uppercase text-kumo-strong">{file.kind}</span>
              </li>
            ))}
          </ul>
        </ResultBlock>
        <ResultBlock label="Work notes">
          <ul className="space-y-1">
            {activity.map((item) => (
              <li key={`${item.day}-${item.summary}`}>Day {item.day}: {item.summary}</li>
            ))}
          </ul>
        </ResultBlock>
        <ResultBlock label="Downloads">
          <div className="flex flex-wrap gap-2">
            {result.links.artifacts.slice(0, 3).map((artifact) => (
              <a
                key={artifact.id}
                href={artifact.href}
                className="inline-flex items-center gap-1 rounded-md border border-kumo-line px-2 py-1 text-sm text-kumo-default hover:bg-kumo-base"
              >
                <DownloadSimple size={14} />
                {artifact.path.split("/").at(-1)}
              </a>
            ))}
          </div>
        </ResultBlock>
        <ResultBlock label="Score note">{result.retrospective.lessons[0]}</ResultBlock>
      </dl>
    </div>
  );
}

function ResultBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-normal text-kumo-strong">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-kumo-default">{children}</dd>
    </div>
  );
}
