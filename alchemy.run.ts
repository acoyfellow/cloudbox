import alchemy from "alchemy";
import {
  D1Database,
  R2Bucket,
  KVNamespace,
  Worker,
  Assets,
  DurableObjectNamespace,
  Container,
} from "alchemy/cloudflare";
import { CloudflareStateStore, FileSystemStateStore } from "alchemy/state";

const projectName = "cloudbox";

const app = await alchemy(projectName, {
  password: process.env.ALCHEMY_PASSWORD || "cloudbox-local-password",
  stateStore: (scope) => scope.local
    ? new FileSystemStateStore(scope)
    : new CloudflareStateStore(scope, {
        scriptName: "cloudbox-state",
        apiToken: alchemy.secret(process.env.CLOUDFLARE_PERSONAL_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || ""),
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        stateToken: alchemy.secret(process.env.ALCHEMY_STATE_TOKEN || ""),
        forceUpdate: true,
      }),
});

const isProd = app.stage === "prod";
const workerName = isProd ? (process.env.CLOUDBOX_WORKER_NAME || "cloudbox-v2") : `${app.stage}-cloudbox`;
const dbName = isProd ? "cloudbox-prod" : `${app.stage}-cloudbox`;
const bucketName = isProd ? "cloudbox-artifacts" : `${app.stage}-cloudbox-artifacts`;

const DB = await D1Database("cloudbox-db", {
  name: dbName,
  migrationsDir: "migrations",
  adopt: true,
});

const ARTIFACTS = await R2Bucket("cloudbox-artifacts", {
  name: bucketName,
  adopt: true,
});

const OAUTH_TOKEN_CACHE = await KVNamespace("cloudbox-oauth-token-cache", {
  title: isProd ? "cloudbox-oauth-token-cache" : `${app.stage}-cloudbox-oauth-token-cache`,
  adopt: true,
});

const OAUTH_FLOW_KV = await KVNamespace("cloudbox-oauth-flow-state", {
  title: isProd ? "cloudbox-oauth-flow-state" : `${app.stage}-cloudbox-oauth-flow-state`,
  adopt: true,
});

const OAUTH_CLIENT = DurableObjectNamespace("OAUTH_CLIENT", {
  className: "OAuthClient",
  sqlite: true,
});

const OAUTH_PROXY_WORKER = await Worker("cloudbox-oauth-proxy", {
  name: isProd ? "cloudbox-oauth-proxy" : `${app.stage}-cloudbox-oauth-proxy`,
  entrypoint: "./oauth-proxy/src/index.ts",
  adopt: true,
  compatibilityDate: "2026-04-30",
  compatibilityFlags: ["nodejs_compat"],
  observability: { enabled: true },
  url: false,
  bindings: {
    TOKEN_CACHE: OAUTH_TOKEN_CACHE,
    OAUTH_CLIENT,
    REDIRECT_BASE_URL: process.env.CLOUDBOX_BASE_URL || "https://cloudbox.coey.dev",
    GITLAB_CFDATA_CLIENT_ID: process.env.GITLAB_CFDATA_CLIENT_ID || "",
    ...(process.env.OAUTH_PROXY_MASTER_KEY ? { MASTER_KEY: alchemy.secret(process.env.OAUTH_PROXY_MASTER_KEY) } : {}),
    ...(process.env.GITLAB_CFDATA_CLIENT_SECRET ? { GITLAB_CFDATA_CLIENT_SECRET: alchemy.secret(process.env.GITLAB_CFDATA_CLIENT_SECRET) } : {}),
    ...(process.env.GITLAB_CFDATA_CF_ACCESS_CLIENT_ID ? { GITLAB_CFDATA_CF_ACCESS_CLIENT_ID: alchemy.secret(process.env.GITLAB_CFDATA_CF_ACCESS_CLIENT_ID) } : {}),
    ...(process.env.GITLAB_CFDATA_CF_ACCESS_CLIENT_SECRET ? { GITLAB_CFDATA_CF_ACCESS_CLIENT_SECRET: alchemy.secret(process.env.GITLAB_CFDATA_CF_ACCESS_CLIENT_SECRET) } : {}),
  },
});

const CLOUDBOX_COMPUTER = DurableObjectNamespace("CLOUDBOX_COMPUTER", {
  className: "ComputerDO",
  sqlite: true,
});

// Sandbox-backed durable Computer runtime. Kept separate from the existing
// proof-run runners while the owner identity and private Git egress contract
// are proven.
const CLOUDBOX_SANDBOX = await Container("cloudbox-computer", {
  name: isProd ? "cloudbox-computer" : `${app.stage}-cloudbox-computer`,
  className: "CloudboxSandbox",
  build: {
    context: ".",
    dockerfile: "computer/Dockerfile",
  },
  instanceType: process.env.CLOUDBOX_COMPUTER_INSTANCE_TYPE || (isProd ? "standard" : "lite"),
  maxInstances: Number(process.env.CLOUDBOX_COMPUTER_MAX_INSTANCES || 5),
  adopt: true,
  dev: { remote: true },
});

const runnerResourceId = process.env.CLOUDBOX_RUNNER_RESOURCE_ID || "cloudbox-runner";
const runnerName = process.env.CLOUDBOX_RUNNER_NAME || (isProd ? "cloudbox-runner-v2" : `${app.stage}-cloudbox-runner`);
const runnerInstanceType = process.env.CLOUDBOX_RUNNER_INSTANCE_TYPE || (isProd ? "standard" : "lite");

const CLOUDBOX_RUNNER = await Container(runnerResourceId, {
  name: runnerName,
  className: "CloudboxRunner",
  build: {
    context: "./runner",
    dockerfile: "Dockerfile",
  },
  instanceType: runnerInstanceType,
  maxInstances: Number(process.env.CLOUDBOX_RUNNER_MAX_INSTANCES || 2),
  adopt: true,
  dev: { remote: true },
});

const desktopRunnerResourceId = process.env.CLOUDBOX_DESKTOP_RUNNER_RESOURCE_ID || "cloudbox-desktop-runner";
const desktopRunnerName = process.env.CLOUDBOX_DESKTOP_RUNNER_NAME || (isProd ? "cloudbox-desktop-runner" : `${app.stage}-cloudbox-desktop-runner`);
const CLOUDBOX_DESKTOP_RUNNER = await Container(desktopRunnerResourceId, {
  name: desktopRunnerName,
  className: "CloudboxDesktopRunner",
  build: {
    context: "./runner",
    dockerfile: "../runner-desktop/Dockerfile",
  },
  instanceType: process.env.CLOUDBOX_DESKTOP_RUNNER_INSTANCE_TYPE || (isProd ? "standard-2" : "standard-1"),
  maxInstances: Number(process.env.CLOUDBOX_DESKTOP_RUNNER_MAX_INSTANCES || 1),
  adopt: true,
  dev: { remote: true },
});

export const WORKER = await Worker("cloudbox-worker", {
  name: workerName,
  entrypoint: "./web/dist/_worker.js/index.js",
  adopt: true,
  compatibilityDate: "2026-04-30",
  compatibilityFlags: ["nodejs_compat"],
  observability: { enabled: true },
  url: true,
  domains: isProd ? [{ domainName: "cloudbox.coey.dev", overrideExistingOrigin: true, adopt: true }] : [],
  dev: { remote: true },
  bindings: {
    ASSETS: await Assets({ path: "./web/dist" }),
    DB,
    ARTIFACTS,
    CLOUDBOX_COMPUTER,
    CLOUDBOX_SANDBOX,
    CLOUDBOX_RUNNER,
    CLOUDBOX_DESKTOP_RUNNER,
    CLOUDBOX_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    OAUTH_PROXY: OAUTH_PROXY_WORKER,
    OAUTH_FLOW_KV,
    ...(process.env.GITLAB_OAUTH_APP_ID
      ? { GITLAB_OAUTH_APP_ID: process.env.GITLAB_OAUTH_APP_ID }
      : {}),
    ...(process.env.CLOUDBOX_API_TOKEN
      ? { CLOUDBOX_API_TOKEN: alchemy.secret(process.env.CLOUDBOX_API_TOKEN) }
      : {}),
    ...(process.env.CLOUDBOX_INTERNAL_TOKEN
      ? { CLOUDBOX_INTERNAL_TOKEN: alchemy.secret(process.env.CLOUDBOX_INTERNAL_TOKEN) }
      : {}),
    ...(process.env.CLOUDBOX_PUBLISH_APPROVAL_TOKEN
      ? { CLOUDBOX_PUBLISH_APPROVAL_TOKEN: alchemy.secret(process.env.CLOUDBOX_PUBLISH_APPROVAL_TOKEN) }
      : {}),
    ...(process.env.CLOUDBOX_GITLAB_TOKEN
      ? { CLOUDBOX_GITLAB_TOKEN: alchemy.secret(process.env.CLOUDBOX_GITLAB_TOKEN) }
      : {}),
  },
});

await app.finalize();
