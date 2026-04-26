// lib/eval/l1-stability.ts
import { chunkBySection } from "../embedding/chunking";
import { meanPairwise, cosine } from "../embedding/similarity";
import type { L1Result } from "../types";

export interface EvaluateL1Args {
  runOutputs: string[];
  embed: (texts: string[]) => Promise<{ embeddings: number[][] }>;
  maxTokens: number;
  threshold: number;
}

export async function evaluateL1(args: EvaluateL1Args): Promise<L1Result> {
  if (args.runOutputs.length < 2) {
    throw new Error("L1 needs at least 2 run outputs");
  }

  // For each run, embed each chunk and aggregate by length-weighted mean → one vector per run.
  const perRunVectors: number[][] = [];
  for (const out of args.runOutputs) {
    const chunks = chunkBySection(out, args.maxTokens);
    const { embeddings } = await args.embed(chunks.map((c) => c.text));
    const totalWeight = chunks.reduce((s, c) => s + c.weight, 0);
    const dim = embeddings[0]!.length;
    const agg = new Array<number>(dim).fill(0);
    for (let i = 0; i < embeddings.length; i++) {
      const w = chunks[i]!.weight / totalWeight;
      const e = embeddings[i]!;
      for (let d = 0; d < dim; d++) agg[d]! += e[d]! * w;
    }
    perRunVectors.push(agg);
  }

  const pair_similarities: L1Result["pair_similarities"] = [];
  for (let i = 0; i < perRunVectors.length; i++) {
    for (let j = i + 1; j < perRunVectors.length; j++) {
      pair_similarities.push({ i, j, sim: cosine(perRunVectors[i]!, perRunVectors[j]!) });
    }
  }
  const mean_similarity = meanPairwise(perRunVectors);
  return {
    pair_similarities,
    mean_similarity,
    gate: mean_similarity >= args.threshold ? "pass" : "fail",
  };
}
