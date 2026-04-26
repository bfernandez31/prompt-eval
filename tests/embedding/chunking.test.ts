// tests/embedding/chunking.test.ts
import { describe, expect, test } from "bun:test";
import { chunkBySection, approximateTokens } from "../../lib/embedding/chunking";

describe("approximateTokens", () => {
  test("uses ~4 chars per token heuristic", () => {
    expect(approximateTokens("a".repeat(400))).toBe(100);
    expect(approximateTokens("")).toBe(0);
  });
});

describe("chunkBySection", () => {
  test("returns single chunk when under budget", () => {
    const md = "# Title\n\nbody";
    const chunks = chunkBySection(md, 1000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain("body");
    expect(chunks[0]!.weight).toBeGreaterThan(0);
  });

  test("splits at top-level h2 boundaries when over budget", () => {
    const big = "x".repeat(4000);
    const md = `# Title\n\n## A\n\n${big}\n\n## B\n\n${big}\n`;
    const chunks = chunkBySection(md, 800);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});
