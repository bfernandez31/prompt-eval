// lib/judge.ts
import type { JudgeVerdict } from "./bracket";

export interface BuildPromptArgs {
  rubric: string;
  specA: string;
  specB: string;
}

export function buildJudgePrompt(args: BuildPromptArgs): string {
  return `You are an impartial evaluator.

${args.rubric}

# Spec A

${args.specA}

# Spec B

${args.specB}

Respond with EXACTLY one of: "A", "B", or "tied", followed by a one-line rationale.
Format: "<verdict>: <rationale>"
`;
}

/**
 * Run two independent judgments with A/B order swapped.
 * pass1: judge(specA, specB) -> verdict_orig
 * pass2: judge(specB, specA) -> verdict_swapped (mapped back: A becomes B and vice-versa)
 * If both passes agree on the same original participant, return that verdict; otherwise tied.
 */
export async function doubleBlindVerdict(
  specA: string,
  specB: string,
  judge: (a: string, b: string) => Promise<JudgeVerdict>,
): Promise<JudgeVerdict> {
  const v1 = await judge(specA, specB);
  const v2 = await judge(specB, specA);
  const v2Mapped: JudgeVerdict = v2 === "A" ? "B" : v2 === "B" ? "A" : "tied";
  if (v1 === v2Mapped) return v1;
  return "tied";
}
