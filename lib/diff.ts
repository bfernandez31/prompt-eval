// lib/diff.ts
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function applyDiff(cwd: string, unifiedDiff: string): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), "pe-patch-"));
  const patchFile = join(tmp, "h.diff");
  await writeFile(patchFile, unifiedDiff);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("patch", ["-p1", "-i", patchFile, "--no-backup-if-mismatch"], { cwd });
      let stderr = "";
      child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`patch exited ${code}: ${stderr}`));
      });
    });
  } finally {
    await rm(tmp, { recursive: true });
  }
}
