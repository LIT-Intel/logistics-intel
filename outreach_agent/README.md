# LIT Outreach Agent

An OpenAI Agents SDK service that creates grounded, human-sounding outreach drafts for two isolated LIT workflows:

- customer-facing Campaigns
- internal Lead CRM

The service never sends messages. Every v1 draft remains human-approval gated. Unipile execution is a later server-side integration and must consume only approved drafts.

## Runtime

Production reads the dedicated Supabase secret `Outreach_agent`. Local development may use `OPENAI_API_KEY`. The value must never be exposed to the browser, logs, traces, fixtures, or git.

## Run

```bash
cd outreach_agent
uv sync --extra dev
uv run pytest
uv run python main.py --input data/sample_request.json
```

HTTP mode:

```bash
PORT=8421 uv run python main.py
curl http://127.0.0.1:8421/health
```

## Contract

`POST /v1/draft` accepts `OutreachRequest` and returns `AgentResponse`.

The agent:

1. applies deterministic suppression and identity validation;
2. retrieves channel and approval policy through typed tools;
3. produces a structured decision;
4. grades the draft for AI clichés, pressure, length, evidence, and channel rules;
5. revises a failing draft at most twice;
6. escalates rather than returning copy that fails the human-tone gate.

## Training and improvement

Version 1 uses prompt policy, approved/forbidden examples, deterministic graders, traces, and regression evals. This is intentional. Fine-tuning is not permitted until reviewed production traces and a held-out dataset show a persistent failure that cannot be solved through instructions, tools, or context.

## Files

- `agent.py`: Agents SDK runtime and revision loop
- `models.py`: typed input/output contract
- `policies.py`: deterministic safety and tone gate
- `tools.py`: narrow policy tools; no side effects
- `docs/prompt.md`: versioned runtime instructions
- `data/voice_examples.jsonl`: positive and negative voice examples
- `evals/`: real-path behavior and tone evaluations
- `tests/`: deterministic unit tests


## Architecture diagrams

- `docs/agent-interactions.png`: product and approval boundary
- `docs/agent-sequence.png`: validation, generation, evaluation, and escalation sequence
