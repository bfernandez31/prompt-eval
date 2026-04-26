// tests/state.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initState, readState, addBudget, bumpRound } from "../lib/state";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pe-state-"));
});

describe("state", () => {
  test("init writes a fresh eval-run.yml", async () => {
    await initState(dir, {
      run_id: "test-1",
      profile_path: "/tmp/p.yml",
      mode: "semi-auto",
      baseline_path: "rounds/round-0/baseline.md",
    });
    const re = await readState(dir);
    expect(re.run_id).toBe("test-1");
    expect(re.state.budget_consumed_usd).toBe(0);
    expect(re.current_round).toBe(0);
    await rm(dir, { recursive: true });
  });

  test("addBudget accumulates and persists", async () => {
    await initState(dir, {
      run_id: "test-2",
      profile_path: "/tmp/p.yml",
      mode: "semi-auto",
      baseline_path: "x",
    });
    await addBudget(dir, 1.5);
    await addBudget(dir, 0.25);
    const s = await readState(dir);
    expect(s.state.budget_consumed_usd).toBeCloseTo(1.75, 6);
    await rm(dir, { recursive: true });
  });

  test("bumpRound increments both counters", async () => {
    await initState(dir, {
      run_id: "test-3",
      profile_path: "/tmp/p.yml",
      mode: "semi-auto",
      baseline_path: "x",
    });
    await bumpRound(dir);
    await bumpRound(dir);
    const s = await readState(dir);
    expect(s.current_round).toBe(2);
    expect(s.state.rounds_completed).toBe(2);
    await rm(dir, { recursive: true });
  });

  test("readState throws actionable error on missing file", async () => {
    await expect(readState(dir)).rejects.toThrow(/failed to read/);
    await rm(dir, { recursive: true });
  });
});
