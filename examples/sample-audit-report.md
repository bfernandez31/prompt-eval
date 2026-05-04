# Sample Audit Report

A walked-through example of what `/prompt-eval-audit` produces on a fictional target prompt. Use this as the reference shape for what an ideal audit looks like.

The example below audits a short fictional prompt that has both classic best-practice gaps (no examples, no XML structure) and a tuning gap (magic threshold).

---

<sample_input>
Target prompt being audited (`acme.summarise.md`):

```markdown
---
description: Summarise an article into a 1-paragraph abstract.
---

You are a summariser. Read the article and write a summary.

Try to be helpful and concise. The summary should be good and capture the main idea.

If the article is long, you can use 200 words. If it is short, fewer is fine.

Output the summary directly.
```
</sample_input>

<ideal_output>
```markdown
# Audit: acme.summarise

**Source:** /Users/me/repo/.claude-plugin/commands/acme.summarise.md
**Audited:** 2026-04-28T12:00:00Z
**Reference:** references/prompt-best-practices.md (9 axes — 6 universal, 3 surface-conditional)
**Profile:** none

## Prompt surface

- `prompt_type`: artifact-emitting — the prompt produces a discrete summary artifact
- `has_interpolated_blocks`: true — the prompt reads an article placeholder
- `output_is_generative_ambiguous`: true — summary style/voice has multiple valid shapes
- `has_numeric_parameters`: true — "200 words" is a behavior-influencing number

## Scores

- **Core score (axes 1-5, 8): 3.4/10** — foundational gaps across clarity, output spec, specificity, robustness.
- **Contextual score (applicable among 6, 7, 9): 2.3/10** — XML structure absent, examples absent, magic number unjustified.

## Score by axis

| Axis | Name | Type | Score | One-line |
|---|---|---|---|---|
| 1 | Clarity | universal | 4/10 | hedge language ("try to", "can use", "is fine") |
| 2 | Directness | universal | 5/10 | "be helpful and concise" is vague |
| 3 | Output Guidelines | universal | 3/10 | (artifact surface) "200 words" is loose; no format spec; no required elements |
| 4 | Process Steps | universal | 7/10 | task is single-step — no scaffolding needed |
| 5 | Specificity | universal | 3/10 | "good", "main idea", "long", "short" — all undefined |
| 6 | Structure (XML) | conditional | 2/10 | no tags around the article-content placeholder |
| 7 | Examples | conditional | 1/10 | zero examples on a generative-ambiguous task |
| 8 | Robustness | universal | 2/10 | no behaviour spec for empty article, non-text input |
| 9 | Parameter Tuning | conditional | 4/10 | "200 words" magic number with no rationale |

## Quick fixes (apply directly)

### 1. [Axis 1: Clarity] Strip hedge language
- Affects: lines 5-9
- Change: replace "Try to be helpful and concise. The summary should be good and capture the main idea. If the article is long, you can use 200 words. If it is short, fewer is fine." with "Write a summary capturing the article's central thesis. Use ≤200 words; aim for ≤120 when the article is under 1000 words."
- Diff size: ~5 lines
- Risk: low — same intent, less hedged language.

### 2. [Axis 6: Structure] Wrap the article placeholder in `<article>` tags
- Affects: line 4 (after "You are a summariser. Read the article")
- Change: add explicit `<article>{{ARTICLE}}</article>` placeholder so the model sees a clear content boundary.
- Diff size: ~3 lines
- Risk: low — purely structural improvement.

## A/B test candidates (validate via /prompt-eval)

### 1. [Axis 7: Examples] Add a worked one-shot example
- Affects: end of file
- Change: add an `<example>` block with a sample article + ideal summary + commentary on why the summary works.
- Why it needs testing: examples can shift output style/length/voice — empirical pass tells you whether the new pattern beats the current implicit one.
- Expected impact: high

### 2. [Axis 9: Parameter Tuning] Halve the word cap from 200 → 100
- Affects: line containing the word limit
- Change: `≤100 words` instead of `≤200`.
- Why it needs testing: empirical pass will tell whether tighter is better quality or strips too much.
- Expected impact: medium

## Findings (verbatim)

### Axis 1 — Clarity (4/10)
> "Try to be helpful and concise. The summary should be good and capture the main idea."

### Axis 5 — Specificity (3/10)
> "If the article is long, you can use 200 words. If it is short, fewer is fine."
```

This example is well-shaped because:
- Each axis is tagged `universal` or `conditional`, with conditional axes scored only because the surface exists (article placeholder, generative output, magic number)
- Two scores reported separately — Core (universal correctness) and Contextual (stylistic fit) — never averaged together
- Quick fixes are concrete (specific lines, specific replacement, specific risk)
- A/B candidates explain *why* empirical testing is needed
- Findings are verbatim quotes the user can grep for in their source

A counter-example: an instruction-pure cleanup-agent prompt with no interpolated blocks, deterministic output, and no parameters would score `N/A` on axes 6, 7, 9 — that's correct, not a defect, and would yield a Core score of e.g. 8/10 with Contextual `N/A`.
</ideal_output>
