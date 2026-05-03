let state = null;
let activeTab = "filesystem";

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
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: persona.value, mode: mode.value }),
  });
  state = await response.json();
  render();
});

async function load() {
  const response = await fetch("/api/demo");
  state = await response.json();
  render();
}

function render() {
  if (!state) return;
  const { computer, retrospective } = state;
  summary.innerHTML = [
    card("Profile", `${computer.profile.identity}<br>${computer.profile.occupation}`),
    card("Files", `${computer.filesystem.files.length} files<br>${computer.filesystem.directories.length} directories`),
    card("Simulation", `${computer.simulation.period.workingDays} workdays<br>${computer.simulation.activities.length} activities`),
    card("Score", `${retrospective.percentage}%<br>${retrospective.score}/${retrospective.maxScore} points`),
  ].join("");

  if (activeTab === "filesystem") renderFilesystem(computer);
  if (activeTab === "artifacts") renderArtifacts(computer);
  if (activeTab === "collaborators") renderCollaborators(computer);
  if (activeTab === "simulation") renderSimulation(computer);
  if (activeTab === "retrospective") renderRetrospective(retrospective);
}

function renderFilesystem(computer) {
  panel.innerHTML = `
    <div class="split">
      <div>
        <h2>${computer.name}</h2>
        <p>${computer.profile.organization} · ${computer.profile.location}</p>
        <h3>Policy</h3>
        <ul>${computer.policy.storagePatterns.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
      <div class="tree">${computer.filesystem.files
        .map((file) => `<div><span>${file.kind}</span>${escapeHtml(file.path)}</div>`)
        .join("")}</div>
    </div>
  `;
}

function renderArtifacts(computer) {
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

function renderCollaborators(computer) {
  panel.innerHTML = `<div class="cards">${computer.collaborators
    .map(
      (collab) => `
        <article>
          <h3>${escapeHtml(collab.name)}</h3>
          <p><strong>${escapeHtml(collab.role)}</strong></p>
          <p>${escapeHtml(collab.background)}</p>
          <p>${escapeHtml(collab.communicationStyle)}</p>
        </article>
      `,
    )
    .join("")}</div>`;
}

function renderSimulation(computer) {
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

function renderRetrospective(retrospective) {
  panel.innerHTML = `
    <h2>${retrospective.percentage}% retrospective score</h2>
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

function section(title, items) {
  return `<article><h3>${title}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>`;
}

function card(title, body) {
  return `<article><h2>${title}</h2><p>${body}</p></article>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

load();
