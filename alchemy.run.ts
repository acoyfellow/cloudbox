import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

const Stack = Alchemy.Stack(
  "cloudbox",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1Database("CloudboxDB", {
      name: "cloudbox",
      migrationsDir: "migrations",
    });
    const artifacts = yield* Cloudflare.R2Bucket("CloudboxArtifacts", {
      name: "cloudbox-artifacts",
    });
    const runs = yield* Cloudflare.Queue("CloudboxRuns", {
      name: "cloudbox-runs",
    });
    const worker = yield* Cloudflare.Worker("Cloudbox", {
      name: "cloudbox",
      main: "./apps/web/src/worker.ts",
      assets: "./apps/web/dist/client",
      compatibility: {
        date: "2026-04-30",
        flags: ["nodejs_compat"],
      },
      observability: { enabled: true },
      bindings: {
        DB: db,
        ARTIFACTS: artifacts,
        RUNS: runs,
      },
      env: {
        CLOUDBOX_MODEL: "@cf/meta/llama-3.1-8b-instruct",
      },
    });

    return {
      url: worker.url,
      db: db.databaseName,
      artifacts: artifacts.bucketName,
      queue: runs.queueName,
    };
  }),
);

export default Stack;
export type CloudboxEnv = Cloudflare.InferEnv<typeof Stack>;
