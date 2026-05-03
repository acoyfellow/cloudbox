import { describe, expect, it } from "vitest";
import worker from "../apps/web/src/worker.ts";

describe("Cloudbox Worker API", () => {
  it("serves the seeded demo", async () => {
    const response = await worker.fetch(new Request("https://cloudbox.test/api/demo"), {});
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.computer.name).toContain("Cloudbox");
    expect(body.computer.filesystem.files.length).toBeGreaterThanOrEqual(6);
    expect(body.retrospective.lessons.length).toBeGreaterThan(0);
  });

  it("generates another synthetic computer", async () => {
    const response = await worker.fetch(
      new Request("https://cloudbox.test/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: "A staff platform engineer preparing incident simulation deliverables.",
          mode: "short",
        }),
      }),
      {},
    );
    const body = (await response.json()) as any;

    expect(response.status).toBe(201);
    expect(body.computer.profile.occupation).toBe("Staff Platform Engineer");
    expect(body.computer.simulation.period.workingDays).toBe(5);
  });

  it("downloads seeded artifacts", async () => {
    const response = await worker.fetch(new Request("https://cloudbox.test/api/artifacts/final-pdf"), {});
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("Final Recommendation Package.pdf");
    expect(body).toContain("Final Recommendation Package");
  });
});
