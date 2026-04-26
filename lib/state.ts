// lib/state.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { stringify, parse } from "yaml";
import type { Mode, RunState } from "./types";

const FILE = "eval-run.yml";

export interface InitArgs {
  run_id: string;
  profile_path: string;
  mode: Mode;
  baseline_path: string;
}

export async function initState(stateDir: string, args: InitArgs): Promise<RunState> {
  await mkdir(stateDir, { recursive: true });
  const s: RunState = {
    run_id: args.run_id,
    profile_path: args.profile_path,
    mode: args.mode,
    current_round: 0,
    state: {
      rounds_completed: 0,
      budget_consumed_usd: 0,
      baseline_path: args.baseline_path,
    },
  };
  await writeState(stateDir, s);
  return s;
}

export async function readState(stateDir: string): Promise<RunState> {
  const text = await readFile(join(stateDir, FILE), "utf8");
  return parse(text) as RunState;
}

export async function writeState(stateDir: string, s: RunState): Promise<void> {
  await writeFile(join(stateDir, FILE), stringify(s));
}

export async function addBudget(stateDir: string, usd: number): Promise<void> {
  const s = await readState(stateDir);
  s.state.budget_consumed_usd += usd;
  await writeState(stateDir, s);
}
