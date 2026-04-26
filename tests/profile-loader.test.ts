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

  test("throws when target is not a mapping", async () => {
    await expect(loadProfile(fixture("profile-target-not-mapping.yml"))).rejects.toThrow(
      /target.*mapping/i,
    );
  });
});
