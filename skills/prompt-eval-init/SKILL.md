---
name: prompt-eval-init
description: Interactive wizard that scaffolds a new prompt-eval profile YAML. Reads the target prompt, auto-detects as many fields as possible (output paths, decision sections, rubric criteria), asks the user to confirm or edit each one, then validates and saves the profile under profiles/. Use when starting a prompt-eval campaign on a new target prompt without writing the YAML by hand.
---

# Activation

Invoked as `/prompt-eval-init <new-profile-name>`. Example:

```
/prompt-eval-init ai-board.compare
```

The `<new-profile-name>` is the filename you'll pass later to `/prompt-eval`. It's used for the YAML's `name` field and the file path under `profiles/<new-profile-name>.yml`.

# Goal

Produce a valid `profiles/<new-profile-name>.yml` in ≤6 user interactions. Auto-detect everything you can from the target prompt; ask only for what you genuinely cannot infer.

For a complete walked-through example of an ideal wizard run (prompt + auto-detection + each user turn + final saved profile), see [`examples/sample-init-wizard.md`](../../examples/sample-init-wizard.md).

# Procedure

## Step 0 — Resolve plugin_root

```bash
plugin_root="$(cd "$(dirname "$(realpath ./skills/prompt-eval-init/SKILL.md)")/../.." && pwd)"
```

You'll save the new profile at `$plugin_root/profiles/<new-profile-name>.yml`.

## Step 1 — Ask for the target prompt path

> "Which prompt file should this profile evaluate? Give me the absolute path (e.g. `/Users/.../some-repo/.claude-plugin/commands/foo.md`)."

Read the file via the Read tool. If the path is invalid, ask again.

Keep the full content in mind — you'll mine it for auto-detection in steps 6, 7, 8.

## Step 2 — Detect `target.repo`

Walk up from the file path looking for the nearest `.git/` directory:

```bash
dir="$(dirname "<absolute-path>")"
while [ "$dir" != "/" ] && [ ! -d "$dir/.git" ]; do dir="$(dirname "$dir")"; done
[ -d "$dir/.git" ] && echo "$dir" || echo "NOT_A_GIT_REPO"
```

If found: confirm with the user. If not: ask them to point you at the repo root manually (the file might be in a non-git workspace, in which case prompt-eval can't run on it).

## Step 3 — Compute and verify `target.prompt_file`

Compute the relative path from the repo root to the prompt file:

```bash
prompt_file="${absolute_path#$repo/}"
```

Then verify the file is **git-tracked** (the symlink gotcha — see `docs/adding-a-target.md`):

```bash
git -C "$repo" ls-files "$prompt_file"
```

If the command prints the path, you're good. If it prints nothing, warn the user:

> "⚠ `<prompt_file>` is not git-tracked — `git clone --shared` won't include it in the eval clones. This often happens when the path goes through an unmerged symlink. Try the canonical (tracked) path. Where is the file actually committed?"

Loop until you get a tracked path.

## Step 4 — Detect `target.invoke`

If the prompt lives at one of these patterns, propose the corresponding slash-command:

<invoke_resolution_table>
| File location | Suggested invoke |
|---|---|
| `<repo>/.claude/commands/<x>.md` | `/<x>` |
| `<repo>/.claude-plugin/commands/<x>.md` | `/<x>` |
| `<repo>/skills/<x>/SKILL.md` | "use the <x> skill" |
</invoke_resolution_table>

Show the suggestion and let the user accept or override. Save as `target.invoke`.

## Step 5 — Ask for `test_input.payload`

> "Give me a representative test input — the argument string the slash-command will receive. For JSON inputs, paste the full JSON literal. This same input is reused across the N runs of every variation, so pick something realistic but not pathological."

Save verbatim into `test_input.payload`. If multi-line (e.g. a JSON literal), use a YAML literal block scalar (`payload: |`).

## Step 6 — Auto-detect `output_artifact`

Mine the prompt content for output path patterns. Look for:

- Backtick-quoted file paths containing `/`, `.md`, `{branch}`, `<branch>`, `$BRANCH`
- Mentions of `writes to`, `creates`, `produces`, `output at`, etc.
- Glob patterns like `specs/<x>/*.md`, `comparisons/<x>.md`

Common shapes:
- `specs/{branch}/spec.md`
- `specs/$BRANCH/comparisons/*.md`
- `<output_dir>/<file>.md`

Normalise: replace `<branch>`, `$BRANCH`, `${BRANCH}` etc. with the literal `{branch}` placeholder that prompt-eval expands at runtime.

Propose **1 to 3 candidates** with quotes from the prompt where they came from. Ask the user to pick one or supply their own. Save as `eval.level1_stability.output_artifact`.

If you cannot find anything plausible, ask the user directly:

> "I couldn't auto-detect where this prompt writes its output. What glob should I evaluate? (use `{branch}` if the prompt creates a new git branch and writes inside a folder named after it)"

## Step 7 — Auto-detect L2 section + decision_key (or skip)

Look for `## <section>` H2 headings in the prompt that suggest a structured decision/output section. Common candidates:

- `## Auto-Resolved Decisions`
- `## Decision Points`
- `## Decisions`
- Any heading named after the prompt's structured output

For each candidate, sample the few lines under it. If you find a pattern like `- **<KEY>**: <value>`, the candidate is the section name and `<KEY>` is the `decision_key`.

Propose the strongest match. Confirm with the user.

If nothing structured is found:

> "This prompt doesn't appear to produce a structured decisions section. I'll skip L2 (decision-consistency scoring) — the cascade will only run L1 stability + L3 quality. OK?"

If yes, set `eval.level2_decisions: { skip: true }`. Otherwise loop on user-provided values.

## Step 8 — Auto-generate `rubric`

**Read `<plugin_root>/references/prompt-best-practices.md` first.** Its "Judge Rubric Default Criteria" section gives the foundation rubric anchored on the nine universal axes (1–7 best practices: Clarity, Directness, Output Guidelines, Process Steps, Specificity, XML Structure, Examples; 8–9 tuning: Robustness, Parameter Tuning).

Then mine the target prompt for sections like `Quality Standards`, `Guidelines`, `For AI Generation`, `Section Requirements` and extract any **target-specific** criteria (e.g. for `ai-board.specify`: "right dosage of [NEEDS CLARIFICATION] markers", "absence of implementation details").

Compose the rubric by combining both layers:

```
Compare two outputs (A and B) generated from the same input by two variations of the source prompt.

# Universal axes (see references/prompt-best-practices.md)
- Clarity:           no vague preamble, no hedge language
- Directness:        instructions and action verbs, not open questions
- Output Guidelines: explicit length / structure / required-element constraints met
- Process Steps:     when the task is multi-faceted, did the steps actually constrain useful work
- Specificity:       concrete bounds rather than generic phrasing
- Structure:         semantic XML tags delimit sections cleanly
- Examples:          if present, wrapped in <sample_input>/<ideal_output> with commentary
- Robustness:        handles edge cases / missing fields / ambiguous input gracefully
- Parameter Tuning:  numeric thresholds and defaults are well-calibrated for this case

# Target-specific (from this prompt's quality standards)
- <criterion 1 extracted from prompt>
- <criterion 2, ...>
- <criterion 3, ...>

Decide: "A" | "B" | "tied". One-line rationale citing the axis or criterion where the winner most clearly beats the loser.
```

Show it to the user. They can accept, edit, or rewrite. Save into `eval.level3_quality.rubric` as a YAML literal block (`rubric: |`).

## Step 9 — Limits + mode (single batched question)

Ask once with sensible defaults pre-filled. Each default is justified:

<default_settings>
| Setting | Default | Rationale |
|---|---|---|
| `runs_per_hypothesis` | `3` | Minimum for a meaningful L1 stability score (≥2 pairs of comparisons) without 5x-ing the cost. |
| `concurrency_per_hypothesis` | `2` | Caps Anthropic API rate-limit pressure. Halves wall-time vs. sequential without saturating the rate limiter. |
| `max_hypotheses_per_round` | `5` | At 3 runs each + 1 baseline that's ≤16 agents per round — fits the Agent Teams hard cap. |
| `max_rounds` | `5` | Convergence usually fires before round 5 in practice; this is a safety stop. |
| `max_budget_usd` | `50` | Roughly 3× the cost of a single 3-hyp/3-run round on a Sonnet-class target. Tighten with `--max-budget` per-run. |
| `mode` | `semi-auto` | Default keeps the user in the loop. `auto` is opt-in for hands-off runs. |
</default_settings>

> "Final settings — accept defaults or override (e.g. `runs=5 mode=auto`):"

Parse their reply, fill the values into the profile.

If `mode == auto`: also confirm budget and rounds are positive (mandatory in auto mode).

## Step 10 — Compose the YAML

The new profile is saved in the user's stable home directory, **not** under `$plugin_root` (which is read-only by convention and gets wiped on plugin updates). Mirror the same `~/.prompt-eval/` layout used for runs, clones, and audits.

```bash
profiles_dir="$HOME/.prompt-eval/profiles"
mkdir -p "$profiles_dir"
output_path="$profiles_dir/<new-profile-name>.yml"
```

Build the profile object in memory:

```ts
{
  name: "<new-profile-name>",
  description: "<auto-generated 1-line description, e.g. 'Evaluate <invoke> against representative input'>",
  target: { repo, prompt_file, invoke },
  test_input: { payload },
  eval: {
    runs_per_hypothesis,
    concurrency_per_hypothesis,
    max_hypotheses_per_round,
    level1_stability: { output_artifact, embedding_model: "mistral-embed", threshold: 0.85 },
    level2_decisions: <skip:true OR { section_name, parser: "structured_list", decision_key, threshold_pct: 95 }>,
    level3_quality: { judge_model: "claude-haiku-4-5", double_blind: true, rubric }
  },
  limits: { max_rounds, max_budget_usd },
  mode,
  initial_hypotheses: []
}
```

Serialise it via:

```bash
bun -e "
const yaml = require('yaml');
const obj = $(cat <<'EOF'
<JSON-encoded profile object>
EOF
);
process.stdout.write(yaml.stringify(obj, { lineWidth: 0 }));
" > "$output_path"
```

The `lineWidth: 0` is critical — without it, the auto-generated rubric (multi-line) gets folded and corrupts.

## Step 11 — Validate with the profile loader

```bash
bun -e "import('$plugin_root/lib/profile-loader.ts').then(m => m.loadProfile('$output_path')).then(p => console.log('OK:', p.name)).catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); })"
```

If validation fails, surface the loader's error to the user verbatim and offer to either:
1. Re-edit the offending field interactively, or
2. Open the YAML in their editor and re-validate after manual changes

## Step 12 — Confirm and next steps

Print:

```
✓ Profile saved at $output_path

Next steps:
  /prompt-eval <new-profile-name>                          # interactive (semi-auto)
  /prompt-eval <new-profile-name> --mode auto              # fully autonomous
  /prompt-eval <new-profile-name> --max-budget 20          # tighter cap

The profile lives in your stable home directory and survives plugin
updates. To re-tune it later, edit the YAML directly. Re-validate with:
  bun -e "import('<plugin_root>/lib/profile-loader.ts').then(m => m.loadProfile('$output_path')).then(p => console.log('OK'))"
```

Return.

# Notes

- All paths shown to the user are absolute.
- If the user gets stuck or wants to abort, accept gracefully — don't insist on completing the wizard.
- Do not silently "fix" obviously wrong inputs. If they paste something unparseable, surface the issue and let them retry.
- Auto-detection is a best effort. When in doubt, ask. Better one extra question than a silently wrong field.
