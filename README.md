# prompt-eval

A self-improvement framework for prompts (Claude Code commands, skills, agents).

Given a target prompt and a set of variations ("hypotheses"), runs each variation in isolated git worktrees, executes the prompt N times per variation, then evaluates the outputs across three cascading levels:

1. **Stability** — are the N runs of the same variation consistent? (embedding similarity, cheap)
2. **Decision consistency** — do the runs reach the same auto-resolved decisions? (structured parsing, free)
3. **Decision quality** — are the decisions defensible? (LLM-judge, only run if 1 & 2 pass)

The cascade short-circuits: a variation that fails stability never pays for the LLM-judge.

## Status

🚧 Early development. Design doc: [`docs/specs/2026-04-26-prompt-eval-framework-design.md`](docs/specs/2026-04-26-prompt-eval-framework-design.md).

## Architecture

- **Entry point**: a Claude Code skill (`/prompt-eval`)
- **Orchestration**: Claude Code Agent Teams (1 lead + N hypothesis-evaluators with isolated context)
- **Per-variation runs**: standard Agent tool sub-agents over git worktrees
- **Profiles**: declarative YAML files describing a target prompt + how to evaluate it. Adding a new target = adding a new profile, no code changes.

## Roadmap

- [ ] Design doc
- [ ] Plugin scaffolding (`.claude-plugin/`, skill, agent roles)
- [ ] First profile: `ai-board.specify.yml`
- [ ] L1 stability evaluator (embeddings)
- [ ] L2 decision consistency parser
- [ ] L3 LLM-judge
- [ ] Worktree lifecycle management
- [ ] Report aggregation
- [ ] Additional profiles: `compare`, `review`, ...
