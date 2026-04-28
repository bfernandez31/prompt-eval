# Sample Runner Output

A walked-through example of what one `runner` teammate returns to the team lead via `SendMessage`. Use this as the reference shape for the runner contract.

---

<sample_input>
The team lead dispatches the runner with:

- hypothesis_id: `H1`
- run_index: `2`
- clone_path: `/Users/me/.prompt-eval/clones/20260428-194446-acme.summarise/round-1-H1-run-2`
- invoke: `/acme.summarise`
- payload: `https://en.wikipedia.org/wiki/Solar_panel`
- output_artifact: (none — the prompt prints to stdout, runner captures the headless result instead of a file)
- outputs_root: `/Users/me/.prompt-eval/runs/20260428-194446-acme.summarise/rounds/round-1/hypotheses/H1/outputs`
- timeout_ms: `600000`
</sample_input>

<ideal_output>
After the runner finishes its 8-step procedure, it sends back:

```json
{
  "hypothesis_id": "H1",
  "run_index": 2,
  "status": "ok",
  "file_path": "/Users/me/.prompt-eval/runs/20260428-194446-acme.summarise/rounds/round-1/hypotheses/H1/outputs/run-2.md",
  "branch_created": null,
  "usage": {
    "input_tokens": 4012,
    "output_tokens": 287,
    "cost_usd": 0.018
  },
  "error": null
}
```

If the run had failed (timeout, exec error, no artifact), the shape stays identical but with the relevant status:

```json
{
  "hypothesis_id": "H1",
  "run_index": 2,
  "status": "timeout",
  "file_path": null,
  "branch_created": null,
  "usage": { "input_tokens": 0, "output_tokens": 0, "cost_usd": 0 },
  "error": "claude --print exceeded 600000ms wall-time and was killed"
}
```

This response shape is well-formed because:
- Every field is always present (null when not applicable) — the lead never has to defensively check for missing keys
- `status` is a strict enum (`ok | no_output | exec_failed | timeout`) the lead can switch on
- `usage` is always populated, even on failure (with zeros) so budget aggregation never breaks
- `error` carries actionable context only when status != ok
- Numeric values are JSON numbers, not strings (no implicit string-to-number coercion in the lead)
</ideal_output>
