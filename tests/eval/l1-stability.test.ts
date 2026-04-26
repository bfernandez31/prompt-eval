// tests/eval/l1-stability.test.ts
import { describe, expect, test } from "bun:test";
import { evaluateL1 } from "../../lib/eval/l1-stability";

describe("evaluateL1", () => {
  test("returns mean pairwise sim and gate=pass when above threshold", async () => {
    // identical inputs → cosine 1
    const fakeEmbed = async (texts: string[]) => ({
      embeddings: texts.map(() => [1, 0, 0]),
    });
    const r = await evaluateL1({
      runOutputs: ["a", "b", "c"],
      embed: fakeEmbed,
      maxTokens: 10000,
      threshold: 0.85,
    });
    expect(r.mean_similarity).toBeCloseTo(1, 6);
    expect(r.gate).toBe("pass");
    expect(r.pair_similarities).toHaveLength(3);
  });

  test("gate=fail when below threshold", async () => {
    let i = 0;
    const fakeEmbed = async (texts: string[]) => ({
      embeddings: texts.map(() => {
        const v = i++ % 2 === 0 ? [1, 0] : [0, 1];
        return v;
      }),
    });
    const r = await evaluateL1({
      runOutputs: ["a", "b"],
      embed: fakeEmbed,
      maxTokens: 10000,
      threshold: 0.85,
    });
    expect(r.gate).toBe("fail");
  });

  test("throws on a single run", async () => {
    const fakeEmbed = async (texts: string[]) => ({
      embeddings: texts.map(() => [1, 0]),
    });
    await expect(
      evaluateL1({ runOutputs: ["a"], embed: fakeEmbed, maxTokens: 100, threshold: 0.5 }),
    ).rejects.toThrow(/at least 2/);
  });
});
