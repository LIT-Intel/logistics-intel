# Outreach Agent evaluations

Run the real agent path:

```bash
uv run --extra dev python evals/run_local.py
```

The suite grades workflow behavior, approval state, grounding, channel limits, opt-out handling, escalation, and deterministic human-tone failures. Results are written to `evals/results/latest.json`.

Any production incident involving tone, fabricated context, suppression, duplicate sending, or incorrect next action must become a regression case before the fix is released.

