export type ArtifactKind = "docx" | "xlsx" | "pptx" | "pdf" | "md" | "csv" | "json";

export type PersonaInput = {
  id?: string;
  text: string;
  mode?: "demo" | "short" | "full-paper";
};

export type UserProfile = {
  id: string;
  identity: string;
  occupation: string;
  organization: string;
  location: string;
  careerStage: string;
  responsibilities: string[];
  recentWorkHistory: string[];
  currentProjects: string[];
  collaborators: string[];
  commonWorkProducts: string[];
  technicalLevel: "low" | "intermediate" | "high";
  computerUsageLevel: "low" | "medium" | "high";
  preferredTools: string[];
  documentHabits: string;
  spreadsheetUsage: string;
  attachmentSavingBehavior: string;
  namingPreferences: string;
  organizationStyle: string;
};

export type FilesystemPolicy = {
  systemStart: string;
  style: "windows" | "macos";
  defaultUserPaths: string[];
  storagePatterns: string[];
  namingStyle: string;
  usagePatterns: string;
};

export type PlannedFile = {
  id: string;
  path: string;
  kind: ArtifactKind;
  title: string;
  description: string;
  timestamp: string;
  origin: "synthesized" | "web-download" | "collaborator" | "agent-created";
  contentMode: "real-file" | "preview" | "source-reference";
  dependsOn: string[];
};

export type FilesystemPlan = {
  roots: string[];
  directories: string[];
  files: PlannedFile[];
};

export type Artifact = {
  fileId: string;
  path: string;
  kind: ArtifactKind;
  title: string;
  mimeType: string;
  bytes: number;
  preview: string;
  downloadName: string;
};

export type Collaborator = {
  id: string;
  name: string;
  role: string;
  background: string;
  communicationStyle: string;
  privateReferenceFiles: PlannedFile[];
};

export type Deliverable = {
  id: string;
  title: string;
  targetDate: string;
  description: string;
  expectedArtifactPaths: string[];
  dependsOn: string[];
};

export type Activity = {
  date: string;
  time: string;
  type: "planning" | "deep-work" | "review" | "outreach" | "revision" | "admin";
  summary: string;
  creates: string[];
  reads: string[];
  collaboratorId?: string;
  deliverableId: string;
};

export type Simulation = {
  id: string;
  period: { start: string; end: string; workingDays: number };
  deliverables: Deliverable[];
  activities: Activity[];
  communications: Array<{
    date: string;
    from: string;
    to: string;
    subject: string;
    body: string;
    sharedFileIds: string[];
  }>;
  generatedFileIds: string[];
};

export type SyntheticComputer = {
  id: string;
  name: string;
  createdAt: string;
  persona: string;
  profile: UserProfile;
  policy: FilesystemPolicy;
  filesystem: FilesystemPlan;
  artifacts: Artifact[];
  collaborators: Collaborator[];
  simulation: Simulation;
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

const stableId = (prefix: string, text: string) => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `${prefix}_${hash.toString(36)}`;
};

export function expandPersona(input: PersonaInput): UserProfile {
  const persona = input.text.trim() || seededPersona;
  const finance = /advisor|investment|portfolio|finance|wealth|asset/i.test(persona);
  const builder = /engineer|developer|software|cloud|platform|security/i.test(persona);
  const id = input.id ?? stableId("profile", persona);

  if (builder) {
    return {
      id,
      identity: "Riley Chen (rchen)",
      occupation: "Staff Platform Engineer",
      organization: "Northstar Cloud Systems",
      location: "Portland, Oregon",
      careerStage: "Staff; 12 years across distributed systems, reliability, and developer platforms.",
      responsibilities: [
        "Designing internal platform primitives",
        "Maintaining incident-response automation",
        "Reviewing architecture proposals",
        "Mentoring service teams on production readiness",
      ],
      recentWorkHistory: [
        "2025 Q3 migrated three services to Workers-based edge APIs",
        "2025 Q4 authored the platform reliability scorecard",
        "2026 Q1 began durable workflow evaluation for deployment operations",
      ],
      currentProjects: [
        "Edge deployment control plane",
        "Incident simulation toolkit",
        "Developer self-service dashboard",
        "Quarterly production-readiness review",
      ],
      collaborators: ["Maya Patel", "Owen Brooks", "Tessa Nguyen", "Ari Feld"],
      commonWorkProducts: ["Architecture memos", "runbooks", "migration spreadsheets", "readiness decks"],
      technicalLevel: "high",
      computerUsageLevel: "high",
      preferredTools: ["VS Code", "Sheets", "Docs", "Slides", "Workers dashboard"],
      documentHabits: "Writes design docs with decision logs and links every chart back to source data.",
      spreadsheetUsage: "Tracks service readiness and incident metrics in multi-tab workbooks.",
      attachmentSavingBehavior: "Keeps exports and meeting notes next to the owning project.",
      namingPreferences: "Uses date-prefixed project filenames with explicit version suffixes.",
      organizationStyle: "Tidy project folders with some stale export clutter in Downloads.",
    };
  }

  return {
    id,
    identity: finance ? "Margaret Elaine Forsythe (mforsythe)" : "Jordan Vale (jvale)",
    occupation: finance ? "Senior Financial Advisor" : "Operations Strategy Lead",
    organization: finance ? "Meridian Wealth Partners" : "Cedarline Health Network",
    location: finance ? "Denver, Colorado" : "Chicago, Illinois",
    careerStage: finance
      ? "Senior; 16 years in portfolio management and long-term investment planning."
      : "Director-level; 11 years in cross-functional operations and executive reporting.",
    responsibilities: finance
      ? [
          "Constructing client portfolios",
          "Interpreting capital-market forecasts",
          "Presenting recommendations to an investment committee",
          "Mentoring junior advisors",
        ]
      : [
          "Synthesizing operating metrics",
          "Coordinating regional managers",
          "Preparing executive reviews",
          "Tracking budget and staffing risks",
        ],
    recentWorkHistory: finance
      ? [
          "2025 H1 refreshed strategic allocation framework",
          "2025 H2 rewrote IPS templates for 28 client accounts",
          "2026 Q1 presented updated 10-year assumptions to the investment committee",
        ]
      : [
          "2025 Q3 consolidated regional staffing reports",
          "2025 Q4 built executive escalation dashboard",
          "2026 Q1 piloted a new patient-throughput review cadence",
        ],
    currentProjects: finance
      ? [
          "2026 model portfolio refresh",
          "High-net-worth client onboarding",
          "Systematic rebalancing trigger framework",
          "ESG overlay recommendation",
        ]
      : [
          "Q2 operating review",
          "Regional staffing capacity plan",
          "Patient-throughput improvement memo",
          "Budget variance reconciliation",
        ],
    collaborators: finance
      ? ["David Hartley", "Kevin Tran", "Sandra Okonkwo", "James Whitfield", "Patricia Huang"]
      : ["Nora Shaw", "Priya Menon", "Luis Ortega", "Camille Reed"],
    commonWorkProducts: finance
      ? ["Investment Policy Statements", "allocation workbooks", "client review decks", "PDF briefings"]
      : ["Executive memos", "capacity models", "operating decks", "regional scorecards"],
    technicalLevel: "intermediate",
    computerUsageLevel: "high",
    preferredTools: finance ? ["Excel", "Word", "PowerPoint", "PDF"] : ["Sheets", "Docs", "Slides", "CSV exports"],
    documentHabits: "Drafts in analysis files first, then summarizes into memos and decks.",
    spreadsheetUsage: "Heavy; uses scenario tabs, source registries, and date-stamped versions.",
    attachmentSavingBehavior: "Retains source PDFs, exports, and stakeholder attachments in project folders.",
    namingPreferences: "Descriptive filenames with version suffixes and final PDF exports.",
    organizationStyle: "Systematic project folders with occasional duplicate drafts.",
  };
}

export function planFilesystem(profile: UserProfile): { policy: FilesystemPolicy; filesystem: FilesystemPlan } {
  const user = profile.identity.match(/\(([^)]+)\)/)?.[1] ?? slug(profile.identity);
  const windowsRoot = `C:/Users/${user}`;
  const projectRoot = profile.occupation.includes("Engineer") ? "D:/PlatformWork" : "D:/ClientWork";
  const dirs = [
    `${windowsRoot}/Desktop`,
    `${windowsRoot}/Documents`,
    `${windowsRoot}/Downloads`,
    `${windowsRoot}/Pictures/Screenshots`,
    `${projectRoot}`,
    "D:/Research",
    "D:/Reports",
    "D:/Presentations",
    "D:/Archive",
  ];
  for (const project of profile.currentProjects) dirs.push(`${projectRoot}/${slug(project)}`);

  const files: PlannedFile[] = [
    file("source-brief", "D:/Research/Market or Ops Source Packet 2026.pdf", "pdf", "Source Packet", "External source packet used as grounding material.", "2026-01-03", []),
    file("analysis-v1", `${projectRoot}/${slug(profile.currentProjects[0])}/Analysis Model v1.xlsx`, "xlsx", "Analysis Model v1", "Initial workbook with assumptions, source registry, and scenario calculations.", "2026-01-06", ["source-brief"]),
    file("memo-draft", `${projectRoot}/${slug(profile.currentProjects[0])}/Recommendation Memo DRAFT.docx`, "docx", "Recommendation Memo Draft", "Draft memo summarizing the analysis and open questions.", "2026-01-09", ["analysis-v1"]),
    file("deck-draft", `D:/Presentations/${slug(profile.currentProjects[0])} Review Deck v1.pptx`, "pptx", "Review Deck v1", "Stakeholder presentation with executive summary, findings, and decision asks.", "2026-01-12", ["analysis-v1", "memo-draft"]),
    file("final-pdf", `${projectRoot}/${slug(profile.currentProjects[0])}/Final Recommendation Package.pdf`, "pdf", "Final Recommendation Package", "Final PDF package exported after collaborator review.", "2026-01-30", ["memo-draft", "deck-draft"]),
    file("activity-log", `${windowsRoot}/Documents/Activity Log 2026-01.md`, "md", "Activity Log", "Daily working notes and decision trail.", "2026-01-30", ["analysis-v1"]),
  ];

  return {
    policy: {
      systemStart: "2024-11-05T17:41:00-07:00",
      style: "windows",
      defaultUserPaths: [`${windowsRoot}/Desktop`, `${windowsRoot}/Documents`, `${windowsRoot}/Downloads`],
      storagePatterns: [
        `Project work goes under ${projectRoot}`,
        "External source materials go under D:/Research",
        "Final decks go under D:/Presentations",
      ],
      namingStyle: profile.namingPreferences,
      usagePatterns: profile.organizationStyle,
    },
    filesystem: { roots: ["C:/", "D:/"], directories: dirs, files },
  };
}

function file(
  id: string,
  path: string,
  kind: ArtifactKind,
  title: string,
  description: string,
  timestamp: string,
  dependsOn: string[],
): PlannedFile {
  return { id, path, kind, title, description, timestamp, origin: "synthesized", contentMode: "real-file", dependsOn };
}

export function dependencyOrder(files: PlannedFile[]): PlannedFile[] {
  const remaining = new Map(files.map((f) => [f.id, f]));
  const emitted = new Set<string>();
  const ordered: PlannedFile[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((file) => file.dependsOn.every((id) => emitted.has(id) || !remaining.has(id)))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (ready.length === 0) {
      throw new Error("filesystem dependency graph contains a cycle");
    }
    for (const item of ready) {
      ordered.push(item);
      emitted.add(item.id);
      remaining.delete(item.id);
    }
  }
  return ordered;
}

export function createCollaborators(profile: UserProfile): Collaborator[] {
  return profile.collaborators.slice(0, 5).map((name, index) => ({
    id: `collab-${index + 1}`,
    name,
    role: ["Manager", "Peer reviewer", "Client or stakeholder", "Compliance reviewer", "External data provider"][index] ?? "Collaborator",
    background: `${name} knows ${profile.identity.split(" ")[0]}'s work context and owns a different part of the review loop.`,
    communicationStyle: ["Terse and decision-oriented", "Technical and exacting", "Detailed and preference-heavy", "Policy-focused", "Responsive but limited"][index] ?? "Direct",
    privateReferenceFiles: [
      file(`private-${index + 1}`, `collaborators/${slug(name)}/Reference Notes.docx`, "docx", `${name} Reference Notes`, `Private material ${name} can share during the simulation.`, "2026-01-04", []),
    ],
  }));
}

export function runSimulation(profile: UserProfile, filesystem: FilesystemPlan, collaborators: Collaborator[], mode: PersonaInput["mode"] = "demo"): Simulation {
  const days = mode === "full-paper" ? 20 : mode === "short" ? 5 : 3;
  const deliverables: Deliverable[] = [
    {
      id: "dlv-001",
      title: `${profile.currentProjects[0]} final package`,
      targetDate: "2026-01-30",
      description: "Complete the core work package using existing files, collaborator feedback, and final export artifacts.",
      expectedArtifactPaths: filesystem.files.filter((f) => ["docx", "xlsx", "pptx", "pdf"].includes(f.kind)).map((f) => f.path),
      dependsOn: [],
    },
    {
      id: "dlv-002",
      title: "Cross-document consistency sweep",
      targetDate: "2026-01-30",
      description: "Ensure figures, assumptions, dates, and recommendations match across workbook, memo, deck, and PDF.",
      expectedArtifactPaths: [filesystem.files.find((f) => f.id === "activity-log")?.path ?? "Activity Log.md"],
      dependsOn: ["dlv-001"],
    },
  ];
  const activities: Activity[] = [];
  const generated = filesystem.files.map((f) => f.id);
  for (let day = 0; day < days; day += 1) {
    const date = `2026-01-${String(5 + day).padStart(2, "0")}`;
    activities.push({
      date,
      time: "09:00",
      type: day === 0 ? "planning" : "review",
      summary: day === 0 ? "Restored context, mapped source files, and created the weekly work plan." : "Reviewed prior activity log and collaborator replies.",
      creates: day === 0 ? [filesystem.files.find((f) => f.id === "activity-log")?.path ?? "Activity Log.md"] : [],
      reads: filesystem.files.slice(0, 2).map((f) => f.path),
      deliverableId: "dlv-001",
    });
    activities.push({
      date,
      time: "13:30",
      type: "deep-work",
      summary: `Advanced ${profile.currentProjects[0]} by updating the source model, memo, and review deck.`,
      creates: filesystem.files.slice(1, 5).map((f) => f.path),
      reads: filesystem.files.slice(0, 3).map((f) => f.path),
      deliverableId: "dlv-001",
    });
  }

  return {
    id: stableId("sim", `${profile.id}:${days}`),
    period: { start: "2026-01-05", end: days === 20 ? "2026-01-30" : `2026-01-${String(4 + days).padStart(2, "0")}`, workingDays: days },
    deliverables,
    activities,
    communications: collaborators.slice(0, 3).map((collab, index) => ({
      date: `2026-01-0${6 + index}`,
      from: profile.identity,
      to: collab.name,
      subject: `${profile.currentProjects[0]} - input needed`,
      body: `Requesting ${collab.role.toLowerCase()} feedback and any reference files for the current work package.`,
      sharedFileIds: collab.privateReferenceFiles.map((f) => f.id),
    })),
    generatedFileIds: generated,
  };
}

export const seededPersona =
  "A senior financial advisor responsible for portfolio refreshes, high-net-worth onboarding, investment committee materials, compliance review, and multi-artifact client deliverables.";

export function buildSyntheticComputer(input: PersonaInput = { text: seededPersona, mode: "demo" }): SyntheticComputer {
  const profile = expandPersona(input);
  const { policy, filesystem } = planFilesystem(profile);
  const collaborators = createCollaborators(profile);
  const artifacts = dependencyOrder(filesystem.files).map((planned) => ({
    fileId: planned.id,
    path: planned.path,
    kind: planned.kind,
    title: planned.title,
    mimeType: mimeType(planned.kind),
    bytes: 8_000 + planned.description.length * 53,
    preview: `${planned.title}\n\n${planned.description}\n\nDerived from: ${planned.dependsOn.length ? planned.dependsOn.join(", ") : "original source"}.`,
    downloadName: planned.path.split("/").at(-1) ?? `${planned.id}.${planned.kind}`,
  }));
  const simulation = runSimulation(profile, filesystem, collaborators, input.mode);
  return {
    id: stableId("box", input.text),
    name: `${profile.identity.split(" ")[0]}'s Cloudbox`,
    createdAt: "2026-05-03T00:00:00.000Z",
    persona: input.text,
    profile,
    policy,
    filesystem,
    artifacts,
    collaborators,
    simulation,
  };
}

export function mimeType(kind: ArtifactKind): string {
  return {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    pdf: "application/pdf",
    md: "text/markdown; charset=utf-8",
    csv: "text/csv; charset=utf-8",
    json: "application/json; charset=utf-8",
  }[kind];
}

export const seededComputer = buildSyntheticComputer({ text: seededPersona, mode: "full-paper" });
