# Adding a New Target

To target a new prompt (e.g. `ai-board.compare`), create one YAML file under `profiles/` and copy the structure of `profiles/ai-board.specify.yml`. Edit only:

1. `target.prompt_file` and `target.invoke`
2. `test_input.payload` (a representative input for that command)
3. `eval.level1_stability.output_artifact` (where the produced file lands; use `{branch}` if the prompt creates a new branch)
4. `eval.level2_decisions.section_name` and `decision_key`
5. `eval.level3_quality.rubric`

If the target produces no structured-decision section, set `eval.level2_decisions: { skip: true }`.

No code changes required.

## Validating the profile

```bash
bun -e "import('./lib/profile-loader').then(m => m.loadProfile('./profiles/<your-profile>.yml')).then(p => console.log('OK:', p.name))"
```

If validation fails, the loader prints the offending key and file path.
