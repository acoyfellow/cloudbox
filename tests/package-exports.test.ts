import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };

describe("documented package exports", () => {
  it("exports the helper paths used in docs", () => {
    expect(pkg.exports).toMatchObject({
      "./client": "./src/client.ts",
      "./generate-proof": "./src/generate-proof.ts",
      "./agent-computer": "./src/agent-computer.ts",
    });
  });
});
