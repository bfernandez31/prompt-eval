// lib/report.ts
import type { HypothesisStatus } from "./types";

export interface RoundHypothesis {
  id: string;
  description: string;
  status: HypothesisStatus;
  l1: number | null;
  l2: number | null;
}

export interface RoundMatch {
  round: number;
  a: string;
  b: string;
  verdict: "A" | "B" | "tied";
  winner: string;
}

export interface RoundData {
  round: number;
  baseline_id: string;
  hypotheses: RoundHypothesis[];
  bracket_winner: string | null;
  bracket_matches: RoundMatch[];
  decision: "adopt" | "rollback";
  total_usd: number;
}

export function renderRoundReport(d: RoundData): string {
  const lines: string[] = [];
  lines.push(`# Round ${d.round}`);
  lines.push("");
  lines.push(`Baseline: ${d.baseline_id}`);
  lines.push("");
  lines.push(`## Hypotheses`);
  lines.push("");
  for (const h of d.hypotheses) {
    const tag = h.status.kind === "qualified" ? "qualified" : `rejected:${h.status.reason}`;
    const l1 = h.l1 === null ? "—" : h.l1.toFixed(3);
    const l2 = h.l2 === null ? "—" : `${h.l2.toFixed(1)}%`;
    lines.push(`- **${h.id}** (${tag}) — L1=${l1} L2=${l2} — ${h.description}`);
  }
  lines.push("");
  lines.push(`## Bracket`);
  lines.push("");
  for (const m of d.bracket_matches) {
    lines.push(`- Match: ${m.a} vs ${m.b} → verdict=${m.verdict}, winner=${m.winner}`);
  }
  if (d.bracket_winner) {
    lines.push(`- **Bracket winner:** ${d.bracket_winner}`);
  } else {
    lines.push(`- **Bracket winner:** none (no qualified survivors)`);
  }
  lines.push("");
  lines.push(`## Decision`);
  lines.push("");
  lines.push(d.decision === "adopt" ? `**ADOPT: ${d.bracket_winner}**` : "**ROLLBACK** (baseline unchanged)");
  lines.push("");
  lines.push(`## Cost`);
  lines.push("");
  lines.push(`Total this round: $${d.total_usd.toFixed(2)}`);
  return lines.join("\n");
}
