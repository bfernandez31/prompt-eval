# prompt-eval

A self-improvement framework for **Claude Code prompts** (slash-commands, skills, agents).

Two ways to improve a prompt:
- **Static analysis** — read the prompt, score it against proven prompt-engineering best practices, list specific weak spots and ranked fixes. Cheap and immediate.
- **Empirical evaluation** — A/B test candidate variations against the current baseline by running them N times each, scoring stability + decision-consistency, and putting the survivors through a pairwise judge bracket. More expensive but rigorous.

This plugin gives you both, plus a wizard so you don't have to write any YAML by hand.

---

## What is a profile?

A **profile** is a small YAML file that describes one prompt you want to evaluate. Think of it as the per-target config: where the prompt lives, how to invoke it, what a representative input looks like, where its output lands, how to grade competing variations.

Profiles can live in two places, resolved in this order:

1. `~/.prompt-eval/profiles/<name>.yml` — your user profiles, persistent across plugin updates. This is where the wizard saves new profiles.
2. `<plugin>/profiles/<name>.yml` — built-in profiles bundled with the plugin (e.g. `ai-board.specify` as a starting example).

A user profile with the same name as a built-in overrides it — useful for forking a bundled example to your own variant without touching the plugin.

Concretely, a profile holds:

```yaml
name: ai-board.specify

target:
  repo: /Users/me/Workspace/ai-board                       # git repo containing the prompt
  prompt_file: .claude-plugin/commands/ai-board.specify.md # path inside the repo
  invoke: "/ai-board.specify"                              # slash-command to call

test_input:
  payload: |                                # representative input passed to the prompt
    {"ticketKey": "TEST-001", "title": "...", ...}

eval:
  runs_per_hypothesis: 3                    # how many times to run each variation
  level1_stability: { ... }                 # embedding model + threshold for run-to-run consistency
  level2_decisions: { ... }                 # which markdown section holds the structured decisions
  level3_quality:
    judge_model: claude-haiku-4-5
    rubric: |                               # the criteria the bracket judge uses
      Compare two outputs (A and B) ...

limits:
  max_rounds: 5
  max_budget_usd: 50
mode: semi-auto                             # semi-auto | auto
```

You write **one profile per prompt to evaluate**. Adding a new target = adding a new YAML file. No code changes, no rebuilds.

The wizard `/prompt-eval-init` generates this file for you in ~6 questions. You'll only edit YAML by hand if you want to tune something later.

---

## Three skills, one pipeline

| Skill | Cost | Purpose |
|---|---|---|
| `/prompt-eval-audit <path>` | `$` | **Static audit** — score the prompt against 9 best-practice axes (6 universal + 3 surface-conditional), produce a dual Core/Contextual score, list quick wins and A/B candidates, no runs |
| `/prompt-eval-init <name>` | `$` | **Wizard** — interactive Q&A that produces a validated `profiles/<name>.yml` |
| `/prompt-eval <name>` | `$$$` | **Empirical eval** — runs hypothesis variations through the cascade (L1 stability → L2 decisions → L3 pairwise bracket) |

Cost legend (relative, depends on prompt size and model choices):
- `$` — pennies. One LLM call (audit) or zero LLM calls + a bit of file IO (init).
- `$$$` — several to a few tens of dollars per round (`runs_per_hypothesis × hypotheses` invocations of the target prompt + a small bracket of judge calls).

The intended workflow runs them in this order:

1. **Audit** — harvest the obvious wins from static analysis. Apply the quick fixes directly.
2. **Init** — scaffold a profile if you don't have one for this prompt yet.
3. **Eval** — A/B-test the genuinely ambiguous changes (the audit's "A/B candidates", or hypotheses you formulate yourself) against the baseline. Adopt the bracket winner, repeat until convergence.

---

## Install

```bash
# 1. Set the Mistral API key (used by the L1 stability evaluator)
export MISTRAL_API_KEY="..."

# 2. Make sure Agent Teams is enabled in ~/.claude/settings.json:
#    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
```

Then in a Claude Code session:

```
/plugin marketplace add bfernandez31/prompt-eval
/plugin install prompt-eval@prompt-eval
```

Restart the session. The three skills (`/prompt-eval-audit`, `/prompt-eval-init`, `/prompt-eval`) are now available.

The plugin ships a bundled `dist/cli.js` with the `yaml` dependency embedded, so no `bun install` is required at use-time. Bun itself must be installed to execute `dist/cli.js`.

---

## Walkthrough

### 1. Audit a prompt — `$`

```
/prompt-eval-audit /Users/me/Workspace/some-repo/.claude-plugin/commands/my-prompt.md
```

You get back, **inline in the chat**:

- A **Core score** (mean of axes 1, 2, 3, 4, 5, 8 — the 6 universal axes) — the headline.
- A **Contextual score** (mean of applicable axes among 6, 7, 9 — surface-conditional) or `N/A` if none apply.
- Score per axis (1-10 or `N/A`) with one-line summaries. `N/A` means the prompt's style doesn't have the surface that axis targets — not a defect.
- Each quick fix: title + scope + change description + diff size.
- Each A/B candidate: title + scope + why it needs empirical testing + expected impact.
- Verbatim quotes from the prompt for any **applicable** axis scoring < 7.

A markdown report with the full unified diffs is also saved under `audits/`. You can apply quick fixes from there with `patch -p1`.

#### Why two scores instead of one?

A naive mean over 9 axes punishes prompt styles that legitimately don't use 3 of them. A clean instruction-pure agent prompt has no interpolated content blocks (axis 6), no generative-ambiguous output (axis 7), and no numeric parameters (axis 9) — those axes don't apply, but a single mean would drag the score down by ~3 points for surfaces the prompt doesn't have.

The Core score covers what every prompt should do regardless of style (clear, direct, bounded output, scaffolded, specific, robust). The Contextual score only counts axes whose surface actually exists. This makes Core comparable across prompt styles, and stops the audit from "fixing" axes that aren't broken.

Axis 3 (Output Guidelines) stays universal but adapts its checklist to the prompt's type — artifact-emitting prompts are scored on length/format/required-elements of the artifact, action agents are scored on no-op rules / summary format / edit granularity / confirmation gates. The actual edits an action agent makes are by nature contextual and can't be format-specified; what *can* be contracted is the agent's meta-behavior. See [`references/prompt-best-practices.md`](references/prompt-best-practices.md) for the full breakdown.

### 2. Bootstrap a profile — `$`

If you don't have a profile for this prompt yet:

```
/prompt-eval-init my-target-name
```

The wizard:
- Asks for the prompt path
- Walks up to find the git repo and verifies the path is git-tracked (catches symlink gotchas)
- Auto-detects the `invoke` pattern from the file location
- Asks for a representative test input
- Mines the prompt for `output_artifact`, the structured-decisions section, and rubric criteria
- Asks for limits + mode (defaults shown, accept with Enter)
- Composes, validates, and saves `profiles/my-target-name.yml`

You can re-edit the YAML at any time — it's just a config file.

### 3. Run an empirical eval — `$$$`

```
/prompt-eval my-target-name                       # semi-auto: checkpoint between rounds
/prompt-eval my-target-name --mode auto           # fully autonomous, runs to convergence/budget cap
/prompt-eval my-target-name --max-budget 20       # tighten the cap on the fly
/prompt-eval my-target-name --runs 3              # cheap pass (fewer runs per hypothesis)
```

The skill becomes the team lead, dispatches one runner teammate per `(hypothesis, run_index)` (visible in the Claude Code Agent Teams tmux split), and runs the cascade:

1. **L1 stability** — Mistral embeddings, mean cosine similarity across the N runs of each variation. Gate: ≥ 0.85.
2. **L2 decision consistency** — parses the configured decisions section in each run, computes Jaccard over decision-key sets. Gate: ≥ 95%.
3. **L3 quality bracket** — pairwise haiku judge (double-blind by default) on survivors + baseline. Tied resolves in favour of baseline.

Adopts the bracket winner if a hypothesis beats the baseline; otherwise rolls back. Loops until convergence (2 rollbacks in a row), budget cap, or round cap.

---

## Architecture

- **Three top-level skills** — every skill is invocable directly. No nested orchestrators.
- **Flat agent topology** — the running skill is the team lead; runners are dispatched directly at the top level. Every parallel runner is visible in the Claude Code Agent Teams tmux split. No nested-team workarounds.
- **Filesystem-first state** — everything the framework generates lives under `~/.prompt-eval/`, never inside the plugin install directory:
  - `~/.prompt-eval/profiles/<name>.yml` — user profiles (overrides built-in profiles of the same name)
  - `~/.prompt-eval/runs/<run-id>/` — eval-run.yml state, per-round reports, decisions
  - `~/.prompt-eval/clones/<run-id>/` — transient `git clone --shared` sandboxes (cleaned per round)
  - `~/.prompt-eval/audits/` — audit reports from `/prompt-eval-audit`
- **Bundled CLI** — pure logic (profile loading, embeddings, scoring, bracket, judge) lives in `lib/`, shipped as `dist/cli.js`. Skills shell out to it via `scripts/prompt-eval`.

### Optional: allowlist `~/.prompt-eval/` to avoid permission prompts

By default Claude Code prompts on every Write/Bash to a path it doesn't recognise. Since the framework writes only under `~/.prompt-eval/`, you can authorise it once for all by adding to your `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Write(~/.prompt-eval/**)",
      "Bash(mkdir -p ~/.prompt-eval/**)",
      "Bash(rm -rf ~/.prompt-eval/**)"
    ]
  }
}
```

Without this, you'll see a permission prompt on each new audit / run (still safe — it just costs a click).

See [`docs/architecture.md`](docs/architecture.md) for the full picture.

---

## Documentation

- [`references/prompt-best-practices.md`](references/prompt-best-practices.md) — the 9 best-practice axes (6 universal + 3 surface-conditional) that drive audit scoring, hypothesis generation, and judge rubrics. Includes the "Applying the axes" section explaining when surface-conditional axes are scored vs N/A. **Single source of truth** for what "good" means.
- [`docs/architecture.md`](docs/architecture.md) — flat skill/runner topology, why we avoid nested teams.
- [`docs/eval-cascade.md`](docs/eval-cascade.md) — what L1/L2/L3 do, gate thresholds, the bracket rules.
- [`docs/adding-a-target.md`](docs/adding-a-target.md) — manual profile authoring (use the wizard first; this doc is the fallback).
- [`docs/specs/2026-04-26-prompt-eval-framework-design.md`](docs/specs/2026-04-26-prompt-eval-framework-design.md) — original design doc.
- [`docs/plans/2026-04-26-prompt-eval-mvp.md`](docs/plans/2026-04-26-prompt-eval-mvp.md) — implementation plan for the MVP.

---

## Contributing / Dev Workflow

```bash
git clone https://github.com/bfernandez31/prompt-eval
cd prompt-eval
bun install              # only needed for development
bun test                 # 45 unit tests
bun run typecheck        # strict TS
bun run build            # rebuild dist/cli.js after editing lib/
```

When you change anything in `lib/`, always rebuild `dist/cli.js` and commit it alongside the source change so end users get the updated logic without needing `bun install`.

---

## Roadmap

- [x] Design doc + implementation plan
- [x] Plugin scaffolding, skill + agent roles, MVP cascade
- [x] L1 stability (Mistral embeddings), L2 decision consistency, L3 pairwise bracket
- [x] Profile schema + wizard (`/prompt-eval-init`)
- [x] Static audit (`/prompt-eval-audit`)
- [x] Best-practice axes baked into hypothesis generation + judge rubric
- [x] Flat agent topology (every runner visible in tmux)
- [x] Streaming runner output (no more watchdog stalls)
- [ ] End-to-end smoke run validated on `ai-board.specify`
- [ ] `--mode auto` exhaustively tested over multiple rounds
- [ ] `prompt-eval resume` / `prompt-eval clean` CLI subcommands
- [ ] Additional ai-board profiles: `compare`, `review`, ...
- [ ] Audit → eval pipeline plumbing (auto-import A/B candidates as `initial_hypotheses`)

---

## Licence

MIT — see [`LICENSE`](LICENSE).
