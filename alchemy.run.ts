import alchemy from "alchemy";
import {
  D1Database,
  R2Bucket,
  Worker,
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

const DB = {
  type: "d1" as const,
  name: dbName,
  id: process.env.CLOUDBOX_D1_DATABASE_ID ?? "00000000-0000-0000-0000-000000000000",
};

const ARTIFACTS = await R2Bucket("cloudbox-artifacts", {
  name: bucketName,
  adopt: true,
});

export const WORKER = await Worker("cloudbox-worker", {
  name: workerName,
  entrypoint: "./web/src/worker.ts",
  assets: "./web/dist",
  adopt: true,
  compatibilityDate: "2026-04-30",
  compatibilityFlags: ["nodejs_compat"],
  observability: { enabled: true },
  url: true,
  domains: isProd ? ["cloudbox.coey.dev"] : [],
  bindings: {
    DB,
    ARTIFACTS,
  },
  env: {
    CLOUDBOX_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    ...(process.env.CLOUDBOX_API_TOKEN
      ? { CLOUDBOX_API_TOKEN: alchemy.secret(process.env.CLOUDBOX_API_TOKEN) }
      : {}),
  },
});

await app.finalize();
