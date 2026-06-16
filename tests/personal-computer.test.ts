import { describe, expect, it } from "vitest";
import { api } from "../src/http.ts";
import { assertComputerPath } from "../src/sandbox-computer.ts";

function sandboxBinding() {
  const files = new Map<string, string>();
  const execCalls: Array<{ command: string; cwd?: string }> = [];
  const sandbox = {
    async exec(command: string, opts?: { cwd?: string }) {
      execCalls.push({ command, cwd: opts?.cwd });
      return { success: true, stdout: command === "pwd" ? `${opts?.cwd}\n` : "", stderr: "", exitCode: 0 };
    },
    async readFile(path: string) { return { content: files.get(path) ?? "" }; },
    async writeFile(path: string, content: string) { files.set(path, content); },
  };
  return {
    namespace: { idFromName: (name: string) => name, get: () => sandbox } as any,
    files,
    execCalls,
  };
}

describe("durable personal computer slice", () => {
  it("rejects paths outside /home/user", () => {
    expect(() => assertComputerPath("/tmp/not-owned")).toThrow(/inside \/home\/user/);
    expect(() => assertComputerPath("/home/user/src/../secret")).toThrow(/traversal/);
    expect(() => assertComputerPath("/home/user/src/project")).not.toThrow();
  });

  it("rejects public callers until trusted owner delegation exists", async () => {
    const response = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/me/exec", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ command: "pwd" }),
    }), { CLOUDBOX_API_TOKEN: "t" });
    expect(response.status).toBe(403);
    expect((await response.json() as any).error).toBe("computer_internal_only");
  });

  it("requires the Sandbox binding for trusted callers", async () => {
    const response = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/exec", {
      method: "POST",
      headers: { "content-type": "application/json", "x-cloudbox-internal-token": "i", "x-cloudbox-owner": "alice" },
      body: JSON.stringify({ command: "pwd" }),
    }), { CLOUDBOX_INTERNAL_TOKEN: "i" });
    expect(response.status).toBe(503);
    expect((await response.json() as any).error).toBe("sandbox_unavailable");
  });

  it("exposes a small authenticated Code Mode catalog", async () => {
    const fake = sandboxBinding();
    const env = { CLOUDBOX_INTERNAL_TOKEN: "i", CLOUDBOX_SANDBOX: fake.namespace, getComputerSandbox: () => fake.namespace.get("computer:alice") };
    const headers = { "x-cloudbox-internal-token": "i", "x-cloudbox-owner": "alice" };
    const catalog = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/code/catalog", { headers }), env);
    expect(catalog.status).toBe(200);
    expect((await catalog.json() as any).methods.map((method: any) => method.name)).toEqual([
      "info", "list", "read", "write", "exec", "repo_status", "repo_diff",
    ]);
  });

  it("uses the same owner computer for exec, write, and read after trusted delegation", async () => {
    const fake = sandboxBinding();
    const env = { CLOUDBOX_INTERNAL_TOKEN: "i", CLOUDBOX_SANDBOX: fake.namespace, getComputerSandbox: () => fake.namespace.get("computer:alice") };
    const auth = { "x-cloudbox-internal-token": "i", "x-cloudbox-owner": "alice", "content-type": "application/json" };
    const write = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/write", {
      method: "POST", headers: auth, body: JSON.stringify({ path: "/home/user/src/app/README.md", content: "hello" }),
    }), env);
    expect(write.status).toBe(200);
    const read = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/read?path=%2Fhome%2Fuser%2Fsrc%2Fapp%2FREADME.md", {
      headers: { "x-cloudbox-internal-token": "i", "x-cloudbox-owner": "alice" },
    }), env);
    expect(await read.json()).toMatchObject({ ok: true, content: "hello" });
    const exec = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/exec", {
      method: "POST", headers: auth, body: JSON.stringify({ command: "pwd", cwd: "/home/user/src/app" }),
    }), env);
    expect(await exec.json()).toMatchObject({ ok: true, stdout: "/home/user/src/app\n" });
    expect(fake.execCalls.some((call) => call.command.includes("mkdir -p /home/user"))).toBe(true);
  });
});
