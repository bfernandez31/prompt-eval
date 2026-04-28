# Adding a New Target

## Recommended: use the wizard

```
/prompt-eval-init <new-profile-name>
```

The `prompt-eval-init` skill walks you through the profile in ~6 questions, auto-detecting `target.repo`, `target.invoke`, `output_artifact`, the L2 section + decision_key, and a starter rubric from the prompt's content. It saves a validated YAML at `profiles/<name>.yml`.

## Manual authoring

If you'd rather write the YAML by hand: copy the structure of `profiles/ai-board.specify.yml`. Edit only:

1. `target.prompt_file` and `target.invoke`
2. `test_input.payload` (a representative input for that command)
3. `eval.level1_stability.output_artifact` (where the produced file lands; use `{branch}` if the prompt creates a new branch)
4. `eval.level2_decisions.section_name` and `decision_key`
5. `eval.level3_quality.rubric`

If the target produces no structured-decision section, set `eval.level2_decisions: { skip: true }`.

No code changes required.

## Watch out for symlinks in `target.prompt_file`

`prompt-eval` clones the target repo with `git clone --shared`, which means **symlinked directories that aren't tracked by git won't be in the clone**. If your repo exposes its commands under a symlinked path (e.g. `.claude/commands/` symlinking to `.claude-plugin/commands/`), `git ls-files .claude/` returns empty and the symlink target may also be missing or broken in the clone.

**Always set `target.prompt_file` to a path that is genuinely git-tracked.** Verify with:

```bash
git -C <target.repo> ls-files <target.prompt_file>
```

If it prints the path, you're good. If it prints nothing, the file isn't tracked — the clone won't have it, and your hypothesis diffs will fail to apply.

The first profile (`ai-board.specify.yml`) hit this and now points at the canonical `.claude-plugin/commands/` path rather than the symlinked `.claude/commands/`.

## Validating the profile

```bash
bun -e "import('./lib/profile-loader').then(m => m.loadProfile('./profiles/<your-profile>.yml')).then(p => console.log('OK:', p.name))"
```

If validation fails, the loader prints the offending key and file path.
