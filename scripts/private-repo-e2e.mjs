#!/usr/bin/env node
const base = (process.env.CLOUDBOX_E2E_URL ?? "https://cloudbox.coey.dev").replace(/\/+$/, "");
const owner = process.env.CLOUDBOX_E2E_OWNER;
const internalToken = process.env.CLOUDBOX_INTERNAL_TOKEN;
const remote = process.env.CLOUDBOX_E2E_GITLAB_REPO;
const path = process.env.CLOUDBOX_E2E_REPO_PATH ?? "/home/user/src/e2e-project";
const branch = process.env.CLOUDBOX_E2E_BRANCH ?? `cloudbox/e2e-${Date.now()}`;
const title = process.env.CLOUDBOX_E2E_MR_TITLE ?? `Cloudbox E2E ${new Date().toISOString()}`;

if (!owner || !internalToken || !remote) {
  throw new Error("CLOUDBOX_E2E_OWNER, CLOUDBOX_INTERNAL_TOKEN, and CLOUDBOX_E2E_GITLAB_REPO are required");
}
const headers = { "content-type": "application/json", "x-cloudbox-internal-token": internalToken, "x-cloudbox-owner": owner };
async function call(suffix, method = "GET", body) {
  const response = await fetch(`${base}/api/personal-computers/${encodeURIComponent(owner)}${suffix}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json().catch(async () => ({ text: await response.text() }));
  if (!response.ok) throw new Error(`${method} ${suffix} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

const connection = await call("/integrations/gitlab").catch(async (error) => {
  const connect = await call("/integrations/gitlab/connect", "POST", {});
  console.error("Complete GitLab authorization in your browser, then re-run this script:");
  console.error(connect.authorizationUrl);
  throw error;
});
if (!JSON.stringify(connection.connections ?? []).includes("connected")) {
  const connect = await call("/integrations/gitlab/connect", "POST", {});
  console.error("Complete GitLab authorization in your browser, then re-run this script:");
  console.error(connect.authorizationUrl);
  process.exit(2);
}

await call("/repo-grants", "POST", { remote, kind: "git_repo_read" });
const mounted = await call("/repos/mount", "POST", { remote, path, branch: "main" });
const marker = `cloudbox-e2e-${Date.now()}`;
await call("/exec", "POST", { cwd: path, command: `git switch -c ${JSON.stringify(branch)} && printf '\\n<!-- ${marker} -->\\n' >> README.md && git add README.md && git -c user.name=Cloudbox -c user.email=cloudbox@example.invalid commit -m ${JSON.stringify(`test: ${marker}`)} && git status --short --branch && git diff HEAD~1 -- README.md` });
await call("/repo-grants", "POST", { remote, kind: "git_repo_write" });
const published = await call("/repos/publish", "POST", { remote, path, branch });
const mr = await call("/repos/merge-requests", "POST", { remote, sourceBranch: branch, targetBranch: "main", title, description: `Automated Cloudbox private repository E2E marker: ${marker}` });
console.log(JSON.stringify({ mounted, published, mr, marker, branch }, null, 2));
