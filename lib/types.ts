// lib/types.ts

export type Mode = "semi-auto" | "auto";

export interface ProfileTarget {
  repo: string;
  prompt_file: string;
  invoke: string;
}

export interface ProfileTestInput {
  payload: string;
}

export interface ProfileLevel1 {
  output_artifact: string;
  embedding_model: string;
  threshold: number;
}

export type ProfileLevel2 =
  | { skip: true }
  | {
      skip?: false;
      section_name: string;
      parser: "structured_list" | "structured_table" | "regex";
      decision_key: string;
      threshold_pct: number;
    };

export interface ProfileLevel3 {
  judge_model: string;
  double_blind: boolean;
  rubric: string;
}

export interface ProfileEval {
  runs_per_hypothesis: number;
  concurrency_per_hypothesis: number;
  max_hypotheses_per_round: number;
  level1_stability: ProfileLevel1;
  level2_decisions: ProfileLevel2;
  level3_quality: ProfileLevel3;
}

export interface ProfileLimits {
  max_rounds: number;
  max_budget_usd: number;
}

export interface Hypothesis {
  id: string;
  description: string;
  diff: string;
}

export interface Profile {
  name: string;
  description: string;
  target: ProfileTarget;
  test_input: ProfileTestInput;
  eval: ProfileEval;
  limits: ProfileLimits;
  mode: Mode;
  initial_hypotheses: Hypothesis[];
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export type RunStatus =
  | { kind: "ok"; file_path: string; usage: Usage; branch_created?: string }
  | { kind: "timeout" }
  | { kind: "no_output" }
  | { kind: "exec_failed"; stderr: string };

export type HypothesisStatus =
  | { kind: "qualified" }
  | { kind: "rejected"; reason: "patch_failed" | "unstable" | "inconsistent" | "unreliable" };

export interface RunStatePayload {
  rounds_completed: number;
  budget_consumed_usd: number;
  baseline_path: string;
}

export interface RunState {
  run_id: string;
  profile_path: string;
  mode: Mode;
  current_round: number;
  state: RunStatePayload;
}

export interface L1Result {
  pair_similarities: Array<{ i: number; j: number; sim: number }>;
  mean_similarity: number;
  gate: "pass" | "fail";
}

export interface L2Result {
  per_run_decisions: string[][];
  flaky_count: number;
  consistency_pct: number;
  gate: "pass" | "fail" | "skipped";
}
