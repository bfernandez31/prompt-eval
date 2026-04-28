# Sample Eval Round

A walked-through example of what one round of `/prompt-eval` produces — the round-report.md, plus the artefacts that feed into it. Use this as the reference shape for the ideal round outcome.

---

<sample_input>
- Profile: `acme.summarise`
- Mode: `auto`
- Round: 1
- Hypotheses (3, all auto-generated from a previous audit's A/B candidates):
  - **H1** [Axis 7: Examples] Add a worked one-shot example
  - **H2** [Axis 9: Parameter Tuning] Halve the word cap from 200 → 100
  - **H3** [Axis 1: Clarity] Strip hedge language ("try to", "is fine")
- runs_per_hypothesis: 3
- Test input: a Wikipedia article URL (the same one used across all 9 runs)
</sample_input>

<ideal_output>
```markdown
# Round 1 — acme.summarise

**Baseline:** original prompt (frozen at run start)
**Hypotheses tested:** 3
**Total runs:** 9 (3 × 3)
**Cost:** $1.84 (well under the $20 cap)

## Per-hypothesis results

| Hypothesis | Source       | L1 (stability) | L2     | Status     |
|---|---|---|---|---|
| H1 [Axis 7]  | audit:…0428 | 0.91 ✓        | n/a    | qualified  |
| H2 [Axis 9]  | audit:…0428 | 0.94 ✓        | n/a    | qualified  |
| H3 [Axis 1]  | audit:…0428 | 0.88 ✓        | n/a    | qualified  |

(L2 is n/a — the profile has level2_decisions: { skip: true })

## Bracket (pairwise judging)

Participants: [baseline, H1, H2, H3]
Judge: claude-haiku-4-5, double-blind enabled.

| Match | Verdict | Winner |
|---|---|---|
| baseline vs H1 | A (tied → favour baseline) | baseline |
| H2 vs H3 | B | H3 |
| baseline vs H3 | B | H3 |

**Bracket champion:** H3
**Decision:** ADOPT — `state.baseline_path` updated to `rounds/round-1/hypotheses/H3/variation.md`.

## Why H3 won (judge rationale, axis-tagged)

Cited axis: **Axis 1 (Clarity)**.
> "H3 produced a more direct, decision-grade summary. The baseline's hedged phrasings ('a kind of …', 'roughly speaking') leaked into the output and softened the central thesis. H3's tightening of the prompt removed those signals."

## Why H1 lost (despite being qualified)

> "H1's added example shifted the output toward mimicking the example's voice rather than the article's. The summary read more like the example's commentary than a faithful abstract. Tied → baseline kept."

Note: this is a useful empirical signal — *adding examples isn't free*; if the example's tone bleeds, the prompt regresses on faithfulness. Worth noting in the next round.

## Why H2 lost

> "H2 (100-word cap) produced summaries that omitted secondary points the baseline kept. Cleaner but less informative."

## Stop-criteria check

- Convergence (2 rollbacks in a row)? **No** — round 1 adopted.
- Budget exceeded? **No** ($1.84 / $20.00).
- Round cap reached? **No** (1 / 5).
- → **Continue to round 2** (auto mode = no checkpoint).

## What goes into round 2

The orchestrator will read this report, identify untouched axes, and propose 3 new hypotheses. Likely focus areas given round 1:
- Axes 8 (Robustness — empty article handling)
- Axes 6 (Structure — wrap article placeholder in <article> tags, untouched in round 1)
- A retry of axis 7 with a different example phrasing (since H1's example bled style)
```

This example is well-shaped because:
- Per-hypothesis statuses with both metric scores AND the "source" provenance (audit-derived vs generated)
- Bracket matches shown explicitly, not just the final winner
- Judge rationale cited per-match WITH the axis it leaned on (the rubric is doing its job)
- Loser rationales are kept — they're the most useful signal for the next round
- Stop-criteria check is explicit
- The "what goes into round 2" closes the loop: every losing axis becomes a candidate for retry/diversification
</ideal_output>
