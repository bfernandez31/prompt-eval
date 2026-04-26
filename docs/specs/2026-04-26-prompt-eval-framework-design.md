# prompt-eval — Design Document

**Date:** 2026-04-26
**Status:** Draft (awaiting user review)
**Owner:** bfernandez31

---

## 1. Overview

`prompt-eval` is a self-improvement framework for prompts (Claude Code commands, skills, agents). Given a target prompt and a set of variations ("hypotheses"), it runs each variation in isolated sandboxes, executes the prompt N times per variation, then evaluates the outputs across three cascading levels and runs a bracket-style pairwise tournament between survivors. The process is iterative: the winner of each round becomes the baseline for the next, until a stop criterion is met.

### 1.1 Goals

- **Industrialise prompt improvement.** Adding a new target prompt = adding a new YAML profile. No code changes.
- **Be honest about cost.** A 3-level evaluation cascade ensures expensive LLM-judge calls only run on hypotheses that already passed cheap mechanical filters.
- **Be honest about subjectivity.** Absolute LLM-judge scores are unstable; we use pairwise comparisons to extract relative rankings.
- **Stay reproducible and auditable.** Every run leaves behind a complete state directory (baselines, variations, outputs, evaluation reports, decisions).
- **Support both interactive and fully-automated runs.** Semi-auto for exploration; auto for fire-and-forget improvement passes within explicit budget bounds.

### 1.2 Non-goals

- Not a benchmark suite for comparing different LLMs or models.
- Not a generic regression-testing tool for prompts (no notion of "ground truth correctness").
- Not optimised for prompts with no auto-resolved decisions section or similar structured output (it can still run, but L2 will be a no-op).

### 1.3 Vocabulary

| Term | Meaning |
|---|---|
| **Target prompt** | The prompt file we want to improve (e.g. `.claude/commands/ai-board.specify.md`). |
| **Hypothesis** | A proposed modification to the target prompt, expressed as a unified diff. Identified by `H1`, `H2`, … |
| **Run** | One execution of a variation against a fixed test input. |
| **Round** | One iteration of the loop: 3-5 hypotheses tested, one winner adopted (or rollback). |
| **Baseline** | The current best version of the prompt at the start of a round. Updated when a hypothesis wins, frozen if all hypotheses lose. |
| **Variation** | The baseline with a hypothesis diff applied. Each hypothesis produces one variation per round. |
| **Profile** | YAML file describing a target prompt and how to evaluate it. Authored once per target. |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ USER (Claude Code session)                                       │
│   1. /prompt-eval <profile-name>                                 │
│   2. Discusses initial hypotheses with the skill                 │
│   3. Skill generates eval-run.yml and dispatches the team        │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ TEAM LEAD : eval-orchestrator (isolated Claude Code instance)    │
│   • Reads eval-run.yml                                           │
│   • Dispatches one teammate per hypothesis                       │
│   • Aggregates teammate reports                                  │
│   • Runs the bracket pairwise tournament across survivors        │
│   • Decides adopt-or-rollback                                    │
│   • Proposes next round (semi-auto pause OR auto direct)         │
│   • Produces the final report                                    │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ one teammate per hypothesis
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ TEAMMATE : hypothesis-evaluator (isolated context per hypothesis)│
│   • Creates clones for its hypothesis                            │
│   • Applies the hypothesis diff                                  │
│   • Spawns sub-agent runs (concurrency capped)                   │
│   • Computes L1 (stability) and L2 (decision consistency)        │
│   • If both pass, declares the variation "qualified"             │
│   • Reports back to lead                                         │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ N parallel sub-agents (Agent tool)
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
       ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
       │ Run sub-agent│  │ Run sub-agent│  │ Judge        │
       │ (one per run)│  │              │  │ sub-agent    │
       │ executes     │  │              │  │ (bracket only│
       │ target prompt│  │              │  │ at lead level│
       │ via headless │  │              │  │ on survivors)│
       │ Claude Code  │  │              │  │              │
       └──────────────┘  └──────────────┘  └──────────────┘
```

### 2.1 Why one team-level (and not nested teams)

Claude Code Agent Teams support 1 lead + 2-15 teammates with isolated context per member, but nested team spawning is not officially supported. The design uses a single team for the parallel-and-context-isolated layer (hypotheses), and falls back to standard `Agent` sub-agents for everything below (runs, judge calls). This respects the documented limit and keeps the topology simple.

### 2.2 Concurrency budget

| Level | Default | Configurable in profile |
|---|---|---|
| Teammates (hypotheses) per round | 5 | `eval.max_hypotheses_per_round` |
| Concurrent runs per teammate | 3 | `eval.concurrency_per_hypothesis` |
| Total concurrent sub-agents (worst case) | 5 × 3 = 15 | derived |

Bracket judge sub-agents run sequentially at the lead level (typically 4-8 calls per round) and are not part of the concurrent budget.

---

## 3. The Evaluation Cascade

Each variation passes through cheap mechanical filters before any LLM-judge call. A variation that fails L1 or L2 never costs a single judge token.

### 3.1 Level 1 — Stability (mechanical, embedding-based)

**Question:** are the N runs of this variation consistent with each other?

- For each pair of run outputs `(i, j)` with `i < j`, compute `cosine_similarity(embedding(i), embedding(j))`.
- Aggregate: `L1 = mean(similarities)`.
- Default embedding model: `mistral-embed` (1024 dims, 8192-token input limit). Configurable.
- If output exceeds 8192 tokens: split by top-level markdown sections, embed each section, take a length-weighted mean of section-pair similarities. Log a warning.
- **Gate:** `L1 >= eval.level1_stability.threshold` (default `0.85`). Otherwise, the variation is `REJECTED:unstable`.

### 3.2 Level 2 — Decision Consistency (mechanical, structured parsing)

**Question:** do the N runs reach the same auto-resolved decisions?

- Parse the configured `section_name` (e.g. `Auto-Resolved Decisions`) in each run output, using the configured `parser` (`structured_list` | `structured_table` | `regex`).
- Each parsed item exposes a `decision_key` field used as identity.
- Let `S_i` be the set of `decision_key` values parsed in run `i`. Compute `L2 = |⋂ S_i| / |⋃ S_i|` (Jaccard intersection-over-union across all N runs). 100% means every run produced exactly the same set of decision keys.
- **Gate:** `L2 >= eval.level2_decisions.threshold_pct` (default `95%`). Otherwise, `REJECTED:inconsistent`.
- If the section is missing from any run: that run is `flaky`. If ≥3 of N runs are flaky, the variation is `REJECTED:unreliable`.

### 3.3 Level 3 — Pairwise Quality (LLM-judge tournament)

**Question:** between qualified variations and the baseline, which produces the most defensible decisions?

- Survivors of L1+L2 enter a single-elimination bracket together with the baseline (always seeded as a participant).
- Each match: pick a single representative output from each side (deterministic: the run with median embedding distance from its peers — the "centroid" run), present both to the judge model with the rubric.
- Judge response is constrained to: `A` | `B` | `tied` + a one-line rationale.
- `tied` resolves in favour of the baseline (preserves the status quo when no clear winner).
- **Double-blind** (default `true`): each match runs twice with A/B order swapped. Majority of two judgments wins. If the two judgments disagree, declared `tied`.
- Bracket count: with 5 survivors + baseline = 6 participants → 5 matches × (2 if double-blind) = 10 judge calls per round.

### 3.4 Why pairwise instead of absolute scores

LLM-judge absolute scores (0-10) drift across calls, sessions and models. Pairwise comparisons are far more stable: the judge does not need to anchor to an absolute scale, only to express a preference. This pattern is well-documented in LLM-evaluation literature (Chatbot Arena, MT-Bench, etc.) and works well even with cheaper judge models (default: `claude-haiku-4-5`).

---

## 4. The Iterative Loop

```
Round 0 setup
  baseline := original target prompt (committed copy)

Round N:
  1. Determine hypotheses for the round
       semi-auto: lead proposes, user validates in chat
       auto:      lead generates and proceeds without pause
       round 1:   uses profile.initial_hypotheses if present,
                  otherwise an interactive "describe your hypotheses" loop
  2. For each hypothesis Hk in parallel:
       teammate creates clones, applies diff, runs N executions,
       computes L1 and L2, reports back
  3. Lead runs bracket pairwise across qualified survivors + baseline
  4. Decide:
       - Winner is a hypothesis     → adopt: baseline := winner
       - Winner is the baseline     → rollback: baseline unchanged
  5. Check stop criteria. If hit → final report. Else → next round.
```

### 4.1 Stop criteria

Combinable. The first that fires wins. The reason is recorded in the final report.

| # | Criterion | Default | Notes |
|---|---|---|---|
| 1 | **Convergence** — baseline did not change for 2 consecutive rounds | enabled | Local-optimum signal |
| 2 | **Budget** — `state.budget_consumed_usd >= limits.max_budget_usd` | profile-required in `auto` mode | Hard ceiling |
| 3 | **Round cap** — `state.rounds_completed >= limits.max_rounds` | profile-required in `auto` mode | Hard ceiling |
| 4 | **User stop** (semi-auto only) | enabled | At each round checkpoint, user can say "stop" |

### 4.2 Rollback semantics

Rollback is implicit: it happens when the baseline wins the bracket. There is no separate "regression detector" — the bracket judge handles regression directly. If a hypothesis is mechanically valid (passes L1 + L2) but produces lower-quality decisions, the judge picks the baseline and the round ends with the baseline unchanged.

If two consecutive rounds end in rollback → convergence stop fires.

---

## 5. Profile Schema

A profile is the **only** thing a user authors per target. Adding a new target = adding a new profile.

### 5.1 Full example: `profiles/ai-board.specify.yml`

```yaml
name: ai-board.specify
description: Evaluate /ai-board.specify on a representative feature

# ═══ TARGET ═══════════════════════════════════════════════════════
target:
  # Source repo. Used as `git clone --shared` source.
  repo: /Users/b.fernandez/Workspace/ai-board

  # The prompt file we mutate. Path relative to `repo`.
  prompt_file: .claude/commands/ai-board.specify.md

  # Slash-command invocation inside the run sub-agent.
  invoke: "/ai-board.specify"

# ═══ TEST INPUT ════════════════════════════════════════════════════
# The same input is used across all N runs of a variation.
# This is what makes "stability" measurable.
test_input:
  payload: |
    {
      "ticketKey": "TEST-001",
      "title": "Add CSV export for user data",
      "description": "Allow users to download their data as CSV from the settings page.",
      "clarificationPolicy": "AUTO"
    }

# ═══ EVALUATION ═══════════════════════════════════════════════════
eval:
  runs_per_hypothesis: 5
  concurrency_per_hypothesis: 3
  max_hypotheses_per_round: 5

  level1_stability:
    output_artifact: "specs/{branch}/spec.md"   # glob; {branch} expanded at runtime
    embedding_model: mistral-embed
    threshold: 0.85

  level2_decisions:
    section_name: "Auto-Resolved Decisions"
    parser: structured_list                     # structured_list | structured_table | regex
    decision_key: "Decision summary"
    threshold_pct: 95

  level3_quality:
    judge_model: claude-haiku-4-5
    double_blind: true
    rubric: |
      Compare two specs (A and B) generated from the same feature description.
      Evaluate on:
      1. Relevance and defensibility of auto-resolved decisions.
      2. Coverage of user scenarios (primary + edge cases).
      3. Testability of functional requirements.
      4. Absence of implementation details (no tech stack, no frameworks).
      5. Right dosage of [NEEDS CLARIFICATION] markers (max 3, only critical).
      Decide: "A" | "B" | "tied". One-line rationale.

# ═══ LIMITS (required when mode == auto) ══════════════════════════
limits:
  max_rounds: 5
  max_budget_usd: 10.0

# ═══ DEFAULT MODE (CLI flag overrides) ════════════════════════════
mode: semi-auto                # semi-auto | auto

# ═══ INITIAL HYPOTHESES (optional) ═════════════════════════════════
# When present, round 1 starts immediately with these.
# When absent, the skill opens an interactive "describe hypotheses" loop.
initial_hypotheses: []
```

### 5.2 Authoring a new target — checklist

To target a new prompt, copy the template and edit only:

1. `target.prompt_file` and `target.invoke`
2. `test_input.payload` (a representative input for that command)
3. `eval.level1_stability.output_artifact` (where the produced file lands)
4. `eval.level2_decisions.section_name` and `decision_key` (the structured section to compare)
5. `eval.level3_quality.rubric` (judging criteria specific to the target)

If the target produces no structured-decision section: set `level2_decisions: { skip: true }`. L2 becomes a no-op and qualification reduces to L1.

---

## 6. Run State and Folder Layout

State is filesystem-first. Every run is fully reconstructable from the run directory after the fact.

### 6.1 State directory

```
~/.prompt-eval/runs/<run-id>/
├── eval-run.yml                       # canonical state (current round, budget, baseline pointer)
├── final-report.md                    # generated on stop
├── original-baseline.md               # frozen copy of the target prompt at run start
└── rounds/
    ├── round-1/
    │   ├── baseline.md                 # baseline at the start of this round
    │   ├── hypotheses/
    │   │   ├── H1/
    │   │   │   ├── description.md      # natural-language description
    │   │   │   ├── variation.diff      # unified diff against baseline
    │   │   │   ├── variation.md        # baseline + diff (materialised for diffing UI)
    │   │   │   ├── outputs/run-1..5.md # raw outputs from the N runs
    │   │   │   ├── eval/
    │   │   │   │   ├── l1.json         # pairwise sims + aggregate
    │   │   │   │   ├── l2.json         # parsed decisions per run + consistency %
    │   │   │   │   └── status.json     # qualified | rejected:<reason>
    │   │   │   └── usage.json          # tokens + cost per run
    │   │   └── H2/...
    │   ├── bracket.json                # match-by-match record
    │   ├── round-report.md             # human-readable summary
    │   └── decision.json               # winner ticket OR rollback
    └── round-2/...
```

### 6.2 Clones (transient)

Two clone tiers per round. Each `git clone --shared` source is given in parentheses.

```
~/.prompt-eval/clones/<run-id>/round-N/
├── baseline/                  # (← target.repo)        snapshot of baseline at round N
├── H1-base/                   # (← baseline)           baseline + H1.diff committed
├── H1-run-1/  ... H1-run-5/   # (← H1-base)            one clone per run, where the target prompt actually executes
├── H2-base/                   # (← baseline)
├── H2-run-1/  ... H2-run-5/
└── ...
```

The two-tier scheme avoids re-applying the diff for every run and keeps the diff-application step auditable in `H_i-base/`.

Cleaned at the end of each round (or on `prompt-eval clean <run-id>` if interrupted). The source repo at `target.repo` is never modified.

### 6.3 Cost tracking

`claude --print --output-format json` returns a `usage` object per invocation. Every sub-agent reports it back, the teammate sums for its hypothesis, the lead sums for the run. Persisted in `eval-run.yml.state.budget_consumed_usd` after every sub-agent return so an interrupted run can resume from a known point.

---

## 7. Execution Model

### 7.1 Per-run sub-agent contract

Each run sub-agent receives:

- absolute path to its dedicated clone
- absolute path to the variation diff (already applied)
- the `test_input.payload`
- the `target.invoke` slash-command
- the expected `output_artifact` glob

It then:

1. Sanity-checks: clone is clean, prompt file contains the variation.
2. Captures the list of local branches before invocation: `before := git branch --format=%(refname:short)`.
3. Runs `claude --print --output-format json "<invoke> <payload>"` inside the clone.
4. Captures local branches after: `after := git branch ...`. Sets `{branch} := first element of (after \ before)`. If the target prompt did not create a branch, `{branch}` falls back to the current `HEAD` branch name and the glob is resolved as-is.
5. Resolves `output_artifact` glob with `{branch}` expanded.
6. Copies the produced file to `…/H_i/outputs/run-<k>.md`.
7. Returns `{ status, file_path, usage, error?, branch_created? }`.

Any non-zero exit, missing artifact, or timeout marks the run as failed (see §8).

### 7.2 Per-hypothesis flow

```
1. Clone baseline → ./H_i-baseline (one-time, before runs)
2. cd H_i-baseline; patch -p1 < variation.diff; git commit -am "apply H_i"
3. For each run k in 1..N (capped at concurrency_per_hypothesis):
     a. git clone --shared ./H_i-baseline ./H_i-run-k
     b. spawn run sub-agent on ./H_i-run-k
4. Wait for all runs to complete.
5. Compute L1 and L2 from outputs/. Persist eval/.
6. Cleanup H_i-* clone directories.
7. Return qualification status to lead.
```

### 7.3 Lead bracket flow

```
1. Collect qualified survivors (variations passing L1 + L2).
2. Seed the bracket: [baseline, qualified_1, qualified_2, ...].
   Random pairing for round-1 of bracket. Single-elimination thereafter.
3. For each match:
     a. Pick centroid run from each side (median-pairwise-similarity run).
     b. Construct judge prompt with rubric + spec A + spec B.
     c. Call judge_model. If double_blind: also call with A/B swapped.
     d. Decide winner per the resolution rules.
4. Output winner = bracket champion. Persist bracket.json and decision.json.
```

---

## 8. Error Handling

| Failure mode | Reaction |
|---|---|
| Diff fails to apply (`patch` exits non-zero) | Hypothesis rejected `patch_failed`. Round continues. |
| Run sub-agent timeout (default 30 min, profile-overridable) | Run marked `timeout`. Other runs continue. |
| Run produces no artifact at the expected glob | Run marked `no_output`. |
| `claude --print` exits non-zero | Run marked `exec_failed`, stderr captured. |
| ≥3 of N runs failed for the same hypothesis | Hypothesis rejected `unreliable`. Skip L1/L2/bracket for it. |
| Embedding API unreachable | Fall back to a Claude sub-agent that estimates pairwise similarity (less rigorous, log warning). |
| Judge call fails | Retry 3× with exponential backoff. After that, match declared `tied` (favours baseline). |
| Budget exceeded mid-round | Current round completes (sunk cost). No subsequent round. Final report flagged `stopped:budget`. |
| User Ctrl-C | State is filesystem-persisted. Resume with `prompt-eval resume <run-id>`. |

---

## 9. Hypothesis Generation

### 9.1 Round 1 — initial hypotheses

If `profile.initial_hypotheses` is non-empty, use it verbatim.

Otherwise, the skill opens an interactive loop in the user's session:

```
User: I want to try reducing NEEDS CLARIFICATION max from 3 to 2.
Skill: Generated diff (preview shown). Approve, edit, or reject?
User: Approve.
Skill: Next hypothesis?
...
```

The user describes hypotheses in natural language; the skill produces unified diffs against the baseline and asks for confirmation. When the user is done, the skill writes them into `eval-run.yml` and dispatches the team.

### 9.2 Round N+1 — after a round completes

**Semi-auto (default).** The team lead, given the round-report, proposes 3-5 new hypotheses with one-line rationale each. Example:

> "Round 1 showed H2 over-resolved security-related ambiguities. I propose:
> - H1: tighten the security keyword bonus from +3 to +2 in AUTO scoring
> - H2: require explicit user confirmation when AUTO confidence < 0.5
> - H3: add a sanity check that flags any auto-decision touching authentication"

The user can approve all, edit any, drop some, or add their own. The lead waits for confirmation before launching the next round.

**Auto.** The lead generates and immediately launches. Proposals and rationales are recorded in `state.json` for post-hoc audit.

---

## 10. Modes

### 10.1 Semi-auto (default)

- Initial hypothesis loop is interactive.
- Between rounds, lead pauses and asks the user to confirm the next batch.
- Soft stop possible at any checkpoint ("stop" stops the loop).
- No mandatory budget/rounds limit (the user can always intervene).

### 10.2 Auto

- No interactive loop; the lead generates initial hypotheses if profile lacks them.
- No checkpoint between rounds.
- Profile **must** declare `limits.max_rounds` and `limits.max_budget_usd` — startup fails otherwise.
- Final report delivered at the end.

CLI:

```
/prompt-eval ai-board.specify                                # semi-auto, profile defaults
/prompt-eval ai-board.specify --mode auto                    # full auto, profile limits required
/prompt-eval ai-board.specify --max-budget 5 --max-rounds 3  # CLI overrides profile
/prompt-eval resume <run-id>                                 # resume an interrupted run
/prompt-eval clean <run-id>                                  # remove clones + state
```

---

## 11. Bootstrap

### 11.1 Repository layout

```
prompt-eval/
├── .claude-plugin/
│   └── plugin.json
├── skills/prompt-eval/
│   └── SKILL.md
├── agents/
│   ├── eval-orchestrator.md
│   └── hypothesis-evaluator.md
├── profiles/
│   └── ai-board.specify.yml         # first profile
├── lib/
│   ├── clone-manager.ts             # git clone --shared lifecycle
│   ├── embedding.ts                 # Mistral client, chunking
│   ├── decision-parser.ts           # structured_list / structured_table / regex
│   ├── bracket.ts                   # tournament logic
│   └── headless-runner.ts           # claude --print orchestration
├── scripts/
│   └── check-prereqs.sh             # bun, gh, claude, MISTRAL_API_KEY, settings.json
├── docs/
│   ├── specs/2026-04-26-prompt-eval-framework-design.md   # this file
│   ├── architecture.md
│   ├── adding-a-target.md
│   └── eval-cascade.md
└── README.md
```

### 11.2 Prerequisites

- Claude Code with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enabled in `settings.json`.
- Bun (for `lib/` utilities).
- `MISTRAL_API_KEY` in the environment.
- `gh` CLI authenticated (only if profile `target.repo` references a remote-only repo — local works without).

### 11.3 Install

```bash
git clone https://github.com/bfernandez31/prompt-eval ~/.claude/plugins/prompt-eval
~/.claude/plugins/prompt-eval/scripts/check-prereqs.sh
# /prompt-eval is now available
```

A future iteration may publish to a Claude Code plugin marketplace; out of scope for the MVP.

---

## 12. Open Questions

1. **Embedding model selection beyond Mistral.** Should the framework auto-test multiple embedding providers (Mistral, Voyage, OpenAI) and pick the most stable for a given prompt family? Out of scope for MVP; revisit after first profiles ship.
2. **Multi-input testing.** Currently one `test_input` per profile. Some prompts (e.g. `compare`) might benefit from rotating across a small input set to catch input-conditional regressions. Could be added as `test_inputs: []` later without breaking the schema.
3. **Cross-run learning.** Could past run reports inform future hypothesis generation? Possible via a knowledge file the lead reads at startup. Out of scope for MVP.
4. **Distributed execution.** Single-machine for MVP. Distributed clones across hosts would be useful only for very long-running prompt families.

---

## 13. Roadmap (post-design)

The implementation plan (produced separately by `superpowers:writing-plans`) will sequence:

1. Plugin scaffolding + skill entry point
2. Profile loader + `eval-run.yml` state machine
3. Clone manager (`git clone --shared` lifecycle, cleanup)
4. Headless runner (`claude --print` orchestration, usage capture)
5. L1 stability evaluator (Mistral embedding client + chunking)
6. L2 decision parser (structured_list as MVP parser)
7. Hypothesis-evaluator agent (frontmatter + dispatch logic)
8. L3 bracket (judge sub-agent + double-blind + tied resolution)
9. Eval-orchestrator agent (round loop + stop criteria + checkpoints)
10. Hypothesis generation (interactive + auto-proposal)
11. Final report generator
12. First end-to-end run on `profiles/ai-board.specify.yml`
13. Documentation pass (`docs/architecture.md`, `docs/adding-a-target.md`, `docs/eval-cascade.md`)
