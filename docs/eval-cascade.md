# Evaluation Cascade

Each variation passes through three levels in order. Failing a level rejects the variation immediately — subsequent levels do not run.

## L1 — Stability

- Embed each run output via Mistral (`mistral-embed`).
- Section-aware chunking when an output exceeds the model's input limit (8192 tokens). Per-run vector = length-weighted mean of chunk vectors.
- Compute mean cosine similarity across all pairs of run vectors.
- **Pass** if mean ≥ `level1_stability.threshold` (default 0.85). Otherwise `REJECTED:unstable`.

## L2 — Decision Consistency

- Parse the configured section in each run output (`structured_list` parser for MVP).
- Compute Jaccard `|⋂Sᵢ| / |⋃Sᵢ|` over decision-key sets (`Sᵢ` = the set of `decision_key` values found in run `i`).
- **Pass** if percentage ≥ `level2_decisions.threshold_pct` (default 95). Otherwise `REJECTED:inconsistent`.
- A run with an empty section is `flaky`. ≥3 of N flaky runs reject the variation as `unreliable`.

## L3 — Pairwise Quality

- Survivors of L1 + L2 enter a single-elimination bracket together with the baseline (always seeded as a participant).
- For each match: pick a representative output per side (centroid run = median pairwise similarity), present both to the judge model with the rubric.
- Judge response is constrained to `A` | `B` | `tied` plus a one-line rationale.
- **Tied** resolves in favour of the baseline (preserves status quo when no clear winner).
- **Double-blind** (default `true`): each match runs twice with A/B swapped, majority wins, disagreement → `tied`.
- Bracket champion = round winner. If champion = baseline → rollback. Else → adopt.

See `docs/specs/2026-04-26-prompt-eval-framework-design.md` §3 for the full rationale (including why pairwise instead of absolute scores, and the cost characteristics of the cascade).
