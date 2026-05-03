import type { Artifact, PlannedFile, UserProfile } from "../../synthetic-computer/src/index.ts";
import { mimeType } from "../../synthetic-computer/src/index.ts";

export type GeneratedArtifact = Artifact & {
  body: Uint8Array;
};

const encoder = new TextEncoder();

export function generateArtifact(file: PlannedFile, profile: UserProfile): GeneratedArtifact {
  const body = renderBody(file, profile);
  const bytes = encoder.encode(body);
  return {
    fileId: file.id,
    path: file.path,
    kind: file.kind,
    title: file.title,
    mimeType: mimeType(file.kind),
    bytes: bytes.byteLength,
    preview: body.slice(0, 900),
    downloadName: file.path.split("/").at(-1) ?? `${file.id}.${file.kind}`,
    body: bytes,
  };
}

export function generateArtifactSet(files: PlannedFile[], profile: UserProfile): GeneratedArtifact[] {
  return files.map((file) => generateArtifact(file, profile));
}

export function exportManifest(artifacts: Artifact[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date(0).toISOString(),
      files: artifacts.map((artifact) => ({
        path: artifact.path,
        kind: artifact.kind,
        mimeType: artifact.mimeType,
        bytes: artifact.bytes,
      })),
    },
    null,
    2,
  );
}

function renderBody(file: PlannedFile, profile: UserProfile): string {
  if (file.kind === "xlsx") {
    return [
      "Sheet,Cell,Value",
      `Summary,A1,${file.title}`,
      `Summary,A2,Owner: ${profile.identity}`,
      "Assumptions,A1,Source registry present",
      "Scenarios,A1,Base / downside / upside",
      "Checks,A1,Cross-document consistency required before final export",
    ].join("\n");
  }
  if (file.kind === "pptx") {
    return [
      `# ${file.title}`,
      "## Slide 1 - Executive summary",
      `Owner: ${profile.identity}`,
      "## Slide 2 - Evidence and source files",
      "## Slide 3 - Recommendation and open decisions",
      "## Slide 4 - Risks, compliance, and next steps",
    ].join("\n\n");
  }
  if (file.kind === "pdf") {
    return [
      `%PDF-Cloudbox-Text`,
      file.title,
      "",
      file.description,
      "",
      `Prepared for ${profile.organization}.`,
      "This lightweight PDF-compatible demo body is stored as text for first-deploy portability.",
    ].join("\n");
  }
  if (file.kind === "json") {
    return JSON.stringify({ title: file.title, owner: profile.identity, description: file.description }, null, 2);
  }
  return [
    `# ${file.title}`,
    "",
    `Owner: ${profile.identity}`,
    `Organization: ${profile.organization}`,
    "",
    "## Purpose",
    file.description,
    "",
    "## Source Discipline",
    file.dependsOn.length ? `Derived from ${file.dependsOn.join(", ")}.` : "Original source artifact.",
    "",
    "## Review Checklist",
    "- Confirm all shared figures against the source model.",
    "- Record collaborator feedback before final export.",
    "- Run the cross-document consistency sweep.",
  ].join("\n");
}
