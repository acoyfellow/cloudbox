const pageType = document.body.dataset.page;

if (pageType === "home") initHome();
if (pageType === "demo") initDemo();
if (pageType === "docs") initDocs();

async function initHome() {
  const proof = document.querySelector("#proof-strip");
  const state = await fetchJson("/api/demo");
  const { computer, retrospective } = state;
  proof.innerHTML = [
    stat("Cloudbox", computer.name),
    stat("Artifacts", `${computer.artifacts.length} downloadable files`),
    stat("Work log", `${computer.simulation.period.workingDays} simulated workdays`),
    stat("Scorecard", `${retrospective.percentage}% with ${retrospective.lessons.length} lessons`),
  ].join("");
}

function initDemo() {
  let state = null;
  let activeTab = "world";

  const summary = document.querySelector("#summary");
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
    });
    render();
  });

  fetchJson("/api/demo").then((data) => {
    state = data;
    render();
  });

  function render() {
    if (!state) return;
    const { computer, retrospective } = state;
    summary.innerHTML = [
      stat("Profile", `${computer.profile.identity}<br>${computer.profile.occupation}`),
      stat("Files", `${computer.filesystem.files.length} files<br>${computer.filesystem.directories.length} directories`),
      stat("Run", `${computer.simulation.period.workingDays} workdays<br>${computer.simulation.activities.length} activities`),
      stat("Score", `${retrospective.percentage}%<br>${retrospective.score}/${retrospective.maxScore} points`),
    ].join("");

    if (activeTab === "world") renderWorld(computer);
    if (activeTab === "brief") renderBrief(computer);
    if (activeTab === "evidence") renderEvidence(computer);
    if (activeTab === "scorecard") renderScorecard(retrospective);
    if (activeTab === "downloads") renderDownloads(computer);
  }

  function renderWorld(computer) {
    panel.innerHTML = `
      <div class="split">
        <div>
          <h2>${escapeHtml(computer.name)}</h2>
          <p>${escapeHtml(computer.profile.organization)} · ${escapeHtml(computer.profile.location)}</p>
          <h3>Work habits</h3>
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

  function renderBrief(computer) {
    panel.innerHTML = `<div class="cards two-col">
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
        <h3>Collaborators</h3>
        <ul>${computer.collaborators.map((collab) => `<li>${escapeHtml(collab.name)} · ${escapeHtml(collab.role)}</li>`).join("")}</ul>
      </article>
    </div>`;
  }

  function renderEvidence(computer) {
    panel.innerHTML = `<div class="timeline">${computer.simulation.activities
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

  function renderScorecard(retrospective) {
    panel.innerHTML = `
      <h2>${retrospective.percentage}% scorecard</h2>
      <p>${escapeHtml(retrospective.summary)}</p>
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
            <a class="link-button" href="/api/artifacts/${artifact.fileId}">Download ${artifact.kind.toUpperCase()}</a>
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
          <li>Open your Worker URL and inspect the dogfooded run.</li>
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

  const doc = docs[window.location.pathname] ?? docs["/docs"];
  document.title = `Cloudbox Docs · ${doc.title}`;
  document.querySelector("#doc-page").innerHTML = `<h1>${doc.title}</h1>${doc.body}`;
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
