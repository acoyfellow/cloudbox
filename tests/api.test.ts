import { describe, expect, it } from "vitest";
import worker from "../src/worker-lite.ts";

describe("Cloudbox Worker", () => {
  it("reports health", async () => {
    const response = await worker.fetch(new Request("https://cloudbox.test/api/health"));
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.name).toBe("cloudbox");
  });

  it("rejects malformed spec on /computers", async () => {
    const response = await worker.fetch(
      new Request("https://cloudbox.test/computers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ not: "a spec" }),
      }),
    );
    const body = (await response.json()) as any;
    expect(response.status).toBe(400);
    expect(body.error).toBe("bad_spec");
  });

  it("rejects empty brief", async () => {
    const response = await worker.fetch(
      new Request("https://cloudbox.test/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const body = (await response.json()) as any;
    expect(response.status).toBe(400);
    expect(body.error).toBe("bad_request");
  });
});
