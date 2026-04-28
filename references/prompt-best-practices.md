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

## Generation Heuristics for the Skill

When you propose hypotheses for round 1 (auto mode) or round N+1 (any mode), follow these rules:

1. **Each hypothesis touches ONE axis.** Don't combine "rewrite for clarity AND add steps AND tighten guidelines" into a single hypothesis — you can't tell which sub-change drove the result.

2. **Prefer additions over deletions.** Adding output guidelines, adding a process step block, adding a specificity bound — easier to evaluate signal-wise than rewrites.

3. **Keep diffs small.** A 3-line patch to one section is much easier for the bracket judge to score than a 50-line rewrite. Aim for tight, surgical changes.

4. **Cover multiple axes across hypotheses.** If round 1 has 3 hyp, target 3 different axes. If two hyp target the same axis, you're wasting a slot.

5. **Pick axes by inspection.** Read the target prompt first. Look for: vague language → axis 1; questions where instructions belong → axis 2; missing output spec → axis 3; complex task with no steps → axis 4; generic phrasings → axis 5; large content blocks with no delimiters → axis 6; absent or inline-prose examples → axis 7. Don't guess what's broken — read.

6. **Document the axis in the description.** Each hypothesis description starts with `[Axis N: <name>] ...` so the round report shows which axes have been explored vs. untouched. Example: `[Axis 3: Output Guidelines] Add an explicit length cap of 200 words for the summary section.`

---

## Judge Rubric Default Criteria

The default rubric used by `prompt-eval-init` (or hand-authored profiles) should evaluate outputs along the same seven axes:

```
Compare two outputs (A and B) generated from the same input by two variations of the source prompt. For each output ask:

  - Clarity:           no vague preambles, no hedge language
  - Directness:        instructions and action verbs, not open questions
  - Output Guidelines: explicit length / structure / required-element constraints met
  - Process Steps:     for complex tasks, did the steps actually constrain useful work
  - Specificity:       concrete bounds, not generic phrasing
  - Structure:         semantic XML tags delimit sections cleanly
  - Examples:          if present, are they wrapped in <sample_input>/<ideal_output> with commentary

Decide: "A" | "B" | "tied". Give a one-line rationale citing the strongest axis where the winner beats the loser.
```

Profile authors are free to extend the rubric with target-specific criteria (e.g. for `ai-board.specify`: "right dosage of [NEEDS CLARIFICATION] markers", "absence of implementation details") — but should keep these axis-1-to-7 anchors as the foundation.

---

## Source

These axes are condensed from Anthropic's official prompt engineering guidance for Claude. The principles are domain-agnostic and apply to any prompt that produces structured natural-language output.
