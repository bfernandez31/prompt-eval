// tests/clone-manager.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cloneShared, removeClone, listLocalBranches, commitAll } from "../lib/clone-manager";

async function makeSourceRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pe-src-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "hello\n");
  spawnSync("git", ["-C", dir, "add", "."]);
  spawnSync("git", [
    "-C", dir,
    "-c", "user.email=t@t",
    "-c", "user.name=t",
    "commit", "-q", "-m", "init",
  ]);
  return dir;
}

describe("clone-manager", () => {
  test("cloneShared creates a working clone with the source files", async () => {
    const src = await makeSourceRepo();
    const destParent = await mkdtemp(join(tmpdir(), "pe-dest-"));
    const dest = join(destParent, "clone");
    await cloneShared(src, dest);
    const s = await stat(join(dest, "README.md"));
    expect(s.isFile()).toBe(true);
    await removeClone(dest);
    await rm(src, { recursive: true });
    await rm(destParent, { recursive: true });
  });

  test("listLocalBranches returns at least the default branch", async () => {
    const src = await makeSourceRepo();
    const destParent = await mkdtemp(join(tmpdir(), "pe-dest-"));
    const dest = join(destParent, "clone");
    await cloneShared(src, dest);
    const branches = await listLocalBranches(dest);
    expect(branches).toContain("main");
    await removeClone(dest);
    await rm(src, { recursive: true });
    await rm(destParent, { recursive: true });
  });

  test("commitAll stages and commits new files", async () => {
    const src = await makeSourceRepo();
    const destParent = await mkdtemp(join(tmpdir(), "pe-dest-"));
    const dest = join(destParent, "clone");
    await cloneShared(src, dest);
    await writeFile(join(dest, "new.txt"), "hello\n");
    await commitAll(dest, "add new file");
    const log = spawnSync("git", ["-C", dest, "log", "--oneline"]).stdout.toString();
    expect(log).toContain("add new file");
    await removeClone(dest);
    await rm(src, { recursive: true });
    await rm(destParent, { recursive: true });
  });
});
