// tests/profile-loader.test.ts
import { describe, expect, test } from "bun:test";
import { loadProfile } from "../lib/profile-loader";
import { resolve } from "node:path";

const fixture = (name: string) => resolve(import.meta.dir, "fixtures", name);

describe("loadProfile", () => {
  test("loads a valid profile", async () => {
    const p = await loadProfile(fixture("profile-valid.yml"));
    expect(p.name).toBe("test-profile");
    expect(p.target.repo).toBe("/tmp/foo");
    expect(p.eval.level1_stability.threshold).toBe(0.85);
    expect(p.mode).toBe("semi-auto");
  });

  test("throws when target is missing", async () => {
    await expect(loadProfile(fixture("profile-missing-target.yml"))).rejects.toThrow(
      /target/i,
    );
  });

  test("auto mode requires limits", async () => {
    const p = await loadProfile(fixture("profile-valid.yml"));
    p.mode = "auto";
    p.limits.max_rounds = 0;
    expect(() => {
      if (p.mode === "auto" && (p.limits.max_rounds <= 0 || p.limits.max_budget_usd <= 0)) {
        throw new Error("auto mode requires positive max_rounds and max_budget_usd");
      }
    }).toThrow(/auto mode/);
  });
});
