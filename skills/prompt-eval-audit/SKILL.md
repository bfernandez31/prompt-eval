---
name: prompt-eval-audit
description: Static audit of a Claude Code prompt (slash-command, skill, or agent) against 9 prompt-engineering best-practice axes — 6 universal (always scored) and 3 surface-conditional (scored only when the prompt has the surface they target). Produces a dual score (Core for the universal axes, Contextual for the applicable conditional ones) plus ranked recommendations split into "quick fixes" (apply directly) and "A/B test candidates" (validate via /prompt-eval). Costs near-zero — one LLM analysis pass, no runs. Use BEFORE running a /prompt-eval campaign to harvest the obvious wins and save the hypothesis budget for genuinely ambiguous changes.
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
2. Read `<plugin_root>/references/prompt-best-practices.md` to ground the analysis. The 9 axes + heuristics defined there are your evaluation framework. Pay particular attention to the **"Applying the axes — universal vs surface-conditional"** section: 6 axes are universal, 3 are surface-conditional, and surface-conditional axes get scored `N/A` when their surface doesn't exist.
3. If `--profile <name>` was passed: resolve the profile in priority order — first `$HOME/.prompt-eval/profiles/<name>.yml`, then `$plugin_root/profiles/<name>.yml` (the latter holds built-in profiles like `ai-board.specify`). Load it and extract `eval.level3_quality.rubric`. Pull out target-specific bullet criteria (the lines under `# Target-specific (...)` if structured that way) for use in Step 6.
   - **Robustness fallback:** if `--profile` was passed but the profile is not found in either location, **warn but do not abort** — proceed with the 9 axes only and tell the user the target-specific layer was skipped.

## Step 2 — Resolve referenced files

Prompts rarely live alone. They cite templates that shape their output and examples that ground their style. An audit that only reads the entry-point file silently penalizes a prompt for "missing" structure or examples that actually exist in `templates/` or `examples/` next door.

This step extracts and selectively loads those refs so Step 3 (surface detection) and Step 4 (scoring) see the full surface. **Loaded refs are not themselves audited** — they only inform how the target prompt is scored.

### 1. Extract candidate paths from the prompt body

**"Looks like a path" gate (applies to every pattern below):** a candidate must contain `/` AND end in a recognized file extension (`.md`, `.yaml`, `.yml`, `.json`, `.txt`, `.html`, `.toml`, `.sh`, `.py`, `.ts`, `.js`, `.go`, `.rb`, `.png`, `.jpg`, `.pdf`). This filters out shell snippets in inline code (`` `bun run test` ``, `` `git status` ``) before they pollute the missing-references list with false Axis 8 findings.

Patterns to collect (deduplicated, resolved to absolute paths, all subject to the gate above):
- Markdown links: `[label](path.md)`, `[label](./path.md)`
- Inline-code paths: `` `templates/X.md` ``, `` `path/to/file.yaml` `` — only when the gate passes
- Plugin-root templates: `${CLAUDE_PLUGIN_ROOT:-...}/X` — strip the variable, keep the suffix
- Quoted relative paths in prose: `"templates/spec-template.md"`, `'examples/foo.md'`
- **Bare-prose paths in running text** (no quotes, no backticks): tokens that satisfy the gate appearing in normal sentences, e.g. `Load templates/spec-template.md to understand required sections`. Real prompts cite this way often — without this pattern most template references would be missed.

**Path resolution:** absolute → as-is; relative → relative to the target prompt's directory (NOT cwd); `${CLAUDE_PLUGIN_ROOT:-...}` → relative to the nearest ancestor directory containing `.claude-plugin/`. After resolution, candidates whose resolved path doesn't exist on disk go into the **missing references** list (Axis 8 finding — see sub-step 4 below).

**Refs are not followed transitively** — only the target prompt's direct citations are loaded (depth=1). If a loaded template itself cites another file, that second-order ref is out of scope.

**SKILL.md targets:** also enumerate sibling-bundle files (`references/*.md`, `examples/*.md`, child `*.md` at depth ≤ 2 from the SKILL.md — covers `references/X.md` and `references/subdir/X.md`; deeper nesting is rare in skill bundles). These count as implicitly cited even when not explicitly referenced — they are part of the skill bundle and shape its surface.

### 2. Classify load vs skip

| Pattern | Decision | Why |
|---|---|---|
| `templates/`, `template`, `spec-template`, `*.template.md` | **Load** | Shapes output structure |
| `examples/`, `*sample*.md`, `*example*.md` | **Load** | Grounds style/judgment |
| Sibling `references/`, `examples/` of a SKILL.md target | **Load** | Part of the skill bundle |
| Files inside the same plugin's `skills/`, `commands/`, `agents/`, `.claude-plugin/` (same `.claude-plugin/` ancestor as the target) | **Load** | Sub-prompt / child skill |
| `constitution.md`, paths under `memory/`, `vision/`, `policies/`, `docs/` | Skip | Project policy, not prompt-shaping |
| `.sh`, `.py`, `.js`, `.ts`, `.go`, `.rb` and other code files | Skip | Implementation; the prompt's *use* of them is what matters, not their internals |
| `.png`, `.jpg`, `.pdf`, `.zip`, `.gz`, etc. | Skip | Binary / opaque |
| Other text files (`.md`, `.yaml`, `.yml`, `.json`, `.toml`, `.txt`, `.html`) not matching any row above | Conditional | Read the citing sentence(s) and judge: **Load** if the prose treats the file as authoritative for shaping the prompt's output, examples, behavior, or evaluation framework (template, worked example, reference, ground-truth doc, rubric, schema spec, calibration source, etc. — phrased however). **Skip** if it's project policy, runtime data, or auxiliary documentation that doesn't change what the prompt does. When genuinely ambiguous, skip and note the file as `ambiguous — model judgment` in the Skipped list. |

### 3. Apply cap and load

Cap total loaded files at **5** (covers a typical skill bundle: 1 template + 2 examples + 1 sub-prompt + 1 reference; raise only when you've measured the bundle is bigger). If more candidates pass classification, prioritize: (1) explicit `templates/`, (2) explicit `examples/`, (3) sibling SKILL.md bundle files, (4) sub-prompts. Drop the rest with a "capped" note in the skipped list.

Read each loaded file via the Read tool. The output of this step is a set of `(absolute_path, content, load_reason)` triples available to Step 3 and Step 4.

### 4. How loaded refs influence scoring (Step 4)

When loaded refs are present, adjust axis scoring:

- **Axis 3 (Output Guidelines):** if a loaded template defines length / structure / required elements, do NOT penalize the prompt for absent inline format spec — credit the "Load template X" instruction. The score reflects the *combined* surface (prompt + loaded template), not the prompt in isolation.
- **Axis 6 (Structure / XML):** wrapping concerns only the prompt body itself. Refs pulled at runtime from another file are not the prompt's wrapping problem; do not penalize for not inlining + wrapping content that lives in a separate file by design.
- **Axis 7 (Examples):** an explicitly cited example file counts toward axis 7 only if it contains at least one `<sample_input>`/`<ideal_output>` pair with commentary explaining why the output is ideal — that's the bar set in `references/prompt-best-practices.md` § Axis 7. Score by inspecting the loaded file's actual content, not just the citation. Prose narrative ("here's roughly what a good output looks like…") without the tagged pair counts as no example. A citation pointing at a file lacking a tagged pair is a low score regardless of the file's other merits.
- **Axis 8 (Robustness):** any cited path that resolved but the file is absent on disk is a broken reference — add it to findings. The prompt is referencing something that doesn't exist.

This step does NOT score or recommend changes to the loaded refs themselves — they are out of audit scope. Only the target prompt is the audit target.

### 5. Record refs in the report

The canonical layout for `Loaded / Skipped / Missing references` lives in Step 7 (saved report) and Step 9 (chat output). Populate those fields from this step's output.

## Step 3 — Detect prompt surface

Some axes are *surface-conditional* — they only apply when the prompt has the surface they target. Scoring an instruction-pure agent on "are large interpolated content blocks wrapped in semantic XML tags?" produces noise, not signal. A short Anthropic-official cleanup-agent prompt would lose 3+ points on the mean for axes that don't even apply to its style.

Inspect the prompt **and the loaded references from Step 2** to set three booleans. Record them in the report — they drive Step 4 (scoring) and Step 5 (score model). When the prompt and a loaded template disagree (e.g. prompt looks generative-ambiguous but the cited template enforces a strict schema), trust the loaded ref — that's the runtime reality.

- **`has_interpolated_blocks`** — `true` if the prompt contains content blocks pasted in literally (schemas, JSON shapes, code, templates, agent prompts, regex sets, `$ARGUMENTS` or other interpolation placeholders that hold structured payloads). `false` for prose-only instruction prompts where every line is "what to do" rather than "what to read".
  - Rule of thumb: any block where Claude needs to distinguish "this is data/schema/template I read" from "this is instructions I follow" → `true`.
  - Controls **axis 6 (Structure / XML)**.

- **`output_is_generative_ambiguous`** — `true` if the task produces open-ended natural language where multiple valid shapes exist (a generated spec, written summary, structured doc, narrative response). `false` if the output is a strict schema (fixed JSON, deterministic command sequence, table with predetermined columns) or if the prompt is a behavior-defining agent that doesn't itself emit a single artifact.
  - Rule of thumb: would a worked `<sample_input>`/`<ideal_output>` example actually disambiguate the task, or would it just re-state the schema? Only `true` if the example would teach *judgment or style*, not just *shape*.
  - Controls **axis 7 (Examples)**.

- **`has_numeric_parameters`** — `true` if the prompt contains weights, thresholds, max counts, percentages, or numeric defaults that influence behavior (e.g. `+3`, `≥0.5`, `max 3`, `30%`, `1500 chars`). `false` if the only numbers are ordinal step labels (`1.`, `2.`) or schema field positions.
  - Controls **axis 9 (Parameter Tuning)**.

- **`prompt_type`** — one of `artifact-emitting`, `action-agent`, `hybrid`. This does NOT add or remove an axis — it tells **axis 3 (Output Guidelines)** which surface to score against (see Axis 3 description below).
  - `artifact-emitting` = the prompt produces a discrete deliverable (spec.md, JSON payload, report, summary, code-review comment, generated answer text). Axis 3 scores the artifact: length cap, format spec, required elements, tone.
  - `action-agent` = the prompt defines an agent that *acts* on the world (edits code, dispatches sub-agents, runs commands, modifies state) without necessarily emitting a single artifact. Axis 3 scores the meta-behavior: no-op rule, summary format, edit granularity, confirmation gates.
  - `hybrid` = both (e.g. a slash command that writes a spec AND posts a comment). Score on the weaker surface.

These booleans/types are NOT a quality signal — a prompt with `interpolated_blocks=false`, `generative_ambiguous=false`, `numeric_parameters=false`, `prompt_type=action-agent` is not a worse prompt, just a different style.

## Step 4 — Score each axis (1-10 or N/A)

For each axis, inspect the prompt and produce:

- A score from 1 (catastrophic) to 10 (best practice fully applied), **or `N/A`** for surface-conditional axes whose surface doesn't exist
- 1-3 specific findings (1 = thin evidence, more than 3 = noise that dilutes the strongest defect), each with a verbatim quote from the prompt (≤2 lines per quote — long quotes lose focus on the specific defect; 2 lines comfortably covers a sentence boundary). Skip findings entirely for `N/A` axes — instead give a one-line reason for the N/A
- A one-line summary

Axes 1, 2, 3, 4, 5, 8 are **universal** — always score 1-10, never N/A. Axes 6, 7, 9 are **surface-conditional** — score N/A when the corresponding boolean from Step 3 is `false`.

### Axis 1 — Clarity
Scan for: vague preambles, hedge language ("maybe", "perhaps", "could possibly", "it might"), self-narration ("I was wondering...", "I think we should..."). High score = direct task statements, no padding.

### Axis 2 — Directness
Scan for: questions where instructions belong (`What countries...?` instead of `Identify three countries...`), missing action verbs at section openers, polite phrasings that obscure the demand. High score = imperatives with strong action verbs.

### Axis 3 — Output Guidelines

Every prompt has *some* output. The question is whether what's emitted is constrained. **Axis 3 is universal but its surface depends on `prompt_type` from Step 3** — pick the right checklist:

- **`prompt_type == artifact-emitting`** → score the artifact: explicit length cap? format spec (markdown shape, JSON schema, table layout)? required-elements list? tone/style? High score = each artifact dimension constrained explicitly.
- **`prompt_type == action-agent`** → score the meta-behavior: explicit **no-op rule** ("if no changes needed, say so and exit")? **summary format** (does the agent report what it did, in what shape, length bound)? **granularity** (one bundled change vs many separate proposals)? **interactivity / confirmation gates** before risky edits? High score = the agent's behavior surface is contracted, not just its actions.
- **`prompt_type == hybrid`** → both checklists apply; score on the weaker surface.

Low score = "produce something good" / "do the right thing" without bounds — regardless of prompt type. The one-line summary in the report should mention which checklist was applied (e.g. `4/10 (action-agent: no no-op rule, no summary format)`).

### Axis 4 — Process Steps
Check: is the task multi-faceted (debug, decide, root-cause, analyse multi-dim)? If yes, are there numbered steps? Are they BEFORE the output spec (so they actually constrain the work)? High score = appropriate steps in the right place. Low score = complex task with no scaffolding.

### Axis 5 — Specificity
Scan for: generic asks ("write a short story"), open scope ("about anything you want"), examples-of-anything. High score = concrete bounds (input class, output shape, example flavour). Low score = wishy-washy.

### Axis 6 — Structure (XML Tags) — *surface-conditional*
**N/A condition:** if `has_interpolated_blocks == false`, score = `N/A` with reason "no interpolated content blocks". Do not penalize a prose-only instruction prompt for not having XML tags it doesn't need.

Otherwise: are the large content blocks (data, code, docs, examples) wrapped in semantic XML tags (`<sales_records>`, `<my_code>`, `<docs>`) or just pasted inline? High score = every interpolated block tagged. Low score = walls of mixed content.

### Axis 7 — Examples — *surface-conditional*
**N/A condition:** if `output_is_generative_ambiguous == false`, score = `N/A` with reason "output shape is deterministic / no judgment-style ambiguity for an example to disambiguate". An example that just re-shows the JSON schema adds noise; only score when an example would teach *style or judgment*.

Otherwise: are there input/output examples? Are they wrapped in `<sample_input>` / `<ideal_output>` tags? Is there commentary after the ideal output explaining *why* it's ideal? High score = at least one well-tagged example with commentary, covering an edge case. Low score = no examples or only inline-prose "for example, you might..." mentions.

### Axis 8 — Robustness (edge-case handling)
Check: does the prompt explicitly handle malformed/missing/ambiguous inputs? Are there fallbacks for empty fields, oversized payloads, contradictory signals? Is there a catch-all "if nothing matches, do <X>" rule? High score = inputs are validated up-front and every decision branch has an explicit tie-breaker. Low score = silent assumptions ("the description will be a paragraph"), no fallback for missing fields, no tie-breakers.

### Axis 9 — Parameter Tuning — *surface-conditional*
**N/A condition:** if `has_numeric_parameters == false`, score = `N/A` with reason "no numeric parameters present". A prompt without weights/thresholds/caps has nothing to justify.

Otherwise: are the parameters justified or magic numbers? High score = explicit rationale next to each parameter, OR parameters reference a calibration source. Low score = sprinkled magic numbers (`+3`, `0.5`, `max 3`) with no explanation. This axis isn't about whether the values are correct — that requires empirical testing — only whether they're documented well enough that a future tuner knows where to start.

## Step 5 — Compute scores

Two scores, not one. Do **not** average them together.

- **Core score** = `round(mean(axes 1, 2, 3, 4, 5, 8), 1)`. These six axes are universal — every prompt should pass them regardless of style. **This is the headline.**

- **Contextual score** = `round(mean(applicable axes among 6, 7, 9), 1)`, or `N/A` if all three are N/A. Reported as secondary, never folded into Core.

A prompt with **Core 9/10 and Contextual N/A** is excellent — it's a clean instruction-pure prompt with no surface for the conditional axes. A prompt with **Core 5/10 and Contextual 9/10** is broken even if its XML hygiene is perfect: the universal axes are where correctness lives.

Why the split: a single mean over 9 axes punishes prompt styles that legitimately don't use 3 of them (e.g. short agent definitions, fixed-schema slash commands). The headline must reflect actual prompt quality, not stylistic fit to one prompt archetype.

## Step 6 — Generate ranked recommendations

For each **applicable** axis scoring **< 7**, generate one recommendation. `N/A` axes generate nothing — they're not defects. (Rationale for the `< 7` threshold: an axis at 7+ is "good enough that a forced fix would be premature optimisation". Below 7, the gap is material enough that proposing a fix has positive expected value.)

**Size-aware diffs.** Compute the per-hypothesis budget from the target prompt's current size (see `references/prompt-best-practices.md` § Size-aware hypothesis design):

- **≤ 50 lines** → up to **+200%** budget. Inline an example if the prompt has none; `examples/` indirection is overkill at this scale.
- **50-200 lines** → ≤ **30%** budget. Prefer size-saving patterns when they don't hurt readability.
- **≥ 200 lines** → ≤ **10%** budget. Size-saving patterns mandatory: external `examples/` files, inline parenthetical rationale (≤1 line per magic number), terse `if-condition: action` fallbacks (not paragraphs), wrap only interpolated content blocks (3-6 wraps total, not every section).

**Score-aware classification (`quick_fix` vs `ab_test`).** Use the **Core score** to set the threshold:

- **Core < 5** → even structural rewrites can be `quick_fix`. The prompt is so weak the upside dominates the regression risk.
- **Core 5-7** → standard rule. `quick_fix` = low-risk additions, `ab_test` = behaviour-changing.
- **Core > 7** → every non-trivial change is `ab_test`. Diminishing returns.

If a clean fix would still exceed its budget, mark it `category: ab_test` with a "split across rounds" note in the recommendation.

<recommendation_template>
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
</recommendation_template>

Categorisation guideline:
- **Quick fixes**: adding XML tags around existing inline content, fixing typos, cleaning up obvious hedge language, reformatting an existing list, adding a length cap that doesn't change behaviour.
- **A/B test candidates**: adding a new example, restructuring sections, changing default policies, modifying scoring rules, removing existing constraints. Anything where the model behaviour might change in unforeseen ways.

If the profile was loaded (--profile flag), also include 1 recommendation per target-specific criterion that the prompt currently fails on.

Sort recommendations by **expected impact** descending, then by axis order.

## Step 7 — Write the audit report

Compose a markdown report with this structure:

<saved_report_template>
```markdown
# Audit: <basename of prompt path>

**Source:** <absolute path>
**Audited:** <UTC ISO timestamp>
**Reference:** [`references/prompt-best-practices.md`](../references/prompt-best-practices.md) (9 axes — 6 universal, 3 surface-conditional)
**Profile:** <profile name or "none">

## Prompt surface

- `prompt_type`: <artifact-emitting|action-agent|hybrid> — <one-line reason; controls Axis 3's surface>
- `has_interpolated_blocks`: <true|false> — <one-line reason>
- `output_is_generative_ambiguous`: <true|false> — <one-line reason>
- `has_numeric_parameters`: <true|false> — <one-line reason>
- **Loaded references** (informed scoring):
  - `<absolute_path>` — <one-line load reason>
  - … (or `none` if no refs were loaded)
- **Skipped references**: `<path>` (<reason>), … (omit line if empty)
- **Missing references**: `<path>` (cited but absent on disk — Axis 8 finding), … (omit line if empty)

## Scores

- **Core score (axes 1-5, 8): 7.0/10** — the headline. Universal axes every prompt must pass.
- **Contextual score (applicable axes among 6, 7, 9): 4.5/10** — secondary signal, only counts axes whose surface exists.

## Score by axis

| Axis | Name | Type | Score | One-line |
|---|---|---|---|---|
| 1 | Clarity | universal | 7/10 | minor preamble in section X |
| 2 | Directness | universal | 8/10 | mostly imperative |
| 3 | Output Guidelines | universal | 4/10 | no explicit length/format spec |
| 4 | Process Steps | universal | 6/10 | steps present but mid-section |
| 5 | Specificity | universal | 7/10 | a few generic phrasings |
| 6 | Structure (XML) | conditional | 2/10 | zero XML tags despite multi-section content |
| 7 | Examples | conditional | N/A | output is fixed JSON — no judgment-style ambiguity to disambiguate |
| 8 | Robustness | universal | 6/10 | no fallback for missing field X |
| 9 | Parameter Tuning | conditional | N/A | no numeric parameters present |

## Findings

For each axis, the verbatim quotes that drove the score (1-3 per axis, ≤2 lines each).

[axis-by-axis breakdown]

## Recommendations (ranked by impact)

[full list per Step 6]

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
</saved_report_template>

## Step 8 — Save the report

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

## Step 9 — Final output to user

Print the **entire audit summary to the chat**, not just the top recommendation. The user paid for the analysis; they shouldn't have to `cat` the file to see the result. The saved report stays on disk for persistence and for full diffs, but the chat must be self-contained.

Format the chat output like this (markdown rendered inline by Claude Code):

<chat_output_template>
```
✓ Audit complete: <report_path>

# <basename of prompt>

**Core (axes 1-5, 8):** <core>/10  ← headline
**Contextual (applicable among 6, 7, 9):** <contextual>/10  *or*  N/A

> Surface: type=<artifact-emitting|action-agent|hybrid>, interpolated_blocks=<bool>, generative_ambiguous=<bool>, numeric_parameters=<bool>
> Loaded refs: <path1>, <path2>, … (or `none`) — Skipped: <path3 (reason)>, … — Missing: <path4>, … (omit Skipped/Missing if empty)

| Axis | Name | Type | Score | One-line |
|---|---|---|---|---|
| 1 | Clarity | universal | 7/10 | minor preamble in section "Outline" |
| 2 | Directness | universal | 8/10 | mostly imperative |
| 3 | Output Guidelines | universal | ... | ... |
| 4 | Process Steps | universal | ... | ... |
| 5 | Specificity | universal | ... | ... |
| 6 | Structure (XML) | conditional | ... *or* N/A | reason if N/A |
| 7 | Examples | conditional | ... *or* N/A | reason if N/A |
| 8 | Robustness | universal | ... | ... |
| 9 | Parameter Tuning | conditional | ... *or* N/A | reason if N/A |

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

(only show **applicable** axes scoring < 7 — universal axes ≥7 and N/A axes are not defects, don't enumerate them)

## Where to go next

- **Apply quick fixes inline** — diffs are in the report at <report_path>:
    cd <repo-root> && patch -p1 < <(extract from report)
- **Run an empirical pass for the A/B candidates**:
    /prompt-eval-init <profile-name>      # if no profile yet
    /prompt-eval <profile-name>            # cascade with the candidates as initial_hypotheses

Full report with all diffs: <report_path>
```
</chat_output_template>

Goal: every recommendation has its title, scope, and category visible in the chat. Diffs themselves stay in the saved report (they can be 10-50 lines each — too much for chat). The user reads the chat, decides what to apply, and only opens the report when they need a specific diff.

# Notes

- The audit is pure analysis; it never modifies the source file.
- Run is single-pass and deterministic: same prompt + same model = approximately same audit.
- If the user re-audits a prompt after applying recommendations, the score for the addressed axes should clearly improve. This is a useful sanity check.
- For multi-file prompts (e.g. an agent that spans several markdown files), audit each file separately and aggregate manually.
- An `N/A` on a surface-conditional axis is **not** a defect — it means the prompt is of a style that doesn't have that surface. Don't propose recommendations to "fix" an N/A axis.
- The Core score is the only number worth comparing across prompts of different styles. The Contextual score is only meaningful between prompts whose surface populates the same conditional axes.
