// lib/eval/l2-decisions.ts
import { parseStructuredList } from "./parsers/structured-list";
import { parseStructuredTable } from "./parsers/structured-table";
import { parseRegex } from "./parsers/regex";
import type { L2Result } from "../types";

export interface EvaluateL2Args {
  runOutputs: string[];
  parser: "structured_list" | "structured_table" | "regex";
  sectionName: string;
  decisionKey: string;
  thresholdPct: number;
}

export async function evaluateL2(args: EvaluateL2Args): Promise<L2Result> {
  const parse = (md: string): string[] => {
    switch (args.parser) {
      case "structured_list":
        return parseStructuredList(md, args.sectionName, args.decisionKey);
      case "structured_table":
        return parseStructuredTable();
      case "regex":
        return parseRegex();
    }
  };

  const per_run_decisions = args.runOutputs.map(parse);
  const flaky_count = per_run_decisions.filter((d) => d.length === 0).length;

  const sets = per_run_decisions.map((arr) => new Set(arr));
  const union = new Set<string>();
  for (const s of sets) for (const v of s) union.add(v);
  const intersection = new Set<string>(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    for (const v of [...intersection]) if (!sets[i]!.has(v)) intersection.delete(v);
  }
  const consistency_pct = union.size === 0 ? 0 : (intersection.size / union.size) * 100;

  const gate: L2Result["gate"] = consistency_pct >= args.thresholdPct ? "pass" : "fail";

  return { per_run_decisions, flaky_count, consistency_pct, gate };
}
