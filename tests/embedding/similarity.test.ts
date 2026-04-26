// tests/embedding/similarity.test.ts
import { describe, expect, test } from "bun:test";
import { cosine, meanPairwise } from "../../lib/embedding/similarity";

describe("cosine", () => {
  test("identical vectors return 1", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  test("orthogonal vectors return 0", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  test("dimension mismatch throws", () => {
    expect(() => cosine([1, 0], [1, 0, 0])).toThrow(/dimension/);
  });
});

describe("meanPairwise", () => {
  test("averages all pairs", () => {
    const vs = [
      [1, 0],
      [1, 0],
      [0, 1],
    ];
    expect(meanPairwise(vs)).toBeCloseTo(1 / 3, 6);
  });
  test("single vector throws", () => {
    expect(() => meanPairwise([[1, 0]])).toThrow();
  });
});
