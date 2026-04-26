// tests/judge.test.ts
import { describe, expect, test } from "bun:test";
import { buildJudgePrompt, doubleBlindVerdict } from "../lib/judge";
import type { JudgeVerdict } from "../lib/bracket";

describe("buildJudgePrompt", () => {
  test("substitutes A and B and includes rubric", () => {
    const p = buildJudgePrompt({
      rubric: "Compare A and B.",
      specA: "I am A",
      specB: "I am B",
    });
    expect(p).toContain("Compare A and B.");
    expect(p).toContain("I am A");
    expect(p).toContain("I am B");
    expect(p).toMatch(/respond with.*A.*B.*tied/i);
  });
});

describe("doubleBlindVerdict", () => {
  test("agree on the same original participant -> that verdict", async () => {
    // judge always picks the side that is "X"
    const judge = async (a: string, _b: string): Promise<JudgeVerdict> =>
      (a === "X" ? "A" : "B");
    const v = await doubleBlindVerdict("X", "Y", judge);
    expect(v).toBe("A");
  });

  test("disagree (always picks first arg) -> tied", async () => {
    const judge = async (): Promise<JudgeVerdict> => "A";
    const v = await doubleBlindVerdict("X", "Y", judge);
    expect(v).toBe("tied");
  });

  test("both tied -> tied", async () => {
    const judge = async (): Promise<JudgeVerdict> => "tied";
    const v = await doubleBlindVerdict("X", "Y", judge);
    expect(v).toBe("tied");
  });
});
