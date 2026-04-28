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

interface StreamResultEvent {
  type: "result";
  result?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  total_cost_usd?: number;
}

export async function runHeadless(args: RunHeadlessArgs): Promise<RunHeadlessResult> {
  const claude = args.claudePath ?? "claude";
  // --output-format stream-json emits one JSON event per line continuously, which keeps
  //   parent-process watchdogs (and the orchestrator itself) seeing live activity over
  //   the long tail of a slash-command invocation. Buffered "json" output looks frozen
  //   for 60-180s and tripped the orchestrator's stream watchdog on the first run.
  // --verbose is required by Claude Code when --output-format=stream-json is set.
  // --dangerously-skip-permissions is REQUIRED for headless runs that invoke slash-commands
  //   touching the filesystem (e.g. /ai-board.specify writing specs/<branch>/spec.md).
  const argv = [
    "--print",
    "--output-format", "stream-json",
    "--verbose",
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
        // Parse the stream: one JSON event per line. Walk backwards to find the final
        // "result" event, which carries the aggregated usage and total_cost_usd.
        const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
        let resultEvent: StreamResultEvent | null = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i]!;
          let event: { type?: string };
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type === "result") {
            resultEvent = event as StreamResultEvent;
            break;
          }
        }
        if (!resultEvent) {
          reject(new Error(`no 'result' event found in stream output\nSTDOUT (last 500 chars):\n${stdout.slice(-500)}`));
          return;
        }
        resolve({
          result: String(resultEvent.result ?? ""),
          usage: {
            input_tokens: Number(resultEvent.usage?.input_tokens ?? 0),
            output_tokens: Number(resultEvent.usage?.output_tokens ?? 0),
            cost_usd: Number(resultEvent.total_cost_usd ?? 0),
          },
          raw: stdout,
        });
      } catch (e) {
        reject(new Error(`failed to parse claude stream output: ${(e as Error).message}\nSTDOUT (last 500 chars):\n${stdout.slice(-500)}`));
      }
    });
  });

  return await Promise.race([completion, timeout]);
}
