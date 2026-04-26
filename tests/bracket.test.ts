// tests/bracket.test.ts
import { describe, expect, test } from "bun:test";
import { runBracket } from "../lib/bracket";
import type { JudgeVerdict } from "../lib/bracket";

describe("runBracket", () => {
  test("baseline wins when judge always picks baseline", async () => {
    const judge = async (a: string, b: string): Promise<JudgeVerdict> => {
      return a === "baseline" ? "A" : b === "baseline" ? "B" : "tied";
    };
    const r = await runBracket({
      participants: ["baseline", "H1", "H2"],
      judge,
    });
    expect(r.winner).toBe("baseline");
    expect(r.matches.length).toBeGreaterThan(0);
  });

  test("hypothesis wins when judge always picks it", async () => {
    const judge = async (a: string, b: string): Promise<JudgeVerdict> => {
      return a === "H1" ? "A" : b === "H1" ? "B" : "tied";
    };
    const r = await runBracket({
      participants: ["baseline", "H1", "H2"],
      judge,
    });
    expect(r.winner).toBe("H1");
  });

  test("tied resolves in favour of baseline", async () => {
    const judge = async (): Promise<JudgeVerdict> => "tied";
    const r = await runBracket({
      participants: ["baseline", "H1"],
      judge,
    });
    expect(r.winner).toBe("baseline");
  });

  test("single participant returns that participant", async () => {
    const judge = async (): Promise<JudgeVerdict> => "tied";
    const r = await runBracket({ participants: ["solo"], judge });
    expect(r.winner).toBe("solo");
    expect(r.matches).toEqual([]);
  });
});
