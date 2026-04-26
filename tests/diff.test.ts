// tests/diff.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyDiff } from "../lib/diff";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pe-diff-"));
});

describe("applyDiff", () => {
  test("applies a one-line replacement", async () => {
    const file = join(dir, "f.md");
    await writeFile(file, "alpha\nbeta\ngamma\n");
    const diff = `--- a/f.md
+++ b/f.md
@@ -1,3 +1,3 @@
 alpha
-beta
+BETA
 gamma
`;
    await applyDiff(dir, diff);
    expect(await readFile(file, "utf8")).toBe("alpha\nBETA\ngamma\n");
    await rm(dir, { recursive: true });
  });

  test("throws on a malformed patch", async () => {
    const file = join(dir, "f.md");
    await writeFile(file, "alpha\n");
    const diff = `--- a/f.md
+++ b/f.md
@@ -1,1 +1,1 @@
-DOES_NOT_MATCH
+something
`;
    await expect(applyDiff(dir, diff)).rejects.toThrow();
    await rm(dir, { recursive: true });
  });
});
