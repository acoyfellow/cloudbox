const pageType = document.body.dataset.page;

if (pageType === "home") initHome();
if (pageType === "demo") initDemo();
if (pageType === "docs") initDocs();

async function initHome() {
  const proof = document.querySelector("#proof-strip");
  const state = await fetchJson("/api/demo").catch(() => fallbackState);
  const { computer, retrospective } = state;
  proof.innerHTML = [
    stat("Worker", "Profile from a short description"),
    stat("Files", "Folders, sources, drafts, coworkers, deadlines"),
    stat("Work history", `${computer.artifacts.length} files, ${computer.simulation.period.workingDays} days`),
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
  let activeTab = "scenario";

  const guide = document.querySelector("#demo-guide");
  const panel = document.querySelector("#panel");
  const form = document.querySelector("#generate-form");
  const persona = document.querySelector("#persona");
  const mode = document.querySelector("#mode");

  document.querySelectorAll(".tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      document.querySelectorAll(".tabs button").forEach((item) => item.classList.toggle("active", item === button));
      render();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    panel.innerHTML = `<div class="loading">Generating Cloudbox...</div>`;
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
    guide.innerHTML = [
      stat("1. Scenario", "A realistic workplace task with deadlines and review requirements"),
      stat("2. Workspace", `${computer.filesystem.files.length} files across ${computer.filesystem.directories.length} folders`),
      stat("3. Agent work", `${computer.simulation.activities.length} recorded activities over ${computer.simulation.period.workingDays} workdays`),
      stat("4. Results", `${retrospective.percentage}% scorecard plus reusable lessons`),
    ].join("");

    if (activeTab === "scenario") renderScenario(computer);
    if (activeTab === "workspace") renderWorkspace(computer);
    if (activeTab === "work") renderWork(computer);
    if (activeTab === "results") renderResults(retrospective);
    if (activeTab === "downloads") renderDownloads(computer);
  }

  function renderScenario(computer) {
    panel.innerHTML = `
      <div class="scenario-layout">
        <section>
          <p class="eyebrow">what you are testing</p>
          <h2>Can an agent complete a multi-file client review package?</h2>
          <p class="lede small">The agent has to use source files, update an analysis workbook, create a memo and deck, respond to reviewer expectations, and keep final numbers consistent.</p>
        </section>
        <div class="cards two-col">
          ${computer.simulation.deliverables
            .map(
              (item) => `
                <article>
                  <h3>${escapeHtml(item.title)}</h3>
                  <p>${escapeHtml(item.description)}</p>
                  <p><strong>Target:</strong> ${escapeHtml(item.targetDate)}</p>
                </article>
              `,
            )
            .join("")}
          <article>
            <h3>Who is involved?</h3>
            <ul>${computer.collaborators.map((collab) => `<li>${escapeHtml(collab.name)} · ${escapeHtml(collab.role)}</li>`).join("")}</ul>
          </article>
          <article>
            <h3>What can go wrong?</h3>
            <p>Figures can drift across spreadsheet, memo, deck, and PDF. Cloudbox turns that into an explicit scorecard item.</p>
          </article>
        </div>
      </div>`;
  }

  function renderWorkspace(computer) {
    panel.innerHTML = `
      <div class="split">
        <div>
          <h2>The generated workspace</h2>
          <p>${escapeHtml(computer.profile.organization)} · ${escapeHtml(computer.profile.location)}</p>
          <h3>Why this matters</h3>
          <p>Real office work is grounded in existing files, habits, drafts, and folder structure. This is the context the agent must use.</p>
          <h3>Generated work habits</h3>
          <ul>
            <li>${escapeHtml(computer.profile.documentHabits)}</li>
            <li>${escapeHtml(computer.profile.spreadsheetUsage)}</li>
            <li>${escapeHtml(computer.profile.organizationStyle)}</li>
          </ul>
        </div>
        <div class="tree">${computer.filesystem.files
          .map((file) => `<div><span>${file.kind}</span>${escapeHtml(file.path)}</div>`)
          .join("")}</div>
      </div>
    `;
  }

  function renderWork(computer) {
    panel.innerHTML = `
      <h2>What the agent did</h2>
      <p class="panel-intro">Cloudbox records the work trail so you can inspect whether the agent planned, used files, revised outputs, and handled review requirements.</p>
      <div class="timeline">${computer.simulation.activities
      .map(
        (activity) => `
          <article>
            <time>${activity.date} ${activity.time}</time>
            <h3>${escapeHtml(activity.summary)}</h3>
            <p>${activity.type} · ${activity.deliverableId}</p>
          </article>
        `,
      )
      .join("")}</div>`;
  }

  function renderResults(retrospective) {
    panel.innerHTML = `
      <h2>What the scorecard found</h2>
      <p>${escapeHtml(retrospective.summary)}</p>
      <div class="result-score">${retrospective.percentage}%</div>
      <div class="cards">
        ${section("Strengths", retrospective.strengths)}
        ${section("Failure modes", retrospective.failureModes)}
        ${section("Lessons", retrospective.lessons)}
      </div>
      <div class="rubric">${retrospective.rubric
        .map((item) => `<div><span>${item.passed ? "pass" : "miss"}</span>${item.points}pt · ${escapeHtml(item.description)}</div>`)
        .join("")}</div>
    `;
  }

  function renderDownloads(computer) {
    panel.innerHTML = `<div class="artifact-list">${computer.artifacts
      .map(
        (artifact) => `
          <article>
            <div>
              <h3>${escapeHtml(artifact.title)}</h3>
              <p>${escapeHtml(artifact.path)}</p>
            </div>
            <a class="link-button" href="${window.location.protocol === "file:" ? "#" : `/api/artifacts/${artifact.fileId}`}">Download ${artifact.kind.toUpperCase()}</a>
            <pre>${escapeHtml(artifact.preview)}</pre>
          </article>
        `,
      )
      .join("")}</div>`;
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
