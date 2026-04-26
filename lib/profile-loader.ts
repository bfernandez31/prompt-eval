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

function isMapping(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function loadProfile(profilePath: string): Promise<Profile> {
  const text = await readFile(profilePath, "utf8");
  const raw = parse(text) as Record<string, unknown>;

  for (const key of REQUIRED_TOP) {
    if (!(key in raw)) throw new Error(`profile ${profilePath}: missing required top-level key '${key}'`);
  }

  if (!isMapping(raw.target)) {
    throw new Error(`profile ${profilePath}: 'target' must be a mapping`);
  }
  for (const key of REQUIRED_TARGET) {
    if (!(key in raw.target)) throw new Error(`profile ${profilePath}: target missing '${key}'`);
  }

  if (!isMapping(raw.eval)) {
    throw new Error(`profile ${profilePath}: 'eval' must be a mapping`);
  }
  for (const key of REQUIRED_EVAL) {
    if (!(key in raw.eval)) throw new Error(`profile ${profilePath}: eval missing '${key}'`);
  }

  if (!("initial_hypotheses" in raw)) raw.initial_hypotheses = [];

  // Validation above checks key existence + that target/eval are mappings.
  // Nested value types (limits, test_input, level1/2/3 internals) are assumed correct;
  // they will surface as runtime errors downstream if malformed.
  return raw as unknown as Profile;
}
