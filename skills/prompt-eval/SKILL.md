---
name: prompt-eval
description: Self-improvement framework for Claude Code prompts. Pass a profile name to evaluate variations of that target prompt via a 3-level cascade (stability via embeddings, decision-consistency via parsing, and pairwise quality via a judge bracket). The skill itself is the team lead — it dispatches all runner teammates directly at the top level (no nested teams), so every parallel agent is visible in the Claude Code Agent Teams tmux split.
---

# Activation

Invoked as `/prompt-eval <profile-name>` (filename without `.yml`, e.g. `ai-board.specify`).

Optional flags:
- `--mode auto` (overrides profile mode; requires `limits` set)
- `--max-budget <USD>` (overrides `limits.max_budget_usd`)
- `--max-rounds <N>` (overrides `limits.max_rounds`)
- `--runs <N>` (overrides `eval.runs_per_hypothesis` for ad-hoc cheaper passes)

# You Are the Team Lead

You orchestrate the entire run from this session. **All teammates you dispatch are at the top level** — runner teammates only. You never tell a teammate to dispatch another teammate. The `runner` agent (see `agents/runner.md`) is the only role you spawn.

This is a deliberate flat architecture:
- It avoids the nested-team limitation of Claude Code Agent Teams
- It makes every parallel agent visible in the tmux split
- It keeps each teammate's context tightly scoped to its single run

# Phase 1 — Bootstrap

## 1.1 Resolve plugin_root

`plugin_root` is the absolute path to this plugin's install directory. From within this skill:

```bash
plugin_root="$(cd "$(dirname "$(realpath ./skills/prompt-eval/SKILL.md)")/../.." && pwd)"
# or use $CLAUDE_PLUGIN_ROOT if Claude Code exposes it; fall back to the resolved path.
```

The CLI lives at `$plugin_root/scripts/prompt-eval`. The first profile lives at `$plugin_root/profiles/<profile-name>.yml`.

## 1.2 Resolve and load the profile

Profiles can live in two locations. Resolve in this priority order:

1. **`$HOME/.prompt-eval/profiles/<profile-name>.yml`** — user profiles (created by `/prompt-eval-init`, persistent across plugin updates).
2. **`$plugin_root/profiles/<profile-name>.yml`** — built-in profiles shipped with the plugin (e.g. `ai-board.specify` as a starting example).

```bash
profile_path="$HOME/.prompt-eval/profiles/<profile-name>.yml"
[ -f "$profile_path" ] || profile_path="$plugin_root/profiles/<profile-name>.yml"
[ -f "$profile_path" ] || { echo "Profile <profile-name> not found in either ~/.prompt-eval/profiles/ or $plugin_root/profiles/"; exit 1; }
```

A user profile with the same name as a built-in **overrides** the built-in — useful for forking the bundled `ai-board.specify` profile to your own variant without touching the plugin.

Then load and validate:

```bash
bun -e "import('$plugin_root/lib/profile-loader.ts').then(m => m.loadProfile('$profile_path')).then(p => console.log(JSON.stringify(p)))"
```

If `--mode auto` is in effect (after CLI override), require `limits.max_rounds > 0` AND `limits.max_budget_usd > 0`. Otherwise abort with: `"auto mode requires positive max_rounds and max_budget_usd in profile.limits"`.

Apply CLI overrides to the in-memory profile object: `--max-budget` → `limits.max_budget_usd`, `--max-rounds` → `limits.max_rounds`, `--runs` → `eval.runs_per_hypothesis`.

## 1.3 Initialise run state

```bash
run_id=$(bun -e "import('$plugin_root/lib/run-id.ts').then(m => console.log(m.generateRunId('<profile.name>')))")
run_dir="$HOME/.prompt-eval/runs/$run_id"
clones_root="$HOME/.prompt-eval/clones/$run_id"
mkdir -p "$run_dir" "$clones_root"
```

Copy the original prompt to `$run_dir/original-baseline.md` (frozen reference):

```bash
cp "<profile.target.repo>/<profile.target.prompt_file>" "$run_dir/original-baseline.md"
```

Initialise `eval-run.yml`:

```bash
bun -e "import('$plugin_root/lib/state.ts').then(m => m.initState('$run_dir', { run_id: '$run_id', profile_path: '<profile_path>', mode: '<mode>', baseline_path: '$run_dir/original-baseline.md' }))"
```

## 1.4 Determine round 1 hypotheses

Sourcing priority:

### (a) `profile.initial_hypotheses` non-empty

Use them directly. Persist under `eval-run.yml.hypotheses_round_1` and proceed.

### (b) `mode: auto` AND `initial_hypotheses` empty — generate them yourself

**Read `<plugin_root>/references/prompt-best-practices.md` first.** It defines:
- **9 universal axes** (1–7 best practices: Clarity, Directness, Output Guidelines, Process Steps, Specificity, XML Structure, Examples; 8–9 tuning: Robustness, Parameter Tuning)
- **A "beyond axes" category** for domain-specific tweaks (cost/length, model swap, constraint removal, section reordering)
- **Generation heuristics** you must follow (one axis per hypothesis, prefer additions, small diffs, cover multiple axes, prefix with `[Axis N: <name>]` or `[Beyond: <category>]`)

**Then look for an existing audit.** Before generating from scratch:

```bash
target_basename="$(basename '<profile.target.prompt_file>' .md)"
latest_audit="$(ls -1 $HOME/.prompt-eval/audits/${target_basename}-*.md 2>/dev/null | sort | tail -n1)"
```

If `$latest_audit` exists, parse its "## A/B test candidates" section. Each candidate already comes with a description, axis tag, and unified diff. **Use those as your starting set.** Only add self-generated hypotheses if the audit didn't cover an axis or category you think is worth probing this round.

Surface this to the run state with provenance: `eval-run.yml.hypotheses_round_1[k].source = "audit:<basename of audit file>"` for audit-derived ones, `"generated"` for the rest.

Then:
1. Read `$run_dir/original-baseline.md` (the target prompt)
2. Identify weaknesses by axis OR check the audit's findings
3. Propose 3–5 hypotheses combining audit candidates (priority) + axis-based additions for diversity
4. Generate / extract a unified diff for each
5. Persist as separate files (per the diff persistence rule below) with metadata + `source` in `eval-run.yml.hypotheses_round_1`
6. Proceed to Phase 2 without user intervention

### (c) `mode: semi-auto` AND `initial_hypotheses` empty — interactive loop with the user

Even in semi-auto, **check `~/.prompt-eval/audits/` first**. If a recent audit exists for the target, mention it to the user up-front and offer its A/B candidates as a starting menu:

> "I found a recent audit at `<path>` with N A/B candidates. Want me to use them as the round-1 hypotheses? (Y/N) Or describe your own."

This skips the user re-typing what the audit already produced.

> "I'm preparing round 1 for `<profile.name>`. The target prompt is at `<profile.target.prompt_file>` (in `<profile.target.repo>`). Describe your first hypothesis in plain language (e.g. 'tighten the AUTO security keyword bonus from +3 to +2'). I'll generate a unified diff and ask you to confirm before adding it."

For each hypothesis:
1. User describes in plain language
2. You produce a unified diff against `$run_dir/original-baseline.md` and show it
3. User approves / edits / rejects
4. Repeat until 3-5 hypotheses are collected, or user says `go`

Cap at `profile.eval.max_hypotheses_per_round`.

**Persist diffs as separate files, NOT inline in the YAML state.** YAML serialisers fold long strings into `>` block scalars, which corrupts unified diffs (line-wrapping, lost leading whitespace, blank lines inserted) past `git apply`/`patch` recovery.

For each approved hypothesis `Hn`:

```bash
hk_dir="$run_dir/rounds/round-1/hypotheses/H$n"
mkdir -p "$hk_dir"
# Use printf with %s to preserve every byte verbatim (no echo -e quirks).
printf '%s' "$DIFF_CONTENT" > "$hk_dir/variation.diff"
printf '%s' "$DESCRIPTION" > "$hk_dir/description.md"
```

Then persist metadata only into `eval-run.yml.hypotheses_round_1`. Each entry follows this schema:

<run_state_schema>
```yaml
hypotheses_round_1:
  - id: H1
    description: "(short label, single line)"
    diff_path: "rounds/round-1/hypotheses/H1/variation.diff"  # relative to $run_dir
    source: "audit:<basename>" | "generated"                  # provenance for traceability
  - id: H2
    ...
```
</run_state_schema>

If you must hand-write YAML for this (rather than going through `lib/state.ts writeState`), use the `yaml` package with `{ lineWidth: 0 }` to disable folding.

For a complete walked-through example of one round (hypotheses → runs → bracket → decision → report), see [`examples/sample-eval-round.md`](../../examples/sample-eval-round.md).

# Phase 2 — Per Round (loop)

For each round `N` starting at 1:

## 2.1 Prepare baseline clone

```bash
round_dir="$run_dir/rounds/round-$N"
mkdir -p "$round_dir"
baseline_clone="$clones_root/round-$N-baseline"

echo "{\"source\":\"<profile.target.repo>\",\"dest\":\"$baseline_clone\"}" \
  | "$plugin_root/scripts/prompt-eval" clone-shared

# Replace the prompt file inside the clone with the round-N baseline content.
cp "$run_dir/<state.baseline_path>" "$baseline_clone/<profile.target.prompt_file>"

echo "{\"repoPath\":\"$baseline_clone\",\"message\":\"snapshot round-$N baseline\"}" \
  | "$plugin_root/scripts/prompt-eval" commit-all

# Save baseline.md for the round audit trail.
cp "$baseline_clone/<profile.target.prompt_file>" "$round_dir/baseline.md"
```

## 2.2 Prepare hypothesis-base clones (one per hypothesis, in parallel)

For each hypothesis `Hk` in this round, in parallel via background bash:

```bash
hk_base="$clones_root/round-$N-$Hk-base"

echo "{\"source\":\"$baseline_clone\",\"dest\":\"$hk_base\"}" \
  | "$plugin_root/scripts/prompt-eval" clone-shared

# Read the hypothesis diff from the file referenced in eval-run.yml.hypotheses_round_$N[Hk].diff_path.
diff_path="$run_dir/$(yq '.hypotheses_round_'$N'[] | select(.id == "'$Hk'") | .diff_path' "$run_dir/eval-run.yml")"
diff_content=$(cat "$diff_path")
# JSON-escape the diff content for the CLI invocation.
echo "{\"cwd\":\"$hk_base\",\"diff\":$(jq -Rs . <<< "$diff_content")}" \
  | "$plugin_root/scripts/prompt-eval" apply-diff

echo "{\"repoPath\":\"$hk_base\",\"message\":\"apply $Hk\"}" \
  | "$plugin_root/scripts/prompt-eval" commit-all
```

If `apply-diff` fails for any `Hk`, mark that hypothesis as `rejected:patch_failed` in the round state and skip it from runner dispatch.

## 2.3 Prepare run clones (M = runs_per_hypothesis per hypothesis, in parallel)

For each `(Hk, run_index k in 1..M)`:

```bash
run_clone="$clones_root/round-$N-$Hk-run-$k"
echo "{\"source\":\"$clones_root/round-$N-$Hk-base\",\"dest\":\"$run_clone\"}" \
  | "$plugin_root/scripts/prompt-eval" clone-shared
```

## 2.4 Dispatch ALL runner teammates in parallel

This is the visibility-critical step. Use the **Agent tool with multiple parallel tool calls in a single message**, one teammate per `(Hk, k)`.

For each `(Hk, k)`:

- `subagent_type`: `runner`
- `name`: `runner-<Hk>-<k>` (so they're addressable in tmux split)
- `team_name`: `prompt-eval-round-<N>`
- `prompt`: a focused prompt that gives the runner exactly its inputs (see `agents/runner.md` for the contract, and `examples/sample-runner-output.md` for the response shape):

<runner_inputs>
- hypothesis_id, run_index
- clone_path = `$run_clone`
- invoke = `<profile.target.invoke>`
- payload = `<profile.test_input.payload>`
- output_artifact = `<profile.eval.level1_stability.output_artifact>`
- outputs_root = `$round_dir/hypotheses/$Hk/outputs`
- timeout_ms = `600000` (default — 10 min wall-time; covers most slash-commands. Profiles may override per target.)
</runner_inputs>

**Concurrency cap**: dispatch at most `eval.concurrency_per_hypothesis × number_of_qualified_hypotheses` runners simultaneously, but never more than `15` runners total. (Rationale: Claude Code Agent Teams hard cap is 16 members per team — leave 1 slot for the lead itself.) If your N×M exceeds `15`, dispatch in waves: first 15, await, then the remainder.

Wait for all runner teammates to return. Each returns a JSON status (see `agents/runner.md` §Step 8 and the canonical example at `examples/sample-runner-output.md`). Persist these into `$round_dir/hypotheses/$Hk/eval/runs.json`.

After all runners return, increment `state.budget_consumed_usd` by the sum of all returned `usage.cost_usd` and persist via `lib/state.ts addBudget`. **Check budget gate**: if exceeded, finalise the round as-is (no more dispatches in subsequent rounds).

## 2.5 Aggregate L1 + L2 per hypothesis

For each hypothesis `Hk`:

If `≥3` of M runs returned a non-`ok` status, mark `Hk` as `rejected:unreliable`. Skip L1/L2. (Rationale for the `3` threshold: with the default `M=3`, this means "the entire batch failed" — no signal possible. With higher M, a 3-failure floor still preserves enough surviving runs for a meaningful L1.)

Otherwise:

```bash
# L1
echo "{\"runOutputs\":[<each run-k.md content as JSON string>],\"embedding_model\":\"<profile.eval.level1_stability.embedding_model>\",\"threshold\":<threshold>}" \
  | "$plugin_root/scripts/prompt-eval" score-l1 > "$round_dir/hypotheses/$Hk/eval/l1.json"
```

Read `gate` from l1.json. If `fail` → `rejected:unstable`, skip L2.

```bash
# L2 (only if profile.eval.level2_decisions.skip != true)
echo "{\"runOutputs\":[...],\"parser\":\"<parser>\",\"sectionName\":\"<section>\",\"decisionKey\":\"<key>\",\"thresholdPct\":<pct>}" \
  | "$plugin_root/scripts/prompt-eval" score-l2 > "$round_dir/hypotheses/$Hk/eval/l2.json"
```

If `gate==fail` → `rejected:inconsistent`. Else → `qualified`.

Persist `$round_dir/hypotheses/$Hk/eval/status.json` with the final classification, l1, l2, total_usd for that hypothesis.

## 2.6 Pairwise bracket on qualified survivors

If 0 qualified survivors → `decision: rollback`, skip bracket.

Otherwise:

For each side (baseline + each qualified hypothesis), pick the **centroid run** — the run with the median pairwise similarity to its peers (read from L1's `pair_similarities`). For the baseline side, also run the prompt on the baseline clone to get its centroid spec; OR (cheaper) use the baseline-snapshot file and treat all baseline runs as a single representative if you have it cached.

Build participants list `[baseline-centroid, ...qualified-centroids-in-order]`.

Single-elimination bracket: pair adjacent participants, judge them, winner advances. For each match `(a, b)`:

```bash
echo "{\"rubric\":\"<profile.eval.level3_quality.rubric>\",\"specA\":\"<centroid-A-content>\",\"specB\":\"<centroid-B-content>\",\"judge_model\":\"<judge_model>\",\"double_blind\":<bool>}" \
  | "$plugin_root/scripts/prompt-eval" judge
```

Returns `{"verdict":"A"|"B"|"tied"}`. Tied resolves in favour of the participant earlier in the list (baseline is always at index 0, so tied always favours baseline).

Persist `$round_dir/bracket.json` with each match record.

## 2.7 Decide

- If bracket winner is `baseline` → **rollback**. `state.baseline_path` unchanged.
- Else → **adopt**. Update `state.baseline_path` to point at the winning hypothesis's variation file (`$round_dir/hypotheses/<winner>/variation.md` — write that file from the hypothesis-base clone).

Render `$round_dir/round-report.md` using the report renderer:

```bash
bun -e "import('$plugin_root/lib/report.ts').then(m => process.stdout.write(m.renderRoundReport(<RoundData JSON>)))" > "$round_dir/round-report.md"
```

Write `$round_dir/decision.json` capturing the round's outcome.

## 2.8 Cleanup clones for this round

```bash
echo "{\"path\":\"$clones_root/round-$N-baseline\"}" | "$plugin_root/scripts/prompt-eval" remove-clone
for hk in $hypotheses; do
  echo "{\"path\":\"$clones_root/round-$N-$hk-base\"}" | "$plugin_root/scripts/prompt-eval" remove-clone
  for k in $(seq 1 $M); do
    echo "{\"path\":\"$clones_root/round-$N-$hk-run-$k\"}" | "$plugin_root/scripts/prompt-eval" remove-clone
  done
done
```

`$run_dir` (state, outputs, reports) is preserved.

## 2.9 Bump round counter

```bash
bun -e "import('$plugin_root/lib/state.ts').then(m => m.bumpRound('$run_dir'))"
```

## 2.10 Stop criteria check

In order, the first that fires wins:

1. **Convergence** — if the last `2` rounds both ended in `rollback`. (Rationale: a single rollback can be noise; two in a row is a clear plateau signal.)
2. **Budget** — if `state.budget_consumed_usd >= profile.limits.max_budget_usd`
3. **Round cap** — if `state.rounds_completed >= profile.limits.max_rounds`
4. **User stop** (semi-auto only) — explicit user "stop" at the round checkpoint

If any fires:

```bash
bun -e "import('$plugin_root/lib/report.ts').then(m => process.stdout.write(m.renderRoundReport(...))) " > "$run_dir/final-report.md"
# (or a separate final-report renderer if you have one)
```

Present the final report path to the user and return.

## 2.11 Round checkpoint and next-round hypotheses

Whatever the mode, the next-round hypotheses MUST be grounded in `<plugin_root>/references/prompt-best-practices.md`. Same rules as Phase 1.4 (b): one axis per hypothesis, additions preferred, small diffs, cover multiple axes, prefix descriptions with `[Axis N: <name>]`.

When proposing the next round, read the round report first and pick axes that **haven't been explored yet** (or that were explored but the hypothesis was rejected for a fixable reason — e.g. unstable because the diff was too large; retry with a tighter version).

### `mode: semi-auto`

Before dispatching round N+1:

1. Print `$round_dir/round-report.md` to the user
2. Propose 3-5 new hypotheses (one per axis, see best-practices)
3. Ask the user to approve / edit / drop / add. Wait for confirmation
4. Persist into `eval-run.yml.hypotheses_round_$((N+1))`
5. Loop

### `mode: auto`

Skip the checkpoint. Propose 3-5 new hypotheses (still one per axis), record their description + diff_path in `eval-run.yml.hypotheses_round_$((N+1))`, and proceed.

# Notes

- **All teammate dispatches are PARALLEL.** Use multiple Agent tool calls in a single message — that's how Claude Code parallelises them and renders the tmux split.
- **All paths to teammates must be absolute.**
- **Persist after every important step.** Crashes mid-round must leave a resumable state (use `lib/state.ts` `writeState`).
- The CLI subcommands are documented in `lib/cli.ts`. Every CLI invocation reads JSON from stdin and writes JSON to stdout.
- If the user sends Ctrl-C: stop dispatching, but let in-flight runners complete. Persist the partial state. The user can resume from `eval-run.yml` later (resume CLI is post-MVP).
