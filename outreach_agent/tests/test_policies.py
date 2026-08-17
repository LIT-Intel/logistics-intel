from models import Channel, OutreachDecision, OutreachRequest
from policies import assess_human_tone, preflight_stop_reason


def request() -> OutreachRequest:
    return OutreachRequest.model_validate_json(open("data/sample_request.json", encoding="utf-8").read())


def test_ai_cliches_fail_gate() -> None:
    req = request()
    decision = OutreachDecision(
        action="draft",
        channel=Channel.EMAIL,
        subject="Quick idea",
        body="Bill, I hope this message finds you well. We can leverage a game-changing platform to unlock growth. Would you like a demo?",
        rationale="test",
        confidence=0.5,
        evidence_used=[],
    )
    assessment = assess_human_tone(decision, req)
    assert not assessment.passed
    assert any("clich" in failure.lower() for failure in assessment.failures)


def test_suppression_stops_before_model() -> None:
    req = request().model_copy(update={"suppressed": True, "suppression_reason": "unsubscribed"})
    assert preflight_stop_reason(req) == "unsubscribed"


def test_grounded_plain_message_passes() -> None:
    req = request()
    decision = OutreachDecision(
        action="draft",
        channel=Channel.EMAIL,
        subject="Shipper account research",
        body="Bill — your sales role at CV International puts you close to account selection. We’re working on a simpler way to identify active shippers before a rep spends time researching contacts. Is prospect prioritization something your team is trying to improve?",
        rationale="Relevant to the contact's role.",
        confidence=0.82,
        evidence_used=[{"fact": "Bill leads business development and sales.", "source": "contact"}],
    )
    assessment = assess_human_tone(decision, req)
    assert assessment.passed, assessment.failures

