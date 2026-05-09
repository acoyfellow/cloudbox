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
    const worker = yield* Cloudflare.Worker("Cloudbox", {
      name: "cloudbox",
      main: "./web/src/worker.ts",
      assets: "./web/dist/client",
      compatibility: {
        date: "2026-04-30",
        flags: ["nodejs_compat"],
      },
      observability: { enabled: true },
      domain: "cloudbox.coey.dev",
      bindings: {
        DB: db,
        ARTIFACTS: artifacts,
      },
      env: {
        CLOUDBOX_MODEL: "@cf/meta/llama-3.1-8b-instruct",
      },
    });

    return {
      url: worker.url,
      db: db.databaseName,
      artifacts: artifacts.bucketName,
      domain: "cloudbox.coey.dev",
    };
  }),
);

export default Stack;
export type CloudboxEnv = Cloudflare.InferEnv<typeof Stack>;
