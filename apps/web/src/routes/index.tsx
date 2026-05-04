import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, FolderOpen, Gauge, Users } from "@phosphor-icons/react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-12 md:py-16">
      <section className="grid gap-8 md:grid-cols-[1fr_0.9fr] md:items-center">
        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-medium text-kumo-strong">Cloudbox</p>
          <h1 className="text-4xl font-semibold tracking-normal text-kumo-default md:text-5xl">
            Provision workspaces for testing AI agents.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-kumo-strong">
            Describe a job. Cloudbox creates files, tasks, work notes, downloads, and a score.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 rounded-md bg-kumo-default px-4 py-2 text-sm font-medium text-kumo-base hover:opacity-90"
            >
              Try the demo
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center rounded-md border border-kumo-line px-4 py-2 text-sm font-medium text-kumo-default hover:bg-kumo-elevated"
            >
              Read the docs
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-kumo-line bg-kumo-elevated p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-kumo-line pb-3">
            <span className="text-sm font-medium text-kumo-default">Example workspace</span>
            <span className="rounded-md bg-kumo-base px-2 py-1 text-xs text-kumo-strong">ready</span>
          </div>
          <div className="space-y-3 text-sm">
            <ExampleRow icon={<FolderOpen size={17} />} label="Brief" value="Prepare a client migration review" />
            <ExampleRow icon={<FileText size={17} />} label="Files" value="9 files across docs, sheets, slides, and PDF" />
            <ExampleRow icon={<Users size={17} />} label="People" value="3 collaborators with private context" />
            <ExampleRow icon={<Gauge size={17} />} label="Score" value="Rubric, failure modes, and lessons" />
          </div>
        </div>
      </section>

      <section className="border-t border-kumo-line pt-8">
        <div className="grid gap-4 md:grid-cols-3">
          <PlainPoint title="Use it to test agents" body="Give an agent a workspace with context, files, and expected outcomes." />
          <PlainPoint title="Deploy it on Cloudflare" body="Workers, D1, R2, Queues, and Workers AI in one small app." />
          <PlainPoint title="Inspect the result" body="Review the files, work log, downloads, and score before changing anything." />
        </div>
      </section>
    </div>
  );
}

function ExampleRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-kumo-line bg-kumo-base p-3">
      <div className="mt-0.5 text-kumo-strong">{icon}</div>
      <div>
        <div className="font-medium text-kumo-default">{label}</div>
        <div className="mt-0.5 text-kumo-strong">{value}</div>
      </div>
    </div>
  );
}

function PlainPoint({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-kumo-default">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-kumo-strong">{body}</p>
    </div>
  );
}
