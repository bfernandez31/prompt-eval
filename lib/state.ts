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
  const filePath = join(stateDir, FILE);
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (e) {
    throw new Error(`state: failed to read ${filePath}: ${(e as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (e) {
    throw new Error(`state: failed to parse ${filePath} as YAML: ${(e as Error).message}`);
  }
  if (typeof (parsed as RunState)?.state?.budget_consumed_usd !== "number") {
    throw new Error(`state: ${filePath} has invalid or missing state.budget_consumed_usd`);
  }
  return parsed as RunState;
}

export async function writeState(stateDir: string, s: RunState): Promise<void> {
  await writeFile(join(stateDir, FILE), stringify(s));
}

// addBudget is not concurrency-safe (read-modify-write). Single-controller use only.
export async function addBudget(stateDir: string, usd: number): Promise<void> {
  const s = await readState(stateDir);
  s.state.budget_consumed_usd += usd;
  await writeState(stateDir, s);
}

// bumpRound increments current_round and rounds_completed atomically (single-controller).
export async function bumpRound(stateDir: string): Promise<void> {
  const s = await readState(stateDir);
  s.current_round += 1;
  s.state.rounds_completed += 1;
  await writeState(stateDir, s);
}
