import { describe, expect, it } from "vitest";
import { generateArtifactSet } from "../packages/artifacts/src/index.ts";
import { evaluateComputer } from "../packages/evals/src/index.ts";
import {
  buildSyntheticComputer,
  dependencyOrder,
  expandPersona,
  planFilesystem,
  seededComputer,
} from "../packages/synthetic-computer/src/index.ts";

describe("Cloudbox pipeline", () => {
  it("expands a persona into a complete user profile", () => {
    const profile = expandPersona({
      text: "A platform engineer leading Cloudflare migration reviews.",
    });

    expect(profile.identity).toContain("(");
    expect(profile.responsibilities.length).toBeGreaterThanOrEqual(4);
    expect(profile.currentProjects.length).toBeGreaterThanOrEqual(4);
    expect(profile.preferredTools.length).toBeGreaterThan(0);
  });

  it("plans a filesystem with valid dependency order", () => {
    const profile = expandPersona({ text: seededComputer.persona });
    const { filesystem } = planFilesystem(profile);
    const ordered = dependencyOrder(filesystem.files);

    expect(filesystem.directories.length).toBeGreaterThan(8);
    expect(filesystem.files.some((file) => file.dependsOn.length > 0)).toBe(true);
    expect(ordered.map((file) => file.id)).toContain("final-pdf");
    expect(ordered.at(-1)?.id).toBe("final-pdf");
  });

  it("generates downloadable artifacts for common productivity formats", () => {
    const computer = buildSyntheticComputer({ text: seededComputer.persona, mode: "short" });
    const generated = generateArtifactSet(computer.filesystem.files, computer.profile);

    expect(generated.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining(["docx", "xlsx", "pptx", "pdf"]),
    );
    expect(generated.every((artifact) => artifact.body.byteLength > 20)).toBe(true);
  });

  it("records simulated work, communications, and retrospective lessons", () => {
    const computer = buildSyntheticComputer({ text: seededComputer.persona, mode: "full-paper" });
    const retrospective = evaluateComputer(computer);

    expect(computer.simulation.period.workingDays).toBe(20);
    expect(computer.simulation.activities.length).toBeGreaterThan(20);
    expect(computer.simulation.communications.length).toBeGreaterThanOrEqual(3);
    expect(retrospective.percentage).toBeGreaterThanOrEqual(80);
    expect(retrospective.lessons.length).toBeGreaterThanOrEqual(4);
  });
});
