from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator


class Workspace(str, Enum):
    CAMPAIGNS = "campaigns"
    LEAD_CRM = "lead_crm"


class Channel(str, Enum):
    EMAIL = "email"
    LINKEDIN_CONNECTION = "linkedin_connection"
    LINKEDIN_MESSAGE = "linkedin_message"


class CompanyContext(BaseModel):
    id: str
    name: str
    website: HttpUrl | None = None
    industry: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    employee_count: int | None = None
    logistics_signals: list[str] = Field(default_factory=list)
    verified_facts: list[str] = Field(default_factory=list)


class ContactContext(BaseModel):
    id: str
    full_name: str
    first_name: str | None = None
    title: str | None = None
    email: str | None = None
    linkedin_url: HttpUrl | None = None
    location: str | None = None
    tags: list[str] = Field(default_factory=list)


class CampaignContext(BaseModel):
    id: str | None = None
    name: str | None = None
    objective: str
    offer: str | None = None
    persona: str | None = None
    call_to_action: str | None = None
    sequence_step: int = Field(default=1, ge=1)
    total_steps: int = Field(default=1, ge=1)
    sender_name: str | None = None
    sender_role: str | None = None
    sender_company: str = "Logistics Intel"


class HistoryItem(BaseModel):
    direction: Literal["inbound", "outbound"]
    channel: Channel
    body: str
    occurred_at: str | None = None


class OutreachRequest(BaseModel):
    request_id: str
    workspace: Workspace
    channel: Channel
    company: CompanyContext
    contact: ContactContext
    campaign: CampaignContext
    history: list[HistoryItem] = Field(default_factory=list)
    requested_action: Literal["draft", "reply", "follow_up"] = "draft"
    human_approval_required: bool = True
    suppressed: bool = False
    suppression_reason: str | None = None
    connected_account_ready: bool = False

    @model_validator(mode="after")
    def validate_channel_identity(self) -> "OutreachRequest":
        if self.channel == Channel.EMAIL and not self.contact.email:
            raise ValueError("email channel requires contact.email")
        if self.channel != Channel.EMAIL and not self.contact.linkedin_url:
            raise ValueError("LinkedIn channels require contact.linkedin_url")
        return self


class Evidence(BaseModel):
    fact: str
    source: Literal["company", "contact", "campaign", "history"]


class OutreachDecision(BaseModel):
    action: Literal["draft", "stop", "escalate"]
    channel: Channel
    subject: str | None = None
    body: str | None = None
    rationale: str
    evidence_used: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    approval_required: bool = True
    next_step: str | None = None
    stop_reason: str | None = None
    compliance_flags: list[str] = Field(default_factory=list)


class ToneAssessment(BaseModel):
    passed: bool
    score: int = Field(ge=0, le=100)
    failures: list[str] = Field(default_factory=list)


class AgentResponse(BaseModel):
    request_id: str
    decision: OutreachDecision
    tone: ToneAssessment
    revision_count: int
    trace_id: str | None = None


class LeadQualificationRequest(BaseModel):
    request_id: str
    provider: Literal["apollo"] = "apollo"
    provider_company_id: str
    company_name: str
    domain: str | None = None
    website: HttpUrl | None = None
    linkedin_url: HttpUrl | None = None
    industry: str | None = None
    location: str | None = None
    target_types: list[Literal["freight_broker", "freight_forwarder"]] = Field(
        default_factory=lambda: ["freight_broker", "freight_forwarder"]
    )


class QualificationEvidence(BaseModel):
    title: str
    url: HttpUrl
    finding: str


class LeadQualificationDecision(BaseModel):
    status: Literal["qualified", "disqualified", "review"]
    company_type: Literal[
        "freight_broker",
        "freight_forwarder",
        "freight_broker_and_forwarder",
        "other_logistics",
        "non_target",
        "unknown",
    ]
    confidence: float = Field(ge=0, le=1)
    verified_domain: str | None = None
    reason: str
    positive_signals: list[str] = Field(default_factory=list)
    exclusion_signals: list[str] = Field(default_factory=list)
    evidence: list[QualificationEvidence] = Field(default_factory=list)
    safe_to_enrich: bool = False

    @model_validator(mode="after")
    def enforce_enrichment_gate(self) -> "LeadQualificationDecision":
        self.safe_to_enrich = self.status == "qualified" and self.confidence >= 0.75
        return self
