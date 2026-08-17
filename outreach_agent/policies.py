from __future__ import annotations

import re

from models import Channel, OutreachDecision, OutreachRequest, ToneAssessment

AI_CLICHES = (
    "i hope this message finds you well",
    "i wanted to reach out",
    "i'm reaching out",
    "in today's fast-paced",
    "unlock",
    "leverage",
    "revolutionize",
    "game-changing",
    "synergy",
    "touch base",
    "circle back",
    "valuable insights",
    "seamless solution",
    "take your business to the next level",
)

PRESSURE_PHRASES = (
    "act now",
    "limited time",
    "don't miss out",
    "last chance",
    "guaranteed",
    "book a demo today",
)


def preflight_stop_reason(request: OutreachRequest) -> str | None:
    if request.suppressed:
        return request.suppression_reason or "Contact is suppressed."
    if request.requested_action == "reply" and not request.history:
        return "A reply cannot be drafted without the inbound message."
    return None


def assess_human_tone(decision: OutreachDecision, request: OutreachRequest) -> ToneAssessment:
    if decision.action != "draft":
        return ToneAssessment(passed=True, score=100)
    text = (decision.body or "").strip()
    lowered = text.lower()
    failures: list[str] = []
    score = 100

    words = re.findall(r"\b[\w'-]+\b", text)
    max_words = 55 if request.channel == Channel.LINKEDIN_CONNECTION else 135
    if len(words) > max_words:
        failures.append(f"too long ({len(words)} words; maximum {max_words})")
        score -= 25
    if len(words) < 12:
        failures.append("too short to sound thoughtful")
        score -= 10

    found_cliches = [phrase for phrase in AI_CLICHES if phrase in lowered]
    if found_cliches:
        failures.append("AI/sales clichés: " + ", ".join(found_cliches))
        score -= min(35, 8 * len(found_cliches))

    found_pressure = [phrase for phrase in PRESSURE_PHRASES if phrase in lowered]
    if found_pressure:
        failures.append("pressure language: " + ", ".join(found_pressure))
        score -= min(35, 10 * len(found_pressure))

    if text.count("!") > 1:
        failures.append("excessive exclamation marks")
        score -= 10
    if request.contact.first_name and request.contact.first_name.lower() not in lowered:
        failures.append("does not address the contact naturally by first name")
        score -= 8
    if not decision.evidence_used and not request.history:
        failures.append("no verified personalization evidence")
        score -= 25
    if request.channel == Channel.EMAIL and not decision.subject:
        failures.append("email has no subject")
        score -= 15
    if request.channel != Channel.EMAIL and decision.subject:
        failures.append("LinkedIn message must not have a subject")
        score -= 10

    return ToneAssessment(passed=not failures and score >= 85, score=max(0, score), failures=failures)


def forbidden_fact_claims(decision: OutreachDecision, request: OutreachRequest) -> list[str]:
    allowed = " ".join(
        request.company.verified_facts
        + request.company.logistics_signals
        + [request.company.name, request.contact.full_name, request.contact.title or ""]
        + [item.body for item in request.history]
    ).lower()
    flags: list[str] = []
    for evidence in decision.evidence_used:
        significant = [w for w in re.findall(r"\b[a-zA-Z]{5,}\b", evidence.fact.lower()) if w not in allowed]
        if len(significant) >= 3:
            flags.append(f"unverified evidence: {evidence.fact}")
    return flags

