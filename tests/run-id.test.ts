// tests/run-id.test.ts
import { describe, expect, test } from "bun:test";
import { generateRunId } from "../lib/run-id";

describe("generateRunId", () => {
  test("returns a string with format YYYYMMDD-HHMMSS-<name>", () => {
    const id = generateRunId("ai-board.specify", new Date("2026-04-26T20:15:00Z"));
    expect(id).toMatch(/^\d{8}-\d{6}-ai-board\.specify$/);
    expect(id).toBe("20260426-201500-ai-board.specify");
  });

  test("uses Date.now() when no date provided", () => {
    const id = generateRunId("foo");
    expect(id).toMatch(/^\d{8}-\d{6}-foo$/);
  });
});
