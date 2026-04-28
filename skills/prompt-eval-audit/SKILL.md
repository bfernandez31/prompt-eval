---
name: prompt-eval-audit
description: Static audit of a Claude Code prompt (slash-command, skill, or agent) against the 7 universal prompt-engineering best-practice axes. Reads the file, scores each axis 1-10, lists concrete findings with quotes, and produces ranked recommendations split into "quick fixes" (apply directly without empirical testing) and "A/B test candidates" (worth validating via /prompt-eval). Costs near-zero — one LLM analysis pass, no runs. Use BEFORE running a /prompt-eval campaign to harvest the obvious wins and save the hypothesis budget for genuinely ambiguous changes.
---

# Activation

Invoked as:

```
/prompt-eval-audit <absolute-path-to-prompt>
/prompt-eval-audit <absolute-path-to-prompt> --profile <profile-name>
```

The optional `--profile <name>` flag loads `<plugin_root>/profiles/<name>.yml` to extract any target-specific criteria from its rubric, so the audit can include those alongside the universal axes.

# Goal

Produce a deterministic audit report in one pass. **No runs, no clones, no money burned.** Just static analysis of the prompt text against `<plugin_root>/references/prompt-best-practices.md`.

For a complete walked-through example of an ideal audit (target prompt + per-axis scoring + quick fixes + A/B candidates), see [`examples/sample-audit-report.md`](../../examples/sample-audit-report.md).

# Procedure

## Step 0 — Resolve `plugin_root`

```bash
plugin_root="$(cd "$(dirname "$(realpath ./skills/prompt-eval-audit/SKILL.md)")/../.." && pwd)"
```

## Step 1 — Read inputs

1. Read the prompt file at `<absolute-path-to-prompt>` via the Read tool.
   - **Robustness fallback:** if the path doesn't exist, abort with: `"audit target not found: <path>. Pass an absolute path to a markdown file."`
   - If the file is empty (`0` bytes) or contains no markdown headings: abort with `"audit target appears empty or non-markdown — nothing to score."`
2. Read `<plugin_root>/references/prompt-best-practices.md` to ground the analysis. The 9 axes + heuristics defined there are your evaluation framework.
3. If `--profile <name>` was passed: resolve the profile in priority order — first `$HOME/.prompt-eval/profiles/<name>.yml`, then `$plugin_root/profiles/<name>.yml` (the latter holds built-in profiles like `ai-board.specify`). Load it and extract `eval.level3_quality.rubric`. Pull out target-specific bullet criteria (the lines under `# Target-specific (...)` if structured that way) for use in step 4.
   - **Robustness fallback:** if `--profile` was passed but the profile is not found in either location, **warn but do not abort** — proceed with the 9 universal axes only and tell the user the target-specific layer was skipped.

## Step 2 — Score each axis (1-10)

For each axis, inspect the prompt and produce:

- A score from 1 (catastrophic) to 10 (best practice fully applied)
- 1-3 specific findings, each with a verbatim quote from the prompt (≤2 lines per quote)
- A one-line summary

### Axis 1 — Clarity
Scan for: vague preambles, hedge language ("maybe", "perhaps", "could possibly", "it might"), self-narration ("I was wondering...", "I think we should..."). High score = direct task statements, no padding.

### Axis 2 — Directness
Scan for: questions where instructions belong (`What countries...?` instead of `Identify three countries...`), missing action verbs at section openers, polite phrasings that obscure the demand. High score = imperatives with strong action verbs.

### Axis 3 — Output Guidelines
Check: is there an explicit length cap? a format spec? a required-elements list? tone/style guidance? High score = each output dimension constrained explicitly. Low score = "produce something good" without bounds.

### Axis 4 — Process Steps
Check: is the task multi-faceted (debug, decide, root-cause, analyse multi-dim)? If yes, are there numbered steps? Are they BEFORE the output spec (so they actually constrain the work)? High score = appropriate steps in the right place. Low score = complex task with no scaffolding.

### Axis 5 — Specificity
Scan for: generic asks ("write a short story"), open scope ("about anything you want"), examples-of-anything. High score = concrete bounds (input class, output shape, example flavour). Low score = wishy-washy.

### Axis 6 — Structure (XML Tags)
Check: are there large content blocks (data, code, docs, examples) interpolated into the prompt? Are they wrapped in semantic XML tags (`<sales_records>`, `<my_code>`, `<docs>`) or just pasted inline? High score = every interpolated block tagged. Low score = walls of mixed content.

### Axis 7 — Examples
Check: are there any input/output examples? Are they wrapped in `<sample_input>` / `<ideal_output>` tags? Is there commentary after the ideal output explaining *why* it's ideal? High score = at least one well-tagged example with commentary, covering an edge case. Low score = no examples or only inline-prose "for example, you might..." mentions.

### Axis 8 — Robustness (edge-case handling)
Check: does the prompt explicitly handle malformed/missing/ambiguous inputs? Are there fallbacks for empty fields, oversized payloads, contradictory signals? Is there a catch-all "if nothing matches, do <X>" rule? High score = inputs are validated up-front and every decision branch has an explicit tie-breaker. Low score = silent assumptions ("the description will be a paragraph"), no fallback for missing fields, no tie-breakers.

### Axis 9 — Parameter Tuning
Check: does the prompt have numeric parameters (weights, thresholds, max counts, defaults)? Are they justified, or are they magic numbers? High score = explicit rationale next to each parameter, OR parameters reference a calibration source. Low score = sprinkled magic numbers (`+3`, `0.5`, `max 3`) with no explanation. Note this axis isn't about whether the values are correct — that requires empirical testing — only whether they're documented well enough that a future tuner knows where to start.

## Step 3 — Compute overall score

`overall = round(mean(axis scores), 1)`

## Step 4 — Generate ranked recommendations

For each axis scoring **< 7**, generate one recommendation. (Rationale for the `< 7` threshold: an axis at 7+ is "good enough that a forced fix would be premature optimisation". Below 7, the gap is material enough that proposing a fix has positive expected value.)

**Size-aware diffs.** Each suggested diff must respect the `≤ 10 lines` rule — but more importantly, it must use the size-saving patterns from `references/prompt-best-practices.md` § Size-aware hypothesis design. Specifically:

- **Axis 7 (Examples) recommendations** must propose an external file under `examples/` plus a 2-3 line teaser + reference in the prompt. Never inline 50 lines of `<sample_input>`/`<ideal_output>` directly into the audited prompt.
- **Axis 6 (XML) recommendations** wrap interpolated content blocks only (3-6 wraps total), not every section header.
- **Axis 9 (Parameter Tuning) recommendations** add inline parenthetical rationale (≤1 line per number), not paragraph commentary.
- **Axis 8 (Robustness) recommendations** add terse `if-condition: action` lines, not paragraphs.

If a clean fix would require >15 added lines, mark the recommendation as `category: ab_test` with a note that the fix needs to be split across multiple rounds.

```
### Recommendation N: [Axis K: <name>] <short title>

**Quote / context:** <verbatim from prompt>

**Fix:** <one-paragraph description>

**Suggested diff:**
```diff
<unified diff against the prompt file, surgical, ≤10 lines>
```

**Category:** quick_fix | ab_test
**Expected impact:** high | medium | low
**Rationale for category:**
- quick_fix → low-risk, no plausible regression, apply directly
- ab_test  → changes the example space or behaviour materially; validate empirically
```

Categorisation guideline:
- **Quick fixes**: adding XML tags around existing inline content, fixing typos, cleaning up obvious hedge language, reformatting an existing list, adding a length cap that doesn't change behaviour.
- **A/B test candidates**: adding a new example, restructuring sections, changing default policies, modifying scoring rules, removing existing constraints. Anything where the model behaviour might change in unforeseen ways.

If the profile was loaded (--profile flag), also include 1 recommendation per target-specific criterion that the prompt currently fails on.

Sort recommendations by **expected impact** descending, then by axis order.

## Step 5 — Write the audit report

Compose a markdown report with this structure:

```markdown
# Audit: <basename of prompt path>

**Source:** <absolute path>
**Audited:** <UTC ISO timestamp>
**Reference:** [`references/prompt-best-practices.md`](../references/prompt-best-practices.md) (7 axes)
**Profile:** <profile name or "none">

## Score by axis

| Axis | Name | Score | One-line |
|---|---|---|---|
| 1 | Clarity | 7/10 | minor preamble in section X |
| 2 | Directness | 8/10 | mostly imperative |
| 3 | Output Guidelines | 4/10 | no explicit length/format spec |
| 4 | Process Steps | 6/10 | steps present but mid-section |
| 5 | Specificity | 7/10 | a few generic phrasings |
| 6 | Structure (XML) | 2/10 | zero XML tags despite multi-section content |
| 7 | Examples | 1/10 | zero examples |

**Overall:** 5.0/10 — three axes (Output Guidelines, Structure, Examples) are the dominant weaknesses.

## Findings

For each axis, the verbatim quotes that drove the score (1-3 per axis, ≤2 lines each).

[axis-by-axis breakdown]

## Recommendations (ranked by impact)

[full list per Step 4]

## Quick fixes (apply directly)

These are low-risk improvements you can apply to the source file right now without an empirical pass:

- Recommendation 2 (Axis 6: wrap AUTO scoring rules in `<auto_resolution_policy>` tags)
- Recommendation 3 (Axis 3: add explicit 3-line cap on Auto-Resolved Decision rationale)

To apply, save each suggested diff to a file and run:

    cd <repo containing the prompt>
    patch -p1 < /path/to/recommendation-N.diff

## A/B test candidates (validate via /prompt-eval)

These are bigger changes worth testing empirically before adopting:

- Recommendation 1 (Axis 7: add a worked Auto-Resolved Decision example)

To run them:

    /prompt-eval-init <profile-name>      # if no profile yet
    # Then add the recommendations above as initial_hypotheses in the profile
    # (each one is already in unified-diff form, ready to plug in)
    /prompt-eval <profile-name>

## Pipeline note

This audit is the cheap front-half of the prompt-eval pipeline:

  1. /prompt-eval-audit  → static, ~$0.10, identifies obvious wins
  2. /prompt-eval-init   → scaffolds a profile if you don't have one
  3. /prompt-eval        → empirical bracket testing on ambiguous changes

Run audit FIRST so the empirical budget is spent on the changes that actually need testing.
```

## Step 6 — Save the report

The audit report goes under the user's home directory, **not** under `$plugin_root`. The plugin install dir is read-only by convention — writing into it triggers a Claude Code permission prompt on every audit. Instead, mirror the convention used for runs/clones:

```bash
audit_dir="$HOME/.prompt-eval/audits"
mkdir -p "$audit_dir"
ts="$(date -u +%Y%m%d-%H%M%S)"
basename="$(basename '<absolute-path-to-prompt>' .md)"
report_path="$audit_dir/$basename-$ts.md"
# Write the composed report to $report_path
```

Users who want zero permission prompts ever can add `Write(~/.prompt-eval/**)` and `Bash(mkdir -p ~/.prompt-eval/**)` to their `~/.claude/settings.json` permissions allowlist — same allowlist that benefits `runs/` and `clones/`.

## Step 7 — Final output to user

Print the **entire audit summary to the chat**, not just the top recommendation. The user paid for the analysis; they shouldn't have to `cat` the file to see the result. The saved report stays on disk for persistence and for full diffs, but the chat must be self-contained.

Format the chat output like this (markdown rendered inline by Claude Code):

```
✓ Audit complete: <report_path>

# <basename of prompt>

**Overall:** <overall>/10

| Axis | Name | Score | One-line |
|---|---|---|---|
| 1 | Clarity | 7/10 | minor preamble in section "Outline" |
| 2 | Directness | 8/10 | mostly imperative |
| 3 | Output Guidelines | ... | ... |
| 4 | Process Steps | ... | ... |
| 5 | Specificity | ... | ... |
| 6 | Structure (XML) | ... | ... |
| 7 | Examples | ... | ... |
| 8 | Robustness | ... | ... |
| 9 | Parameter Tuning | ... | ... |

## Quick fixes (apply directly)

### 1. [Axis K: <name>] <short title>
- Affects: lines <a-b> of the prompt (or "section X")
- Change: <one-line description of the edit>
- Diff size: ~<n> lines
- Risk: low — <why it's a quick fix>

### 2. ... (one block per quick fix)

## A/B test candidates (validate via /prompt-eval)

### 1. [Axis K: <name>] <short title>
- Affects: <where>
- Change: <one-line description>
- Why it needs testing: <one line — material behaviour change, format shift, etc.>
- Expected impact: high | medium | low

### 2. ... (one block per A/B candidate)

## Findings (verbatim quotes that drove the scoring)

### Axis 1 — Clarity (7/10)
> "<quote 1, ≤2 lines>"
> "<quote 2 if any>"

### Axis 6 — Structure (3/10)
> "<quote showing untagged content block>"

(only show axes scoring < 7 — the others are already fine)

## Where to go next

- **Apply quick fixes inline** — diffs are in the report at <report_path>:
    cd <repo-root> && patch -p1 < <(extract from report)
- **Run an empirical pass for the A/B candidates**:
    /prompt-eval-init <profile-name>      # if no profile yet
    /prompt-eval <profile-name>            # cascade with the candidates as initial_hypotheses

Full report with all diffs: <report_path>
```

Goal: every recommendation has its title, scope, and category visible in the chat. Diffs themselves stay in the saved report (they can be 10-50 lines each — too much for chat). The user reads the chat, decides what to apply, and only opens the report when they need a specific diff.

# Notes

- The audit is pure analysis; it never modifies the source file.
- Run is single-pass and deterministic: same prompt + same model = approximately same audit.
- If the user re-audits a prompt after applying recommendations, the score for the addressed axes should clearly improve. This is a useful sanity check.
- For multi-file prompts (e.g. an agent that spans several markdown files), audit each file separately and aggregate manually.
