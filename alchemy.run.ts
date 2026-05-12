import alchemy from "alchemy";
import {
  D1Database,
  R2Bucket,
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
const workerName = isProd ? "cloudbox" : `${app.stage}-cloudbox`;
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

const CLOUDBOX_COMPUTER = DurableObjectNamespace("CLOUDBOX_COMPUTER", {
  className: "ComputerDO",
  sqlite: true,
});

const runnerName = process.env.CLOUDBOX_RUNNER_NAME || (isProd ? "cloudbox-runner" : `${app.stage}-cloudbox-runner`);

const CLOUDBOX_RUNNER = await Container("cloudbox-runner", {
  name: runnerName,
  className: "CloudboxRunner",
  build: {
    context: "./runner",
    dockerfile: "Dockerfile",
  },
  instanceType: process.env.CLOUDBOX_RUNNER_INSTANCE_TYPE || "lite",
  maxInstances: Number(process.env.CLOUDBOX_RUNNER_MAX_INSTANCES || 2),
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
  domains: isProd ? ["cloudbox.coey.dev"] : [],
  dev: { remote: true },
  bindings: {
    ASSETS: await Assets({ path: "./web/dist" }),
    DB,
    ARTIFACTS,
    CLOUDBOX_COMPUTER,
    CLOUDBOX_RUNNER,
    CLOUDBOX_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    ...(process.env.CLOUDBOX_API_TOKEN
      ? { CLOUDBOX_API_TOKEN: alchemy.secret(process.env.CLOUDBOX_API_TOKEN) }
      : {}),
    ...(process.env.CLOUDBOX_GITLAB_TOKEN
      ? { CLOUDBOX_GITLAB_TOKEN: alchemy.secret(process.env.CLOUDBOX_GITLAB_TOKEN) }
      : {}),
  },
});

await app.finalize();
