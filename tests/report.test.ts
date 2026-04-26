// tests/report.test.ts
import { describe, expect, test } from "bun:test";
import { renderRoundReport, type RoundData } from "../lib/report";

const data: RoundData = {
  round: 1,
  baseline_id: "baseline",
  hypotheses: [
    { id: "H1", description: "shorten X", status: { kind: "rejected", reason: "unstable" }, l1: 0.72, l2: null },
    { id: "H2", description: "tighten Y", status: { kind: "qualified" }, l1: 0.93, l2: 100 },
  ],
  bracket_winner: "H2",
  bracket_matches: [
    { round: 1, a: "baseline", b: "H2", verdict: "B", winner: "H2" },
  ],
  decision: "adopt",
  total_usd: 1.23,
};

describe("renderRoundReport", () => {
  test("includes hypothesis statuses, bracket winner, decision, cost", () => {
    const md = renderRoundReport(data);
    expect(md).toContain("Round 1");
    expect(md).toContain("H1");
    expect(md).toContain("rejected:unstable");
    expect(md).toContain("H2");
    expect(md).toContain("qualified");
    expect(md).toContain("ADOPT: H2");
    expect(md).toContain("$1.23");
  });

  test("renders rollback variant", () => {
    const rollback: RoundData = { ...data, decision: "rollback", bracket_winner: "baseline" };
    const md = renderRoundReport(rollback);
    expect(md).toContain("ROLLBACK");
    expect(md).not.toContain("ADOPT:");
  });
});
