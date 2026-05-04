# Prompt Engineering Best Practices

Authoritative reference for `prompt-eval` skills when **generating hypotheses** (variations to test) and when **judging** outputs in the bracket. Both `prompt-eval:prompt-eval` (the team lead) and `prompt-eval:prompt-eval-init` (the wizard) read this file at runtime to ground their suggestions in proven axes of improvement.

If you propose an "improvement" that doesn't map to one of the axes below, you're guessing. Don't guess.

---

## Axis 1 — Clarity

A clear prompt:
- Uses simple language anyone can understand
- States exactly what is wanted, no hedging or padding
- Leads with a straightforward statement of the task

**Anti-patterns (worth fixing in a hypothesis):**
- Vague preambles: *"I need to know about those things people put on their roofs..."*
- Hedge language: *"maybe", "perhaps", "could possibly", "it might be nice if"*
- Self-narration: *"I was reading about... and was wondering..."*

**Hypothesis shape:** *"Strip the preamble in section X — replace with the direct task statement."*

---

## Axis 2 — Directness

A direct prompt uses:
- **Instructions, not questions.** Not *"What countries use geothermal energy?"* but *"Identify three countries that use geothermal energy."*
- **Action verbs as openers.** *Write, Create, Generate, Identify, Compare, List, Decide, Reject.*
- **Imperative mood.** Not *"It would be good to..."* but *"Do X."*

**Anti-patterns:**
- Open-ended questions where a directive is meant
- Polite phrasings that obscure the demand
- Multiple alternatives presented without telling the model which to pick

**Hypothesis shape:** *"Convert the questions in section X into imperative instructions."*

---

## Axis 3 — Output Guidelines (almost always worth adding)

Output guidelines control:
- **Length** (e.g. *"under 1000 words", "exactly 3 paragraphs"*)
- **Structure / format** (e.g. *"markdown table with columns A, B, C", "JSON with keys foo, bar"*)
- **Specific elements that must appear** (e.g. *"include at least one supporting character"*)
- **Tone or style** (e.g. *"formal", "playful", "match the voice of the existing copy"*)

A documented case from Anthropic shows adding output guidelines moved a meal-planning evaluation from 3.92 → 7.86 — **doubling output quality** with no other change.

**Anti-patterns:**
- Implicit length expectations (*"a brief summary"* — how brief?)
- Unspecified format (let the model pick → inconsistent runs)
- Missing must-include elements (the model omits things you wanted)

**Hypothesis shape:** *"Add an explicit output-format spec at the end of section X: length, required elements, structure."*

---

## Axis 4 — Process Steps (for complex / multi-angle tasks)

When a task needs systematic thinking — debugging, decision-making, multi-faceted analysis — give the model a numbered process to follow before producing the final output.

Example for "analyse why sales dropped":

```
1. List recent market metric changes
2. List industry-wide trends in the period
3. List individual / team performance changes
4. List organisational changes
5. Sample customer feedback
6. Synthesise: which factor(s) most plausibly explain the drop?
```

**When to add steps:**
- Multi-cause root-causing
- Decisions with conflicting criteria
- Analyses with several legitimate angles
- Anything where the model would otherwise jump to a single hypothesis

**Anti-patterns:**
- Asking *"why X happened"* and getting one shallow answer
- Asking for a comparison without specifying the dimensions

**Hypothesis shape:** *"Insert a numbered process-step block before the output spec, walking through dimensions A, B, C before synthesis."*

---

## Axis 5 — Specificity

Same idea as guidelines, but at the *content* level:
- Replace generic asks with concrete asks
- Replace open scope with bounded scope
- Replace examples-of-anything with examples-of-this-flavour

**Anti-patterns:**
- *"Write a short story about a character who discovers a hidden talent"* (200 words? 2000? one character? five? what flavour of talent?)
- Wishy-washy success criteria (*"the spec should be clear"* — clear how?)

**Hypothesis shape:** *"In section X, replace the generic phrasing 'do Y' with specific bounds: 'do Y on input class Z, producing output of shape W'."*

---

## Axis 6 — Structure with XML Tags

Claude is much better at distinguishing instructions from data, code from docs, examples from real input, when each chunk is wrapped in **descriptive XML tags**. Without tags, large prompts blur — the model has to guess where one section ends and another begins.

Use custom, semantic tag names rather than generic ones:

| Generic (worse) | Semantic (better) |
|---|---|
| `<data>...</data>` | `<sales_records>...</sales_records>` |
| `<info>...</info>` | `<athlete_information>...</athlete_information>` |
| `<text>...</text>` | `<my_code>...</my_code>` and `<docs>...</docs>` |
| (no tags) | `<sample_input>` and `<ideal_output>` for examples |

**When tags pay off most:**
- Prompts that interpolate large blocks of data
- Mixing multiple content types (code + docs + user message)
- Multi-section prompts where Claude must keep them straight
- Anything with examples (always wrap input/output pairs)

**Anti-patterns:**
- A prompt that pastes 500 lines of code inline with the instructions, no delimiter
- Multiple data blocks separated only by blank lines
- Generic `<data>` tags that don't tell Claude what the data represents

**Hypothesis shape:** *"Wrap the existing `<long inline content>` in section X with semantic XML tags `<descriptive_name>...</descriptive_name>`."* or *"Replace generic `<data>` tags in section X with `<<concrete_name>>` matching the actual content."*

---

## Axis 7 — Examples (One-shot / Multi-shot)

Showing beats telling. A single input/output pair often does more than a paragraph of description. Examples are particularly powerful for:

- **Edge cases** — sarcasm, ambiguity, tricky inputs the model would otherwise misread
- **Output format** — exact JSON shape, table layout, ordering
- **Style and tone** — how formal, how playful, how dense
- **Ambiguous inputs** — show how to disambiguate

**One-shot** = one example. Establishes a pattern. Use when the task has a clear single shape.

**Multi-shot** = multiple examples covering different scenarios. Use when the task has variation (positive/negative, simple/complex, common/edge-case) and you want each branch covered.

### Required structure for examples

Always wrap each example in XML tags (this combines axis 6 with axis 7):

```xml
<sample_input>
"Yeah, sure, that was the best movie I've seen since Plan 9 from Outer Space"
</sample_input>

<ideal_output>
Negative
</ideal_output>

This example is sarcastic — the reference to "Plan 9 from Outer Space" (one
of the worst movies ever made) signals the actual sentiment is negative
despite the surface-level positive language.
```

Notice the **commentary after the `<ideal_output>` block** — explaining *why* the output is ideal helps Claude generalise the pattern, not just the format.

### Where examples come from

The richest source is **the prompt's own evaluation history**. Look at runs that scored highest in past prompt-eval rounds → use those exact input/output pairs as in-prompt examples. This closes the loop: the framework helps you produce examples of "what good looks like" for the next iteration.

For new prompts without history, hand-pick 1-3 representative cases (covering at least one edge case) and use them.

**Anti-patterns:**
- A prompt with detailed instructions but zero examples
- Examples that all show the same flavour (e.g. only positive sentiment when the task includes detecting negative)
- Examples without commentary explaining what makes them ideal
- Examples with vague labels like `<example>...</example>` instead of `<sample_input>`/`<ideal_output>`

**Hypothesis shape:** *"Add a `<sample_input>...</sample_input>` + `<ideal_output>...</ideal_output>` block at the end of section X covering the <edge case Z> the prompt currently fails on."* or *"Convert the inline 'for example, you might write...' prose in section X into a properly tagged example block."*

---

## Axis 8 — Robustness (edge-case handling)

Most prompts have a happy path that works fine. They fall over on **degenerate inputs**: malformed payloads, missing fields, ambiguous phrasing, contradictory signals, empty strings, oversized inputs, encoding artefacts.

Look for:
- A prompt that reads inputs from a structured payload but never says what to do if a required field is missing
- Free-text input fields with no length cap or sanitisation guidance
- Implicit assumptions about input format (e.g. "the description will be a paragraph") with no fallback
- Decision logic with no explicit tie-breaker for ambiguous signals
- No instruction for "what to do when nothing matches" / catch-all

**Anti-patterns:**
- *"Parse the JSON payload"* → silently breaks on a malformed payload
- *"Extract the user's intent"* → on ambiguous phrasing, the model picks one branch arbitrarily
- *"Use the title and description to..."* → empty title or description? Undefined behaviour.

**Hypothesis shape:** *"In section X, add an explicit fallback for [missing field | malformed input | ambiguous signal]: 'If <condition>, do <fallback>; otherwise proceed.'"* or *"Add an early-validation step rejecting inputs that fail <constraint> with a clear error message before anything else runs."*

---

## Axis 9 — Parameter Tuning (numeric thresholds, weights, defaults)

Once a prompt has parameters — scoring weights, max counts, confidence thresholds, default policies — those parameters were almost certainly picked by guess on day one. They're worth empirical re-tuning.

Common tuning surfaces:
- **Numeric weights/scores** — *"Sensitive keywords (+3)"* → why 3 and not 4?
- **Max/min counts** — *"Maximum 3 [NEEDS CLARIFICATION] markers"* → 2? 5?
- **Confidence thresholds** — *"If confidence < 0.5, fall back to CONSERVATIVE"* → 0.4? 0.6?
- **Default policies** — *"Default to AUTO unless specified"* → CONSERVATIVE more often a better default?
- **Iteration caps** — *"Up to 3 iterations"* → 1? 5?

These changes don't fit cleanly under the other 8 axes — they're not about clarity or structure, they're about calibration. They're also **the most likely to be both small-diff AND high-impact** (one-number changes that can shift behaviour materially).

**Anti-patterns:**
- Magic numbers without justification (`× 3`, `≥ 0.5`)
- One-size-fits-all defaults that ignore context (`always CONSERVATIVE`)
- Iteration caps inherited from an earlier version of the prompt without re-evaluation

**Hypothesis shape:** *"In section X, change parameter `<name>` from `<old>` to `<new>` (small step, ±1 unit or ±0.1 for fractions). Rationale: <one-line>."*

Pair this axis with **bracket judging** to learn which direction the parameter wants to move. Don't propose 5 different values for the same parameter in one round — that creates a multi-arm bandit, not a clean A/B.

---

## Applying the axes — universal vs surface-conditional

Not all 9 axes apply to every prompt. Treating them as uniformly applicable produces noise: an instruction-pure agent prompt loses 3+ points on a naive mean for surfaces it doesn't have. The audit and hypothesis-generation skills must distinguish:

### Universal axes (always applicable)

**Axes 1, 2, 3, 4, 5, 8** — Clarity, Directness, Output Guidelines, Process Steps, Specificity, Robustness.

These are properties any prompt can have or fail to have, regardless of style. A 30-line agent definition and a 250-line orchestration skill both need clear language, imperative directness, output bounds, scaffolding for multi-step tasks, concrete asks, and edge-case fallbacks. Score 1-10. Never N/A.

### Surface-conditional axes (applicable only when the prompt has the surface)

**Axis 6 — Structure (XML).** Applies only when the prompt **interpolates content blocks** Claude must distinguish from instructions: schemas, JSON shapes, code, templates, agent sub-prompts, regex sets, `$ARGUMENTS` placeholders holding structured payloads. A prose-only instruction prompt has nothing for XML tags to delimit; scoring it on XML hygiene is a category error. → `N/A` when no interpolated blocks.

**Axis 7 — Examples.** Applies only when the task output is **generative-ambiguous** — open-ended natural language where multiple valid shapes exist and a worked `<sample_input>`/`<ideal_output>` example would teach *judgment or style*, not just *shape*. A prompt that emits a fixed JSON schema gains nothing from an example that re-states the schema. → `N/A` when the output is deterministic / strictly-shaped, or when the prompt is a behavior-defining agent rather than an artifact-emitting one.

**Axis 9 — Parameter Tuning.** Applies only when the prompt contains **numeric parameters that influence behavior** — weights, thresholds, max counts, percentages, defaults. A prompt without magic numbers has nothing to justify. → `N/A` when no numeric parameters exist (ordinal step labels and schema field positions don't count).

### Why the split matters

A naive mean over 9 axes punishes legitimate prompt styles. A short cleanup-agent prompt with no interpolation, no generative ambiguity, and no parameters is *correctly* `N/A` on axes 6/7/9 — that's not a defect, it's a stylistic fit. The audit reports two scores:

- **Core** = mean of axes 1, 2, 3, 4, 5, 8 — the headline. Universal correctness.
- **Contextual** = mean of *applicable* axes among 6, 7, 9 — secondary. Stylistic fit *for prompts whose surface populates these axes*.

Never average Core and Contextual together. They measure different things.

### For hypothesis generation (`prompt-eval`)

When generating hypotheses for a round, only propose changes targeting axes whose surface exists. A hypothesis "wrap section X in `<sales_records>` tags" is wasted on a prompt that has no `sales_records`-shaped block. The "Pick axes by inspection" rule (see Generation Heuristics below) already enforces this — the surface check makes it explicit.

### For judging (`prompt-eval`, `prompt-eval-init`)

The rubric judges *outputs*, not the prompt itself. A criterion like "Examples: wrapped in `<sample_input>`/`<ideal_output>`" applies to the *output* if the output is itself an example-bearing artifact. For most outputs (a generated summary, a JSON payload, a refactored code block) most of these criteria self-resolve to applicable or not. The judge LLM applies them intelligently in context.

---

## Beyond axes — domain-specific tweaks

Some valid hypothesis types are not universally applicable. Use them when the target prompt happens to expose the surface:

- **Cost/length reduction** — strip a long-but-redundant section (e.g. duplicated guidance), test whether the output quality holds. Worth trying when you suspect the prompt is bloated.
- **Model substitution** — if the prompt internally invokes another model (e.g. as a sub-task), test a smaller/cheaper model for that sub-task.
- **Constraint removal** — sometimes the right move is to *remove* a constraint that's over-restricting. The bracket will tell you if quality holds.
- **Section reordering** — moving a high-leverage section (output spec, examples) earlier in the prompt.
- **Conflict resolution rules** — explicit tie-breakers when multiple branches of the prompt could fire.

Don't force these into hypotheses if the target doesn't have the surface. But if it does, they're as valid as the 9 best-practice axes.

---

## Size-aware hypothesis design

A hypothesis that fixes one axis but bloats the prompt has a hidden cost: bloat regresses the other axes. A 60-line example block dropped inline lifts axis 7 (Examples) but tanks axes 1 (Clarity), 2 (Directness), and 4 (Process Steps) because the prompt becomes harder to read. The bracket judge will see this and may reject the hypothesis even though "the example was good".

**Rule:** before proposing any hypothesis, estimate its diff size relative to the target prompt's current size, then apply the size-saving patterns below.

<size_thresholds>
| Target prompt size | Per-hypothesis budget | Why |
|---|---|---|
| **≤ 50 lines** (under-specified) | up to **+200%** of current size | The prompt is so empty that big structural additions are necessary, not optional. Inline an example if the prompt has none — `examples/` indirection is overkill at this scale. |
| **50-200 lines** (typical) | ≤ **30%** of current size | Standard case. Use size-saving patterns (external file + reference) when they don't hurt readability. |
| **≥ 200 lines** (large) | ≤ **10%** of current size, size-saving patterns mandatory | The cost of adding a line is high — every line dilutes the surrounding instructions. Always go via `examples/` files, inline rationale, terse fallbacks. |
</size_thresholds>

(Rationale for the bins: prompt sizes empirically cluster around 20-50 (single-task), 80-150 (multi-step commands), and 250+ (orchestration skills). The 50 / 200 boundaries split those clusters cleanly.)

**Score-aware classification (audit `quick_fix` vs `ab_test`):** the classification depends on the audit's overall score, not just the diff size.

<score_aware_classification>
| Overall audit score | Classification policy |
|---|---|
| **< 5** (poor) | Even structural rewrites can be `quick_fix`. The prompt is so weak that the risk of regression is dominated by the upside of any reasonable change. |
| **5-7** (mediocre) | Standard rule. `quick_fix` = low-risk additions, `ab_test` = behaviour-changing. |
| **> 7** (good) | Every non-trivial change is `ab_test`. Diminishing returns, regression risk dominates. |
</score_aware_classification>

(Rationale for 5 / 7: on a 0-10 axis where 1 is catastrophic and 10 is best-practice perfect, 5 is the "minimally working" floor and 7 is the "good enough that further changes need empirical proof" line.)

Use the size-saving patterns below for any hypothesis that would otherwise exceed its budget:

### For axis 6 (XML structure)

Wrap **only the interpolated content blocks** (schemas, contracts, templates) — typically 3-6 wraps total, ~10-12 lines added. Do NOT wrap every section header or every paragraph. The point is to delimit content boundaries, not to XML-ify the whole document.

### For axis 7 (Examples) — most likely to bloat

**Pattern: external file + 3-line teaser + reference.**

❌ Bad: paste 60 lines of `<sample_input>` + `<ideal_output>` + commentary directly into the prompt.

✅ Good: create `examples/<name>-sample.md` with the full worked example (wrapped in `<sample_input>`/`<ideal_output>` + commentary inside that file), then add to the prompt:

```
For a complete worked example of <thing>, see [`examples/<name>-sample.md`](../examples/<name>-sample.md). It shows <one-line summary>.
```

The audit's axis 7 score still goes up — the skill explicitly references the sample with the right tag pattern, and the example is reachable. But the prompt itself only gains ~3 lines.

### For axis 9 (Parameter tuning rationale)

**Pattern: inline one-liner.**

❌ Bad: a 5-line commentary block above each magic number explaining the historical choice.

✅ Good: parenthetical inline rationale, ≤1 line per number:

```
... cap at 15 (Agent Teams hard limit is 16, leave 1 slot for the lead).
... fallback when confidence < 0.5 (below this, signal is noise).
```

### For axis 8 (Robustness fallbacks)

**Pattern: terse `if-condition: action` lines, not paragraphs.**

❌ Bad: a 4-paragraph explanation of what happens when the input is malformed.

✅ Good:

```
If <profile.target.repo> is missing: abort with "<message>".
If <input field> is empty: substitute <default> and continue.
```

### For axis 4 (Process Steps), 3 (Output Guidelines), 1/2/5 (Clarity/Directness/Specificity)

These are typically **rephrasings or substitutions**, not additions. Diff size is usually neutral or negative. No special pattern needed — just keep diffs surgical.

### Total budget per round

If your 3-5 hypotheses for a round, summed, would add more than ~50 lines to the prompt: split across multiple rounds instead. Round 1: structural fixes (axes 6, 9). Round 2: example pointers (axis 7). Round 3: tightening (axes 1, 2, 5). The cascade rewards small, attributable changes.

---

## Generation Heuristics for the Skill

When you propose hypotheses for round 1 (auto mode) or round N+1 (any mode), follow these rules:

1. **Each hypothesis touches ONE axis.** Don't combine "rewrite for clarity AND add steps AND tighten guidelines" into a single hypothesis — you can't tell which sub-change drove the result.

2. **Prefer additions over deletions.** Adding output guidelines, adding a process step block, adding a specificity bound — easier to evaluate signal-wise than rewrites.

3. **Keep diffs size-aware (relative, not absolute).** Compute the per-hypothesis budget from the target prompt's current size — see the table in "Size-aware hypothesis design" above. A 60-line addition is fine on a 30-line under-specified prompt, but disastrous on a 250-line orchestration skill. When in doubt, prefer size-saving patterns (external file + reference, terse fallbacks, inline rationale) and split across rounds.

4. **Cover multiple axes across hypotheses.** If round 1 has 3 hyp, target 3 different axes. If two hyp target the same axis, you're wasting a slot.

5. **Pick axes by inspection.** Read the target prompt first. Look for: vague language → axis 1; questions where instructions belong → axis 2; missing output spec → axis 3; complex task with no steps → axis 4; generic phrasings → axis 5; large content blocks with no delimiters → axis 6; absent or inline-prose examples → axis 7; missing fallbacks for malformed/ambiguous input → axis 8; magic numbers without justification → axis 9; bloat / model-cost imbalance / over-restrictive constraints → "beyond axes". Don't guess what's broken — read.

6. **Read the latest audit, if any.** Before generating from scratch, check `~/.prompt-eval/audits/<target-basename>-*.md`. If a recent audit exists, its "A/B test candidates" section already lists hypotheses derived from a careful read of the prompt. Use those as a base; only add self-generated hypotheses to cover axes the audit didn't reach.

6. **Document the axis in the description.** Each hypothesis description starts with `[Axis N: <name>] ...` so the round report shows which axes have been explored vs. untouched. Example: `[Axis 3: Output Guidelines] Add an explicit length cap of 200 words for the summary section.`

---

## Judge Rubric Default Criteria

The default rubric used by `prompt-eval-init` (or hand-authored profiles) should evaluate outputs along the nine axes:

```
Compare two outputs (A and B) generated from the same input by two variations of the source prompt. For each output ask:

  - Clarity:           no vague preambles, no hedge language
  - Directness:        instructions and action verbs, not open questions
  - Output Guidelines: explicit length / structure / required-element constraints met
  - Process Steps:     for complex tasks, did the steps actually constrain useful work
  - Specificity:       concrete bounds, not generic phrasing
  - Structure:         semantic XML tags delimit sections cleanly
  - Examples:          if present, wrapped in <sample_input>/<ideal_output> with commentary
  - Robustness:        handles edge cases / missing fields / ambiguous input gracefully
  - Parameter Tuning:  numeric thresholds and defaults are well-calibrated for this case

Decide: "A" | "B" | "tied". Give a one-line rationale citing the strongest axis where the winner beats the loser.
```

Profile authors are free to extend the rubric with target-specific criteria (e.g. for `ai-board.specify`: "right dosage of [NEEDS CLARIFICATION] markers", "absence of implementation details") — but should keep these axis-1-to-9 anchors as the foundation.

---

## Source

These axes are condensed from Anthropic's official prompt engineering guidance for Claude. The principles are domain-agnostic and apply to any prompt that produces structured natural-language output.
