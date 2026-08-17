from __future__ import annotations

import re

from models import AgentResponse


def grade_response(response: AgentResponse, expected: dict) -> list[str]:
    failures: list[str] = []
    decision = response.decision
    action = expected.get("action")
    if action and decision.action != action:
        failures.append(f"expected action={action}, got {decision.action}")
    if expected.get("action") == "draft_or_escalate" and decision.action not in {"draft", "escalate"}:
        failures.append(f"expected draft or escalate, got {decision.action}")
    if "approval_required" in expected and decision.approval_required != expected["approval_required"]:
        failures.append("approval gate mismatch")
    if "tone_min" in expected and response.tone.score < expected["tone_min"]:
        failures.append(f"tone score {response.tone.score} below {expected['tone_min']}")
    text = f"{decision.subject or ''} {decision.body or ''}".strip()
    for phrase in expected.get("forbidden", []):
        if phrase.lower() in text.lower():
            failures.append(f"forbidden phrase present: {phrase}")
    if expected.get("subject", "__missing__") is None and decision.subject is not None:
        failures.append("subject must be null")
    if expected.get("max_words") and len(re.findall(r"\b[\w'-]+\b", decision.body or "")) > expected["max_words"]:
        failures.append("message exceeds word limit")
    if expected.get("max_questions") is not None and (decision.body or "").count("?") > expected["max_questions"]:
        failures.append("too many questions")
    if expected.get("stop_contains") and expected["stop_contains"].lower() not in (decision.stop_reason or "").lower():
        failures.append("stop reason mismatch")
    return failures

