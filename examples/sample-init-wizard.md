# Sample Wizard Run

A walked-through example of what `/prompt-eval-init` produces interactively. Use this as the reference shape for the ideal wizard flow.

---

<sample_input>
The user runs:

```
/prompt-eval-init acme.summarise
```

with the target prompt at `/Users/me/work/acme/.claude-plugin/commands/acme.summarise.md` (a 25-line summarisation prompt).
</sample_input>

<ideal_output>
```
[Step 1] Which prompt file should this profile evaluate?
> /Users/me/work/acme/.claude-plugin/commands/acme.summarise.md

[Step 2] Detected target.repo: /Users/me/work/acme  (closest .git directory)
         Confirm? (Y/n)
> y

[Step 3] target.prompt_file: .claude-plugin/commands/acme.summarise.md
         git ls-files .claude-plugin/commands/acme.summarise.md → tracked ✓

[Step 4] Detected pattern <repo>/.claude-plugin/commands/<x>.md → invoke = "/acme.summarise"
         Confirm? (Y/n)
> y

[Step 5] Give me a representative test_input.payload (the argument passed after /acme.summarise).
> "https://en.wikipedia.org/wiki/Solar_panel"

[Step 6] Auto-detected output candidates from the prompt:
  - "Output the summary directly." → no file write detected.
         The prompt prints to stdout. I'll set output_artifact to a special marker
         that captures the headless claude --print result instead of a file.
         Confirm? (Y/n)
> y

[Step 7] No structured-decisions section detected (no "## Decisions" / "## Auto-Resolved …").
         I'll set level2_decisions: { skip: true } — the cascade will run L1 stability + L3 quality only.
         Confirm? (Y/n)
> y

[Step 8] Auto-generated rubric (foundation = 9 best-practice axes — 6 universal + 3 surface-conditional, see references/prompt-best-practices.md
         + target-specific extracted from your prompt's wording):

         Compare two summaries (A and B) of the same article.
         # Universal axes …
         # Target-specific
         - Captures the article's central thesis (per the prompt's "main idea" requirement)
         - Stays under the configured word cap
         - Reads naturally as a one-paragraph abstract

         Accept / edit / rewrite?
> accept

[Step 9] Final settings (defaults shown — accept or override):
  runs_per_hypothesis: 3
  concurrency_per_hypothesis: 2
  max_hypotheses_per_round: 5
  max_rounds: 5
  max_budget_usd: 50
  mode: semi-auto
> mode=auto max_budget_usd=20

[Step 10] Composing YAML…
[Step 11] Validated against profile-loader: OK ✓
[Step 12] ✓ Profile saved at /Users/me/.prompt-eval/profiles/acme.summarise.yml

Next steps:
  /prompt-eval acme.summarise              # interactive (overrides mode back to semi-auto)
  /prompt-eval acme.summarise --mode auto  # use the auto mode you set
  /prompt-eval acme.summarise --runs 1     # cheap pass first
```

This example is well-shaped because:
- Each step shows both the auto-detection result AND the user confirmation
- The wizard never asks something it could detect (e.g. invoke pattern) without first showing the suggested value
- Skip-L2 path is an explicit option, not silently dropped
- Final summary lists the next-step commands the user can run
</ideal_output>
