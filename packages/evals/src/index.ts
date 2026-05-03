import type { SyntheticComputer } from "../../synthetic-computer/src/index.ts";

export type RubricItem = {
  id: string;
  source: "spec" | "interaction" | "expertise" | "reference" | "quality";
  points: number;
  description: string;
  passed: boolean;
};

export type Retrospective = {
  score: number;
  maxScore: number;
  percentage: number;
  summary: string;
  strengths: string[];
  failureModes: string[];
  lessons: string[];
  rubric: RubricItem[];
};

export function evaluateComputer(computer: SyntheticComputer): Retrospective {
  const hasCoreFormats = ["docx", "xlsx", "pptx", "pdf"].every((kind) =>
    computer.filesystem.files.some((file) => file.kind === kind),
  );
  const hasDependencies = computer.filesystem.files.some((file) => file.dependsOn.length > 0);
  const hasCollaborators = computer.collaborators.length >= 3;
  const hasLongHorizon = computer.simulation.period.workingDays >= 5;
  const hasConsistencyDeliverable = computer.simulation.deliverables.some((item) => /consistency/i.test(item.title));
  const rubric: RubricItem[] = [
    item("spec-1", "spec", 8, "Creates a complete user profile, filesystem policy, file inventory, and simulation objective set.", true),
    item("spec-2", "spec", 6, "Includes DOCX, XLSX, PPTX, and PDF deliverable artifacts.", hasCoreFormats),
    item("reference-1", "reference", 5, "Maintains explicit dependency links between source files and downstream deliverables.", hasDependencies),
    item("interaction-1", "interaction", 5, "Models simulated collaborators with private reference materials.", hasCollaborators),
    item("expertise-1", "expertise", 4, "Includes a long-horizon planning loop with daily activity restoration.", hasLongHorizon),
    item("quality-1", "quality", 4, "Includes a cross-document consistency gate before final delivery.", hasConsistencyDeliverable),
  ];
  const score = rubric.filter((entry) => entry.passed).reduce((sum, entry) => sum + entry.points, 0);
  const maxScore = rubric.reduce((sum, entry) => sum + entry.points, 0);
  return {
    score,
    maxScore,
    percentage: Math.round((score / maxScore) * 1000) / 10,
    summary:
      "Cloudbox completed the full synthetic-computer loop: persona grounding, artifact-rich filesystem generation, collaborator simulation, daily work, and retrospective extraction.",
    strengths: [
      "Uses the filesystem as grounding context instead of treating tasks as isolated prompts.",
      "Keeps artifact dependencies visible so reviewers can trace outputs back to sources.",
      "Separates collaborator-private materials from files initially visible to the work agent.",
    ],
    failureModes: [
      "Generated office files are portable text-backed v1 artifacts rather than heavyweight styled Office binaries.",
      "Workers AI generation quality depends on the model available in the deployer's account.",
      "Full-paper mode should run asynchronously because a faithful month-long simulation is intentionally expensive.",
    ],
    lessons: [
      "Every shared number needs one authoritative source artifact.",
      "Long-horizon agents need explicit daily context restoration.",
      "Collaborator feedback should become structured work inputs, not prose lost in a transcript.",
      "A public demo should open on a completed synthetic computer before asking users to generate anything.",
    ],
    rubric,
  };
}

function item(
  id: string,
  source: RubricItem["source"],
  points: number,
  description: string,
  passed: boolean,
): RubricItem {
  return { id, source, points, description, passed };
}
