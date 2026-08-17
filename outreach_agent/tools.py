from __future__ import annotations

from agents import function_tool


@function_tool
def get_channel_policy(channel: str, requested_action: str) -> str:
    """Return mandatory policy for the requested communication channel."""
    common = (
        "Use only supplied verified facts. Write as one thoughtful person to another. "
        "No hype, fake familiarity, invented pain, guaranteed outcomes, or pressure. "
        "End with one low-friction question. Sending is never performed by this tool."
    )
    if channel == "linkedin_connection":
        return common + " Keep the connection note under 55 words. No pitch and no meeting request."
    if channel == "linkedin_message":
        return common + " Acknowledge prior context when present. Keep it conversational and concise."
    return common + " Use a plain, specific subject and keep the body under 135 words."


@function_tool
def check_approval_policy(
    workspace: str,
    human_approval_required: bool,
    connected_account_ready: bool,
) -> str:
    """Determine whether a generated draft can proceed to an approval queue."""
    if not connected_account_ready:
        return "DRAFT_ONLY: no connected sending account is ready."
    if human_approval_required:
        return "REQUIRES_HUMAN_APPROVAL: save draft; do not send."
    if workspace == "lead_crm":
        return "REQUIRES_HUMAN_APPROVAL: internal one-to-one outreach remains approval-gated."
    return "APPROVED_TEMPLATE_REQUIRED: campaign automation may only use a previously approved template."

