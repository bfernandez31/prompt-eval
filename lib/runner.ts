// lib/runner.ts
import { spawn } from "node:child_process";
import type { Usage } from "./types";

export interface RunHeadlessArgs {
  claudePath?: string;
  cwd: string;
  invoke: string;
  payload: string;
  timeoutMs: number;
}

export interface RunHeadlessResult {
  result: string;
  usage: Usage;
  raw: string;
}

export async function runHeadless(args: RunHeadlessArgs): Promise<RunHeadlessResult> {
  const claude = args.claudePath ?? "claude";
  // --dangerously-skip-permissions is REQUIRED for headless runs that invoke slash-commands
  // touching the filesystem (e.g. /ai-board.specify writing specs/<branch>/spec.md). Without it,
  // child sessions sandbox Bash/Write and the run produces no artifact.
  const argv = [
    "--print",
    "--output-format", "json",
    "--dangerously-skip-permissions",
    `${args.invoke} ${args.payload}`,
  ];

  const child = spawn(claude, argv, { cwd: args.cwd });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("timeout"));
    }, args.timeoutMs);
  });

  const completion = new Promise<RunHeadlessResult>((resolve, reject) => {
    child.on("exit", (code) => {
      if (timer) clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve({
          result: String(parsed.result ?? ""),
          usage: {
            input_tokens: Number(parsed.usage?.input_tokens ?? 0),
            output_tokens: Number(parsed.usage?.output_tokens ?? 0),
            cost_usd: Number(parsed.usage?.cost_usd ?? 0),
          },
          raw: stdout,
        });
      } catch (e) {
        reject(new Error(`failed to parse claude JSON output: ${(e as Error).message}\nSTDOUT:\n${stdout}`));
      }
    });
  });

  return await Promise.race([completion, timeout]);
}
