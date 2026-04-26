---
name: prompt-eval
description: Self-improvement framework for prompts. Pass a profile name to evaluate variations of that target prompt via a 3-level cascade and a bracket pairwise tournament. Use when the user wants to systematically improve a Claude Code command, skill, or agent.
---

# Activation

Invoked as `/prompt-eval <profile-name>` (the profile filename without `.yml`, e.g. `ai-board.specify`).

Optional flags:
- `--mode auto` (overrides the profile's `mode`; requires `limits` set)
- `--max-budget <USD>` (overrides `limits.max_budget_usd`)
- `--max-rounds <N>` (overrides `limits.max_rounds`)

# Procedure

## Step 1: Resolve and load the profile

Profile path: `<plugin_root>/profiles/<profile-name>.yml`. Read the file directly with the Read tool, or via `bun -e` to call `loadProfile` for full validation.

Validate:

- If `mode == auto` (after CLI override): both `limits.max_rounds > 0` and `limits.max_budget_usd > 0` must hold. Otherwise abort with: "auto mode requires positive max_rounds and max_budget_usd in profile.limits".

## Step 2: Initialise run state

- Generate `run_id := <UTC YYYYMMDD-HHMMSS>-<profile.name>` (use `lib/run-id.ts` `generateRunId(profile.name)`).
- `run_dir := ~/.prompt-eval/runs/<run_id>/`.
- `clones_root := ~/.prompt-eval/clones/<run_id>/`.
- Create both directories.
- Copy `<profile.target.repo>/<profile.target.prompt_file>` to `<run_dir>/original-baseline.md` (frozen reference).
- Initialise `eval-run.yml` via `lib/state.ts` `initState(...)` with `current_round: 0`, `baseline_path: original-baseline.md`.

## Step 3: Determine round 1 hypotheses

If `profile.initial_hypotheses` is non-empty: write them into `eval-run.yml.hypotheses_round_1` and proceed.

Otherwise, open an INTERACTIVE LOOP with the user:

> "I'm preparing round 1 for `<profile.name>`. The target prompt is at `<profile.target.prompt_file>` (located in `<profile.target.repo>`). Describe your first hypothesis in plain language (e.g. 'tighten the AUTO-mode security keyword bonus from +3 to +2'). I'll generate a unified diff and ask you to confirm before adding it."

For each hypothesis:

1. User describes in natural language.
2. You produce the unified diff against `original-baseline.md` and show it.
3. User approves / edits / rejects.
4. Repeat until 3-5 hypotheses are collected, or user says "go".

Persist into `eval-run.yml.hypotheses_round_1`.

## Step 4: Dispatch the team

Spawn an `eval-orchestrator` agent (team lead) with one teammate per hypothesis using the Claude Code Agent Teams mechanism. Pass them the absolute paths to `run_dir`, `clones_root`, `profile_path`, and `plugin_root`.

Wait for the lead to complete the round.

## Step 5: Round checkpoint (semi-auto only)

When the lead returns from a round:

- Print the contents of `<run_dir>/rounds/round-<N>/round-report.md` to the user.
- Ask: "Continue with round <N+1>? The lead proposes the following hypotheses: ... (Approve / edit / stop)."
- On approval: dispatch the lead again for round N+1.
- On stop: ask the lead to render the final report and return.

In `--mode auto`: skip the checkpoint, dispatch round N+1 immediately.

## Step 6: Final report

When the lead reports a stop criterion fired (or user said stop), read `<run_dir>/final-report.md` and present it to the user with the path.

# Notes

- All paths shown to the user are absolute.
- On any error from a teammate or the lead, surface the error verbatim — don't paper over.
- Save state aggressively; the run is filesystem-first and must be resumable.
