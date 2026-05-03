const pageType = document.body.dataset.page;

if (pageType === "home") initHome();
if (pageType === "demo") initDemo();
if (pageType === "docs") initDocs();

async function initHome() {
  const proof = document.querySelector("#proof-strip");
  if (!proof) return;
  const state = await fetchJson("/api/demo").catch(() => fallbackState);
  const { computer, retrospective } = state;
  proof.innerHTML = [
    stat("Role", "Profile from a short description"),
    stat("Files", "Folders, sources, drafts, coworkers, deadlines"),
    stat("Run", `${computer.artifacts.length} files, ${computer.simulation.period.workingDays} days`),
    stat("Report", `${retrospective.percentage}% scorecard with ${retrospective.lessons.length} lessons`),
  ].join("");
}

const fallbackState = {
  computer: {
    name: "Finance client review environment",
    profile: {
      identity: "Sample advisor",
      occupation: "Senior Financial Advisor",
      organization: "Meridian Wealth Partners",
      location: "Denver, Colorado",
      documentHabits: "Drafts in analysis files first, then summarizes into memos and decks.",
      spreadsheetUsage: "Uses scenario tabs, source registries, and date-stamped workbook versions.",
      organizationStyle: "Keeps systematic project folders with occasional duplicate drafts.",
    },
    filesystem: {
      directories: [
        "D:/ClientWork/model-portfolio-refresh",
        "D:/Research/source-materials",
        "D:/Presentations",
        "C:/Users/advisor/Documents",
      ],
      files: [
        { id: "source-brief", kind: "pdf", path: "D:/Research/source-materials/Source Packet 2026.pdf" },
        { id: "analysis-v1", kind: "xlsx", path: "D:/ClientWork/model-portfolio-refresh/Analysis Model v1.xlsx" },
        { id: "memo-draft", kind: "docx", path: "D:/ClientWork/model-portfolio-refresh/Recommendation Memo DRAFT.docx" },
        { id: "deck-draft", kind: "pptx", path: "D:/Presentations/Portfolio Review Deck v1.pptx" },
        { id: "final-pdf", kind: "pdf", path: "D:/ClientWork/model-portfolio-refresh/Final Recommendation Package.pdf" },
        { id: "activity-log", kind: "md", path: "C:/Users/advisor/Documents/Activity Log 2026-01.md" },
      ],
    },
    artifacts: [
      {
        fileId: "source-brief",
        kind: "pdf",
        title: "Source Packet",
        path: "D:/Research/source-materials/Source Packet 2026.pdf",
        preview: "External source packet used as grounding material.",
      },
      {
        fileId: "analysis-v1",
        kind: "xlsx",
        title: "Analysis Model v1",
        path: "D:/ClientWork/model-portfolio-refresh/Analysis Model v1.xlsx",
        preview: "Workbook with assumptions, source registry, and scenario calculations.",
      },
      {
        fileId: "final-pdf",
        kind: "pdf",
        title: "Final Recommendation Package",
        path: "D:/ClientWork/model-portfolio-refresh/Final Recommendation Package.pdf",
        preview: "Final package exported after review and consistency checks.",
      },
    ],
    collaborators: [
      { name: "Manager", role: "Approves decision summary" },
      { name: "Peer reviewer", role: "Checks formulas and assumptions" },
      { name: "Compliance reviewer", role: "Checks disclosure language" },
    ],
    simulation: {
      period: { workingDays: 20 },
      deliverables: [
        {
          title: "Model portfolio refresh package",
          description: "Complete the analysis workbook, memo, review deck, and final package.",
          targetDate: "2026-01-30",
        },
        {
          title: "Cross-document consistency sweep",
          description: "Verify that figures, dates, and assumptions match across every deliverable.",
          targetDate: "2026-01-30",
        },
      ],
      activities: [
        {
          date: "2026-01-05",
          time: "09:00",
          summary: "Mapped source files, stakeholders, deadlines, and deliverables.",
          type: "planning",
          deliverableId: "dlv-001",
        },
        {
          date: "2026-01-06",
          time: "13:30",
          summary: "Updated the workbook and drafted the first recommendation memo.",
          type: "deep-work",
          deliverableId: "dlv-001",
        },
        {
          date: "2026-01-12",
          time: "15:00",
          summary: "Reconciled memo, deck, and model figures before final export.",
          type: "review",
          deliverableId: "dlv-002",
        },
      ],
    },
  },
  retrospective: {
    percentage: 100,
    score: 32,
    maxScore: 32,
    summary:
      "The demo environment includes a work brief, files, collaborators, evidence trail, downloadable artifacts, and a scorecard.",
    strengths: [
      "The agent has realistic source files and project history to inspect.",
      "The assignment requires multiple deliverables instead of one answer.",
      "The scorecard identifies reusable lessons from the run.",
    ],
    failureModes: [
      "Figures can drift across workbook, memo, deck, and PDF.",
      "Stakeholder feedback can be missed if it is not converted into explicit work items.",
    ],
    lessons: [
      "Every shared figure needs one authoritative source file.",
      "Daily context restoration matters for long-running work.",
      "Collaborator feedback needs to become structured evidence.",
      "Generated environments should open with a complete demo.",
    ],
    rubric: [
      { passed: true, points: 8, description: "Includes a profile, work brief, files, and simulation history." },
      { passed: true, points: 6, description: "Includes multiple artifact types." },
      { passed: true, points: 5, description: "Includes collaborator and review context." },
      { passed: true, points: 5, description: "Includes a scorecard and reusable lessons." },
    ],
  },
};

function initDemo() {
  let state = null;

  const summary = document.querySelector("#demo-summary");
  const form = document.querySelector("#generate-form");
  const persona = document.querySelector("#persona");
  const mode = document.querySelector("#mode");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    summary.innerHTML = `<div class="loading">Making workspace...</div>`;
    state = await fetchJson("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: persona.value, mode: mode.value }),
    }).catch(() => fallbackState);
    render();
  });

  fetchJson("/api/demo").catch(() => fallbackState).then((data) => {
    state = data;
    render();
  });

  function render() {
    if (!state) return;
    const { computer, retrospective } = state;
    renderFocusedDemo(computer, retrospective);
  }

  function renderFocusedDemo(computer, retrospective) {
    const files = computer.filesystem.files.slice(0, 6);
    const activities = computer.simulation.activities.slice(0, 3);
    const downloads = computer.artifacts.slice(0, 3);
    summary.innerHTML = `
      <div class="demo-focus-grid">
        <section class="demo-focus-card primary">
          <p class="eyebrow">task</p>
          <h2>${escapeHtml(computer.simulation.deliverables[0]?.title ?? "Client review package")}</h2>
          <p>${escapeHtml(computer.simulation.deliverables[0]?.description ?? "Use the workspace files to prepare the final client package.")}</p>
        </section>

        <section class="demo-focus-card score">
          <p class="eyebrow">score</p>
          <strong>${retrospective.percentage}%</strong>
          <p>${escapeHtml(retrospective.lessons[0] ?? "Keep shared facts tied to one source file.")}</p>
        </section>
      </div>

      <div class="demo-focus-card">
        <h2>Files</h2>
        <div class="file-pills">${files.map((file) => `<span>${escapeHtml(file.kind.toUpperCase())} ${escapeHtml(file.path.split("/").pop() ?? file.path)}</span>`).join("")}</div>
      </div>

      <div class="demo-focus-grid">
        <section class="demo-focus-card">
          <h2>Work history</h2>
          <div class="compact-timeline">${activities
            .map((activity) => `<article><time>${activity.date}</time><p>${escapeHtml(activity.summary)}</p></article>`)
            .join("")}</div>
        </section>

        <section class="demo-focus-card">
          <h2>Downloads</h2>
          <div class="download-list">${downloads
            .map(
              (artifact) => `
                <a href="${window.location.protocol === "file:" ? "#" : `/api/artifacts/${artifact.fileId}`}">
                  <span>${escapeHtml(artifact.kind.toUpperCase())}</span>
                  ${escapeHtml(artifact.title)}
                </a>
              `,
            )
            .join("")}</div>
        </section>
      </div>
    `;
  }

}

function initDocs() {
  const docs = {
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
          <li>Open your Worker URL and try the included demo run.</li>
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

  const docPath = window.location.protocol === "file:" ? docPathFromHash() : window.location.pathname;
  const doc = docs[docPath] ?? docs["/docs"];
  document.title = `Cloudbox Docs · ${doc.title}`;
  document.querySelector("#doc-page").innerHTML = `<h1>${doc.title}</h1>${doc.body}`;
  document.querySelectorAll("[data-doc]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (window.location.protocol !== "file:") return;
      event.preventDefault();
      window.location.hash = link.getAttribute("href").split("#")[1] ?? "start";
      initDocs();
    });
  });
}

function docPathFromHash() {
  return {
    "#quickstart": "/docs/quickstart",
    "#concepts": "/docs/concepts",
    "#api": "/docs/api",
    "#research": "/docs/research",
  }[window.location.hash] ?? "/docs";
}

async function fetchJson(path, init) {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json();
}

function section(title, items) {
  return `<article><h3>${title}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>`;
}

function stat(title, body) {
  return `<article><h2>${title}</h2><p>${body}</p></article>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
