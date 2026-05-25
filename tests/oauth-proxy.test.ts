import { describe, expect, it, vi } from "vitest";
import { api } from "../src/http.ts";
import { findGitLabApplication, MemoryOAuthFlowStore } from "../src/oauth-proxy.ts";

const headers = { "content-type": "application/json", "x-cloudbox-internal-token": "i", "x-cloudbox-owner": "alice" };
const gitlab = { id: "gitlab-app", hostname: "gitlab-access.cfdata.org", hostAliases: ["gitlab.cfdata.org"] };
function proxy() {
  return {
    listAvailableApplications: vi.fn().mockReturnValue([gitlab]),
    listApplications: vi.fn().mockResolvedValue({ ok: true, data: [{ appId: "gitlab-app", status: "connected" }] }),
    startAuth: vi.fn().mockResolvedValue({ ok: true, data: { authorizationUrl: "https://authorize.example", state: "state" } }),
    completeAuth: vi.fn().mockResolvedValue({ ok: true, data: { status: "connected" } }),
    deleteApplication: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    oauthFetch: vi.fn(),
  };
}

describe("OAuth proxy GitLab selection", () => {
  it("selects the configured cfdata GitLab application", () => {
    expect(findGitLabApplication([{ id: "other", hostname: "example.com" }, gitlab])).toEqual(gitlab);
  });
});

describe("internal GitLab connection routes", () => {
  it("remains internal-only and never returns OAuth tokens", async () => {
    const OAUTH_PROXY = proxy();
    const denied = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/integrations/gitlab"), { CLOUDBOX_INTERNAL_TOKEN: "i", OAUTH_PROXY });
    expect(denied.status).toBe(403);
    const status = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/integrations/gitlab", { headers }), { CLOUDBOX_INTERNAL_TOKEN: "i", OAUTH_PROXY });
    const body = await status.json() as any;
    expect(body.ok).toBe(true);
    expect(JSON.stringify(body)).not.toContain("token");
  });

  it("starts and completes auth through the server-held broker", async () => {
    const OAUTH_PROXY = proxy();
    const env = { CLOUDBOX_INTERNAL_TOKEN: "i", OAUTH_PROXY };
    const start = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/integrations/gitlab/connect", { method: "POST", headers }), env);
    expect(await start.json()).toMatchObject({ authorizationUrl: "https://authorize.example", applicationId: "gitlab-app" });
    expect(OAUTH_PROXY.startAuth).toHaveBeenCalledWith("alice", { appId: "gitlab-app" });
    const complete = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/integrations/gitlab/complete", {
      method: "POST", headers, body: JSON.stringify({ code: "code", state: "state" }),
    }), env);
    expect(await complete.json()).toEqual({ ok: true, connected: true });
    expect(OAUTH_PROXY.completeAuth).toHaveBeenCalledWith("alice", { code: "code", state: "state" });
  });

  it("completes a browser callback using one-time stored owner state", async () => {
    const OAUTH_PROXY = proxy();
    const OAUTH_FLOW_STORE = new MemoryOAuthFlowStore();
    const env = { CLOUDBOX_INTERNAL_TOKEN: "i", OAUTH_PROXY, OAUTH_FLOW_STORE };
    await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/integrations/gitlab/connect", { method: "POST", headers }), env);
    const callback = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/oauth/gitlab/callback?code=c&state=state"), env);
    expect(callback.status).toBe(200);
    expect(OAUTH_PROXY.completeAuth).toHaveBeenCalledWith("alice", { code: "c", state: "state" });
    const replay = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/oauth/gitlab/callback?code=c&state=state"), env);
    expect(replay.status).toBe(400);
  });

  it("disconnects only the configured GitLab application", async () => {
    const OAUTH_PROXY = proxy();
    const response = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/integrations/gitlab", { method: "DELETE", headers }), { CLOUDBOX_INTERNAL_TOKEN: "i", OAUTH_PROXY });
    expect(response.status).toBe(200);
    expect(OAUTH_PROXY.deleteApplication).toHaveBeenCalledWith("alice", "gitlab-app");
  });
});
