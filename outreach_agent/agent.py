from __future__ import annotations

import json
import os
from pathlib import Path

from agents import Agent, Runner, trace

from models import AgentResponse, OutreachDecision, OutreachRequest
from policies import assess_human_tone, forbidden_fact_claims, preflight_stop_reason
from tools import check_approval_policy, get_channel_policy

ROOT = Path(__file__).resolve().parent
PROMPT_PATH = ROOT / "docs" / "prompt.md"


def _configure_api_key() -> None:
    # Production already stores the dedicated key as Outreach_agent.
    if not os.getenv("OPENAI_API_KEY") and os.getenv("Outreach_agent"):
        os.environ["OPENAI_API_KEY"] = os.environ["Outreach_agent"]
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("Missing Outreach_agent or OPENAI_API_KEY")


def _instructions() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def build_agent() -> Agent:
    return Agent(
        name="LIT Outreach Agent",
        model=os.getenv("OUTREACH_AGENT_MODEL", "gpt-5.6-luna"),
        instructions=_instructions(),
        tools=[get_channel_policy, check_approval_policy],
        output_type=OutreachDecision,
    )


def _input_payload(request: OutreachRequest, revision_feedback: list[str] | None = None) -> str:
    payload = request.model_dump(mode="json")
    if revision_feedback:
        payload["mandatory_revision_feedback"] = revision_feedback
    return json.dumps(payload, ensure_ascii=False)


async def run_outreach_agent(request: OutreachRequest) -> AgentResponse:
    stop_reason = preflight_stop_reason(request)
    if stop_reason:
        decision = OutreachDecision(
            action="stop",
            channel=request.channel,
            rationale="Outreach policy blocked this request.",
            confidence=1,
            approval_required=True,
            stop_reason=stop_reason,
            compliance_flags=["preflight_stop"],
        )
        return AgentResponse(
            request_id=request.request_id,
            decision=decision,
            tone=assess_human_tone(decision, request),
            revision_count=0,
        )

    _configure_api_key()
    agent = build_agent()
    max_revisions = max(0, min(3, int(os.getenv("OUTREACH_AGENT_MAX_REVISIONS", "2"))))
    feedback: list[str] | None = None
    last_decision: OutreachDecision | None = None

    with trace("lit_outreach_draft", metadata={"request_id": request.request_id, "workspace": request.workspace.value}) as workflow_trace:
        for revision in range(max_revisions + 1):
            result = await Runner.run(agent, _input_payload(request, feedback), max_turns=6)
            decision = result.final_output
            tone = assess_human_tone(decision, request)
            fact_flags = forbidden_fact_claims(decision, request)
            if fact_flags:
                decision.compliance_flags.extend(fact_flags)
            if tone.passed and not fact_flags:
                return AgentResponse(
                    request_id=request.request_id,
                    decision=decision,
                    tone=tone,
                    revision_count=revision,
                    trace_id=getattr(workflow_trace, "trace_id", None),
                )
            last_decision = decision
            feedback = tone.failures + fact_flags + [
                "Rewrite from scratch. Sound like a capable human colleague, not a marketing model."
            ]

    assert last_decision is not None
    final_tone = assess_human_tone(last_decision, request)
    last_decision.action = "escalate"
    last_decision.body = None
    last_decision.subject = None
    last_decision.stop_reason = "Draft failed the mandatory human-tone or factual-grounding gate."
    last_decision.compliance_flags.append("human_review_required")
    return AgentResponse(
        request_id=request.request_id,
        decision=last_decision,
        tone=final_tone,
        revision_count=max_revisions,
        trace_id=getattr(workflow_trace, "trace_id", None),
    )

