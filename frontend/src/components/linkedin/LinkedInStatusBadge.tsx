import React from "react";
import { CheckCircle2, Clock3, Linkedin, MessageCircle, Send, XCircle } from "lucide-react";

type ActionLike = {
  action_type?: string | null;
  status?: string | null;
  provider_event_id?: string | null;
  provider_chat_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function linkedInContactState(action?: ActionLike | null) {
  if (!action) return { key: "not_started", label: "Not contacted", help: "Create a LinkedIn draft when you're ready.", Icon: Linkedin, cls: "bg-slate-100 text-slate-600" };
  const status = action.status || "not_started";
  const connected = action.metadata?.relationship_status === "connected" || status === "replied" || (action.action_type === "message" && status === "sent");
  if (status === "failed") return { key: "failed", label: "Not sent", help: "This attempt failed. Review the reason before trying again.", Icon: XCircle, cls: "bg-rose-50 text-rose-700" };
  if (status === "cancelled") return { key: "cancelled", label: "Cancelled", help: "This action will not be sent.", Icon: XCircle, cls: "bg-slate-100 text-slate-600" };
  if (status === "pending_approval") return { key: "pending_approval", label: "Draft · approval needed", help: "Review the exact text before anything is sent.", Icon: Clock3, cls: "bg-amber-50 text-amber-700" };
  if (status === "approved" || status === "sending") return { key: "sending", label: "Sending", help: "The approved action is being submitted to LinkedIn.", Icon: Send, cls: "bg-blue-50 text-blue-700" };
  if (status === "replied") return { key: "replied", label: "Replied · connected", help: "The contact replied on LinkedIn.", Icon: MessageCircle, cls: "bg-emerald-50 text-emerald-700" };
  if (connected) return { key: "connected", label: "Connected on LinkedIn", help: "You can send this contact a LinkedIn message.", Icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700" };
  if (status === "sent" && action.action_type === "invite") return { key: "invite_pending", label: "Invitation pending", help: "LinkedIn accepted the invitation. Wait for the contact to accept before messaging.", Icon: Clock3, cls: "bg-sky-50 text-[#0A66C2]" };
  if (status === "sent") return { key: "message_sent", label: "Message sent", help: "LinkedIn accepted the message. Replies will appear in Communication Center.", Icon: CheckCircle2, cls: "bg-blue-50 text-blue-700" };
  return { key: status, label: status.replaceAll("_", " "), help: "LinkedIn activity status.", Icon: Linkedin, cls: "bg-slate-100 text-slate-600" };
}

export function LinkedInStatusBadge({ action, compact = false }: { action?: ActionLike | null; compact?: boolean }) {
  const state = linkedInContactState(action);
  const Icon = state.Icon;
  return <span title={state.help} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${compact ? "text-[10px]" : "text-[11px]"} ${state.cls}`}><Icon className="h-3 w-3" />{state.label}</span>;
}

export function LinkedInSenderBadge({ connected }: { connected: boolean }) {
  return <span title={connected ? "Your LinkedIn sender account is connected and available." : "Connect a LinkedIn sender account in Settings before sending."} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><Linkedin className="h-3 w-3" />{connected ? "LinkedIn sender connected" : "Connect LinkedIn sender"}</span>;
}
