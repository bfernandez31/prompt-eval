// lib/profile-loader.ts
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import type { Profile } from "./types";

const REQUIRED_TOP = ["name", "description", "target", "test_input", "eval", "limits", "mode"] as const;
const REQUIRED_TARGET = ["repo", "prompt_file", "invoke"] as const;
const REQUIRED_EVAL = [
  "runs_per_hypothesis",
  "concurrency_per_hypothesis",
  "max_hypotheses_per_round",
  "level1_stability",
  "level2_decisions",
  "level3_quality",
] as const;

export async function loadProfile(path: string): Promise<Profile> {
  const text = await readFile(path, "utf8");
  const raw = parse(text) as Record<string, unknown>;

  for (const key of REQUIRED_TOP) {
    if (!(key in raw)) throw new Error(`profile ${path}: missing required top-level key '${key}'`);
  }

  const target = raw.target as Record<string, unknown>;
  for (const key of REQUIRED_TARGET) {
    if (!(key in target)) throw new Error(`profile ${path}: target missing '${key}'`);
  }

  const ev = raw.eval as Record<string, unknown>;
  for (const key of REQUIRED_EVAL) {
    if (!(key in ev)) throw new Error(`profile ${path}: eval missing '${key}'`);
  }

  // Default initial_hypotheses to []
  if (!("initial_hypotheses" in raw)) raw.initial_hypotheses = [];

  return raw as unknown as Profile;
}
