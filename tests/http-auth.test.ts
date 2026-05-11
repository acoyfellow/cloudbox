// Auth + demo-bypass coverage for the non-/api/runs endpoints. /api/runs is
// covered in detail by tests/http-runs.test.ts.
import { describe, expect, it } from "vitest";
import { api } from "../src/http.ts";
import type { ComputerSpec } from "../src/spec.ts";

const validSpec: ComputerSpec = {
  profile: { role: "engineer" },
  filesystem: [],
  collaborators: [],
  objectives: [],
  rubric: [],
};

const demoSpec: ComputerSpec = {
  name: "agent-launch-readiness",
  runId: "browser-test",
  profile: { role: "engineer" },
  filesystem: [],
  collaborators: [],
  objectives: [],
  rubric: [],
};

function postComputers(spec: unknown, headers: Record<string, string> = {}) {
  return new Request("https://cloudbox.test/api/computers", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(spec),
  });
}

describe("/api/computers auth + demo bypass", () => {
  it("requires a token when one is configured", async () => {
    const response = await api.fetch(postComputers(validSpec), { CLOUDBOX_API_TOKEN: "secret" });
    expect(response.status).toBe(401);
  });

  it("accepts a valid bearer token", async () => {
    const response = await api.fetch(
      postComputers(validSpec, { authorization: "Bearer secret" }),
      { CLOUDBOX_API_TOKEN: "secret" },
    );
    // No CLOUDBOX_COMPUTER binding → falls through to local materialize.
    expect(response.status).toBe(201);
  });

  it("allows the launch-readiness demo spec without a token", async () => {
    // The demo spec is the only spec shape that bypasses auth — make sure the
    // shape match is tight: both name and a browser- runId are required.
    const response = await api.fetch(postComputers(demoSpec), { CLOUDBOX_API_TOKEN: "secret" });
    expect(response.status).toBe(201);
  });

  it("does NOT bypass auth on a spec with the right name but wrong runId", async () => {
    const response = await api.fetch(
      postComputers({ ...demoSpec, runId: "attacker" }),
      { CLOUDBOX_API_TOKEN: "secret" },
    );
    expect(response.status).toBe(401);
  });

  it("does NOT bypass auth on a spec with the right runId prefix but wrong name", async () => {
    const response = await api.fetch(
      postComputers({ ...demoSpec, name: "not-launch-readiness" }),
      { CLOUDBOX_API_TOKEN: "secret" },
    );
    expect(response.status).toBe(401);
  });
});

describe("/api/c/:id/:action auth + demo bypass", () => {
  it("requires a token when configured and demo header is absent", async () => {
    const response = await api.fetch(
      new Request("https://cloudbox.test/api/c/demo/state", { method: "GET" }),
      { CLOUDBOX_COMPUTER: { idFromName: () => "id", get: () => ({ fetch: async () => new Response("{}") }) } as any, CLOUDBOX_API_TOKEN: "secret" },
    );
    expect(response.status).toBe(401);
  });

  it("allows the demo header to bypass auth on action routes", async () => {
    const response = await api.fetch(
      new Request("https://cloudbox.test/api/c/demo/state", {
        method: "GET",
        headers: { "x-cloudbox-demo": "1" },
      }),
      {
        CLOUDBOX_API_TOKEN: "secret",
        CLOUDBOX_COMPUTER: {
          idFromName: (name: string) => name,
          get: () => ({ fetch: async () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }) }),
        } as any,
      },
    );
    expect(response.status).toBe(200);
  });

  it("rejects an invalid token on action routes", async () => {
    // Need a CLOUDBOX_COMPUTER binding present so the route doesn't fall
    // through to the local-demo handler before auth runs.
    let fetched = false;
    const response = await api.fetch(
      new Request("https://cloudbox.test/api/c/demo/state", {
        method: "GET",
        headers: { authorization: "Bearer wrong" },
      }),
      {
        CLOUDBOX_API_TOKEN: "secret",
        CLOUDBOX_COMPUTER: {
          idFromName: (name: string) => name,
          get: () => ({ fetch: async () => { fetched = true; return new Response("{}"); } }),
        } as any,
      },
    );
    expect(response.status).toBe(401);
    expect(fetched).toBe(false);
  });
});
