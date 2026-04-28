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

## Generation Heuristics for the Skill

When you propose hypotheses for round 1 (auto mode) or round N+1 (any mode), follow these rules:

1. **Each hypothesis touches ONE axis.** Don't combine "rewrite for clarity AND add steps AND tighten guidelines" into a single hypothesis — you can't tell which sub-change drove the result.

2. **Prefer additions over deletions.** Adding output guidelines, adding a process step block, adding a specificity bound — easier to evaluate signal-wise than rewrites.

3. **Keep diffs small.** A 3-line patch to one section is much easier for the bracket judge to score than a 50-line rewrite. Aim for tight, surgical changes.

4. **Cover multiple axes across hypotheses.** If round 1 has 3 hyp, target 3 different axes. If two hyp target the same axis, you're wasting a slot.

5. **Pick axes by inspection.** Read the target prompt first. Look for vague language → axis 1; questions where instructions belong → axis 2; missing output spec → axis 3; complex task with no steps → axis 4; generic phrasings → axis 5. Don't guess what's broken — read.

6. **Document the axis in the description.** Each hypothesis description starts with `[Axis N: <name>] ...` so the round report shows which axes have been explored vs. untouched. Example: `[Axis 3: Output Guidelines] Add an explicit length cap of 200 words for the summary section.`

---

## Judge Rubric Default Criteria

The default rubric used by `prompt-eval-init` (or hand-authored profiles) should evaluate outputs along the same axes:

```
Compare two outputs (A and B) generated from the same input by two variations of the source prompt. For each output ask:

  - Is it clear (no vague preambles, no hedge language)?
  - Is it direct (instructions and action verbs, not open questions)?
  - Does it satisfy explicit output guidelines (length, structure, required elements)?
  - For complex tasks, did the prompt's process steps actually constrain the work usefully?
  - Is it specific (concrete bounds, not generic)?

Decide: "A" | "B" | "tied". Give a one-line rationale citing the strongest axis where the winner beats the loser.
```

Profile authors are free to extend the rubric with target-specific criteria (e.g. for `ai-board.specify`: "right dosage of [NEEDS CLARIFICATION] markers", "absence of implementation details") — but should keep these axis-1-to-5 anchors as the foundation.

---

## Source

These axes are condensed from Anthropic's official prompt engineering guidance for Claude. The principles are domain-agnostic and apply to any prompt that produces structured natural-language output.
