// lib/bracket.ts

export type JudgeVerdict = "A" | "B" | "tied";

export interface Match {
  round: number;
  a: string;
  b: string;
  verdict: JudgeVerdict;
  winner: string;
}

export interface RunBracketArgs {
  participants: string[];
  judge: (a: string, b: string) => Promise<JudgeVerdict>;
}

export interface BracketResult {
  winner: string;
  matches: Match[];
}

export async function runBracket(args: RunBracketArgs): Promise<BracketResult> {
  if (args.participants.length === 0) throw new Error("bracket: empty participants");
  if (args.participants.length === 1) {
    return { winner: args.participants[0]!, matches: [] };
  }

  const baseline = args.participants[0]!;
  const matches: Match[] = [];
  let current = [...args.participants];
  let round = 0;

  while (current.length > 1) {
    round += 1;
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const a = current[i]!;
      const b = current[i + 1];
      if (b === undefined) {
        next.push(a); // bye
        continue;
      }
      const verdict = await args.judge(a, b);
      const winner =
        verdict === "A" ? a
        : verdict === "B" ? b
        : a === baseline ? a
        : b === baseline ? b
        : a;
      matches.push({ round, a, b, verdict, winner });
      next.push(winner);
    }
    current = next;
  }

  return { winner: current[0]!, matches };
}
