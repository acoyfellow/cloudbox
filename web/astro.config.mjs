import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

// One Astro app, one Cloudflare Worker.
//   - Pages and Markdown render to HTML (zero JS by default).
//   - React islands (e.g. /demo's receipts viewer) hydrate selectively.
//   - API routes under /pages/api/ and /pages/c/ run as Worker handlers
//     and have access to env bindings (CLOUDBOX_COMPUTER, ARTIFACTS, …).
//
// `workerEntryPoint` lets us use a custom Worker file so we can export the
// Durable Object class (ComputerDO) alongside the Astro fetch handler.
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true },
    workerEntryPoint: {
      path: "src/worker.ts",
      namedExports: ["ComputerDO", "CloudboxRunner"],
    },
  }),
  integrations: [react({ jsxImportSource: "react" }), mdx()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  },
});
