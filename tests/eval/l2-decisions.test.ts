// tests/eval/l2-decisions.test.ts
import { describe, expect, test } from "bun:test";
import { evaluateL2 } from "../../lib/eval/l2-decisions";

const a = `## Decisions\n\n- **Decision summary**: X\n- **Decision summary**: Y\n`;
const b = `## Decisions\n\n- **Decision summary**: X\n- **Decision summary**: Y\n`;
const c = `## Decisions\n\n- **Decision summary**: X\n- **Decision summary**: Z\n`;

describe("evaluateL2", () => {
  test("100% Jaccard when all runs identical", async () => {
    const r = await evaluateL2({
      runOutputs: [a, b],
      parser: "structured_list",
      sectionName: "Decisions",
      decisionKey: "Decision summary",
      thresholdPct: 95,
    });
    expect(r.consistency_pct).toBe(100);
    expect(r.gate).toBe("pass");
  });

  test("Jaccard drops when one run differs", async () => {
    const r = await evaluateL2({
      runOutputs: [a, b, c],
      parser: "structured_list",
      sectionName: "Decisions",
      decisionKey: "Decision summary",
      thresholdPct: 95,
    });
    // intersection = {X}; union = {X,Y,Z}; J = 1/3 ≈ 33.3%
    expect(r.consistency_pct).toBeCloseTo(100 / 3, 1);
    expect(r.gate).toBe("fail");
  });

  test("flaky_count counts runs with empty section", async () => {
    const r = await evaluateL2({
      runOutputs: [a, "## Other\n\nnothing"],
      parser: "structured_list",
      sectionName: "Decisions",
      decisionKey: "Decision summary",
      thresholdPct: 95,
    });
    expect(r.flaky_count).toBe(1);
  });
});
