import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Mail, MessageSquareText, PhoneCall, Sparkles } from "lucide-react";
import { handoffToHarvey, loadHarveyCopilot, type HarveyCopilotData, type HarveyCopilotRequest } from "@/api/harveyCopilot";

type Props = {
  companyId: string | null;
  sourceCompanyKey: string | null;
  companyName: string;
  domain: string | null;
};

export default function HarveyCopilotPanel(props: Props) {
  const request = useMemo<HarveyCopilotRequest>(() => ({
    company_id: props.companyId,
    source_company_key: props.sourceCompanyKey,
    company_name: props.companyName,
    domain: props.domain,
  }), [props.companyId, props.sourceCompanyKey, props.companyName, props.domain]);
  const [data, setData] = useState<HarveyCopilotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<"idle" | "working" | "done" | "error">("idle");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadHarveyCopilot(request).then((next) => {
      if (!alive) return;
      setData(next);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [request]);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1400);
  }

  async function workLead() {
    setHandoff("working");
    try {
      await handoffToHarvey(request);
      setHandoff("done");
    } catch {
      setHandoff("error");
    }
  }

  if (loading) {
    return <div className="m-3 h-28 animate-pulse rounded-xl border border-white/10 bg-white/[0.04]" aria-label="Harvey is reading this company" />;
  }
  if (!data) {
    return <div className="px-4 py-5 text-[11px] leading-5 text-slate-400">Harvey could not build a grounded brief for this company yet.</div>;
  }
  const contact = data.recommended_contacts[0] ?? null;
  const handoffAction = data.actions.find((a) => a.type === "HAVE_HARVEY_WORK_LEAD");

  return (
    <section className="border-b border-white/5 px-3.5 py-3" aria-label="Harvey account intelligence">
      <div className="rounded-xl border border-indigo-400/20 bg-indigo-400/[0.06] p-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11.5px] leading-5 text-slate-200">{data.summary}</p>
          <div className="shrink-0 rounded-lg border border-indigo-300/20 bg-indigo-300/10 px-2 py-1 text-right">
            <div className="flex items-center justify-end gap-1 text-[9px] uppercase tracking-wide text-indigo-200"><Sparkles className="h-3 w-3" />Opportunity</div>
            <div className="text-[12px] font-bold text-white">{data.opportunity.score}/100</div>
            <div className="text-[9px] text-slate-400">{Math.round(data.opportunity.confidence * 100)}% confidence</div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {data.claims.slice(0, 3).map((claim) => (
            <div key={claim.id} className="rounded-lg border border-white/10 bg-slate-950/30 px-2.5 py-2">
              <div className="mb-1 flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[8px] font-extrabold ${claim.kind === "FACT" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{claim.kind}</span>
                <span className="text-[9px] text-slate-500">{Math.round(claim.confidence * 100)}%</span>
              </div>
              <p className="text-[10.5px] leading-4 text-slate-300">{claim.statement}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold text-slate-100"><PhoneCall className="h-3.5 w-3.5 text-indigo-300" />Recommended contact</h3>
        {contact ? <><div className="mt-1.5 text-[12px] font-semibold text-white">{contact.full_name}</div><div className="text-[10px] text-slate-400">{contact.title || "Role unavailable"} · score {contact.score}</div></> : <p className="mt-1.5 text-[10.5px] leading-4 text-slate-400">No tenant-visible contact yet. Enrich before outreach.</p>}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <button type="button" onClick={() => copy("brief", [data.meeting_brief.objective, data.meeting_brief.call_opener, ...data.meeting_brief.talking_points].join("\n\n"))} className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-[10px] font-semibold text-slate-200 hover:bg-white/[0.08]"><PhoneCall className="h-3 w-3" />{copied === "brief" ? "Copied" : "Call brief"}</button>
        <button type="button" onClick={() => copy("email", `Subject: ${data.drafts.email.subject}\n\n${data.drafts.email.body}`)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-[10px] font-semibold text-slate-200 hover:bg-white/[0.08]"><Mail className="h-3 w-3" />{copied === "email" ? "Copied" : "Email"}</button>
        <button type="button" onClick={() => copy("linkedin", data.drafts.linkedin.body)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-[10px] font-semibold text-slate-200 hover:bg-white/[0.08]"><MessageSquareText className="h-3 w-3" />{copied === "linkedin" ? "Copied" : "LinkedIn"}</button>
      </div>

      <details className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
        <summary className="cursor-pointer text-[10.5px] font-semibold text-slate-300">Preview meeting brief and drafts</summary>
        <div className="mt-2 space-y-3 text-[10.5px] leading-4 text-slate-400">
          <div><strong className="text-slate-200">Call opener:</strong> {data.meeting_brief.call_opener}</div>
          <div><strong className="text-slate-200">Email:</strong><div className="mt-1 whitespace-pre-line">{data.drafts.email.body}</div></div>
          <div><strong className="text-slate-200">LinkedIn:</strong><div className="mt-1">{data.drafts.linkedin.body}</div></div>
        </div>
      </details>

      {handoffAction?.available ? <button type="button" disabled={handoff === "working" || handoff === "done"} onClick={workLead} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-3 py-2.5 text-[11px] font-bold text-white hover:bg-indigo-400 disabled:opacity-60">{handoff === "done" ? <Check className="h-4 w-4" /> : <Bot className="h-4 w-4" />}{handoff === "working" ? "Handing off…" : handoff === "done" ? "Harvey has the lead" : handoff === "error" ? "Try handoff again" : "Have Harvey Work This Lead"}</button> : null}
    </section>
  );
}
