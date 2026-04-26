// lib/clone-manager.ts
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

export async function cloneShared(source: string, dest: string): Promise<void> {
  await runGit(["clone", "--shared", "--quiet", source, dest]);
}

export async function removeClone(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export async function listLocalBranches(repoPath: string): Promise<string[]> {
  const stdout = await runGitStdout(["-C", repoPath, "branch", "--format=%(refname:short)"]);
  return stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

export async function commitAll(repoPath: string, message: string): Promise<void> {
  await runGit(["-C", repoPath, "add", "-A"]);
  await runGit([
    "-C", repoPath,
    "-c", "user.email=eval@local",
    "-c", "user.name=prompt-eval",
    "commit", "-q", "-m", message,
  ]);
}

function runGit(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args);
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git ${args.join(" ")} exited ${code}: ${stderr}`));
    });
  });
}

function runGitStdout(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`git ${args.join(" ")} exited ${code}: ${stderr}`));
    });
  });
}
