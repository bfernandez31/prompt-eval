# prompt-eval

A self-improvement framework for prompts (Claude Code commands, skills, agents).

Three skills, one pipeline:

| Skill | Cost | Purpose |
|---|---|---|
| `/prompt-eval-audit` | ~$0.10 | **Static audit** — score a prompt against 7 best-practice axes, list quick wins and A/B candidates |
| `/prompt-eval-init` | $0 | **Wizard** — generate a profile YAML for a new target in ~6 questions, no manual YAML editing |
| `/prompt-eval` | $5–50/round | **Empirical eval** — run hypothesis variations through a 3-level cascade (stability → decision-consistency → pairwise quality bracket) |

Run them in order. Audit first to harvest the obvious wins for free. Init to scaffold a profile. Eval to A/B-test the genuinely ambiguous changes that need empirical validation.

---

## Why this exists

When you write a Claude Code prompt (a slash-command, a skill, an agent), you'll iterate on it dozens of times. Most "improvements" are guesses — you tweak something and hope. This framework gives you two grounded ways to improve:

1. **Static analysis (cheap, immediate).** Compare the prompt against [`references/prompt-best-practices.md`](references/prompt-best-practices.md) — 7 universal axes (Clarity, Directness, Output Guidelines, Process Steps, Specificity, XML Structure, Examples) condensed from Anthropic's prompt-engineering guidance. Many improvements are obvious from inspection: missing length cap, generic phrasings, unwrapped content blocks, no examples. Audit catches those.

2. **Empirical evaluation (more expensive, more rigorous).** For changes where you can't tell whether a tweak helps or hurts (e.g. "should I cap NEEDS CLARIFICATION at 1 instead of 3?"), run an A/B test. Each variation is executed N times, evaluated for stability and decision-consistency, then survivors face off in a pairwise judge bracket. The winning variation becomes your new baseline.

---

## Install

```bash
# 1. Set the Mistral API key (used by the L1 stability evaluator)
export MISTRAL_API_KEY="..."

# 2. Make sure Agent Teams is enabled in ~/.claude/settings.json:
#    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
```

Then, in a Claude Code session:

```
/plugin marketplace add bfernandez31/prompt-eval
/plugin install prompt-eval@prompt-eval
```

Restart the session.

The plugin ships a bundled `dist/cli.js` (the `yaml` dependency is embedded), so no `bun install` is needed at use-time. Bun itself is required at runtime to execute `dist/cli.js`.

---

## Typical workflow

### 1. Audit your prompt (~$0.10, ~30 seconds)

```
/prompt-eval-audit /Users/me/repo/.claude-plugin/commands/my-prompt.md
```

Produces an audit report with:
- Score per axis (1–10)
- Specific findings with verbatim quotes
- Ranked recommendations split into:
  - **Quick fixes** (low-risk, apply directly)
  - **A/B test candidates** (worth empirical validation)
- Unified diffs ready to apply

Apply the quick fixes inline. Save the A/B candidates for step 3.

### 2. Bootstrap a profile (~6 questions)

If you don't already have a profile for this prompt:

```
/prompt-eval-init my-target-name
```

The wizard reads the prompt, auto-detects what it can (target.repo, invoke pattern, output_artifact glob, decision section, rubric anchors), and asks you to confirm or edit. Saves a validated `profiles/my-target-name.yml`.

### 3. Run the evaluation (~$5–50 per round)

```
/prompt-eval my-target-name                       # semi-auto (default — checkpoints between rounds)
/prompt-eval my-target-name --mode auto           # fully autonomous, runs to convergence/budget cap
/prompt-eval my-target-name --max-budget 20       # tighten the cap on the fly
/prompt-eval my-target-name --runs 3              # cheap pass (fewer runs per hypothesis)
```

The skill spawns an Agent Team (1 lead + N runner teammates, each visible in the Claude Code tmux split) and runs the cascade:

1. **L1 stability** — Mistral embeddings, cosine similarity across N runs. Gate: ≥ 0.85.
2. **L2 decision consistency** — structured-list parsing of decisions. Gate: ≥ 95% Jaccard.
3. **L3 quality bracket** — pairwise judging (haiku, double-blind) of survivors + baseline. Tied resolves in favour of the baseline.

Adopts the bracket winner if a hypothesis beats the baseline; otherwise rolls back. Loops until convergence (2 rollbacks in a row), budget cap, or round cap.

---

## Architecture

- **Entry-points**: three Claude Code skills, all top-level.
- **Orchestration**: Claude Code Agent Teams. The skill itself is the team lead — runners are dispatched directly at the top level (no nested teams), so every parallel agent appears in the tmux split.
- **Per-variation runs**: one `runner` teammate per `(hypothesis, run_index)` against an isolated `git clone --shared` sandbox.
- **Profiles**: declarative YAML files describing a target prompt + how to evaluate it. Adding a new target = adding a new profile, no code changes.

See [`docs/architecture.md`](docs/architecture.md) for the full picture.

---

## Documentation

- [`references/prompt-best-practices.md`](references/prompt-best-practices.md) — the 7 axes that drive audit scoring, hypothesis generation, and judge rubrics. Single source of truth.
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

When touching `lib/`, always rebuild `dist/cli.js` and commit it alongside the source change so end users get the updated logic without needing `bun install`.

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
