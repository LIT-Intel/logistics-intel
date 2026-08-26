import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Copy, Mail, MessageSquareText, PhoneCall, Sparkles } from "lucide-react";
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

  // Feature-disabled/not-authorized is intentionally indistinguishable from
  // unavailable here: no empty shell, no autonomous-Harvey information leak.
  if (!loading && !data) return null;

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
    return <div className="mx-4 mt-3 h-24 animate-pulse rounded-2xl border border-indigo-100 bg-indigo-50/50 md:mx-6" />;
  }
  if (!data) return null;
  const contact = data.recommended_contacts[0] ?? null;
  const handoffAction = data.actions.find((a) => a.type === "HAVE_HARVEY_WORK_LEAD");

  return (
    <section className="mx-4 mt-3 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm md:mx-6" aria-label="Harvey freight sales copilot">
      <div className="flex flex-col gap-3 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-sky-50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"><Bot className="h-5 w-5" /></div>
          <div>
            <div className="flex items-center gap-2"><h2 className="text-sm font-bold text-slate-950">Harvey</h2><span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">Freight Sales Copilot</span></div>
            <p className="mt-1 max-w-4xl text-[12.5px] leading-5 text-slate-600">{data.summary}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Opportunity</div><div className="text-sm font-bold text-slate-900">{data.opportunity.score}/100 · {Math.round(data.opportunity.confidence * 100)}% confidence</div></div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Grounded account brief</h3>
          {data.claims.slice(0, 5).map((claim) => (
            <div key={claim.id} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-1 flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold ${claim.kind === "FACT" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{claim.kind}</span><span className="text-[10px] text-slate-400">{Math.round(claim.confidence * 100)}% confidence</span></div>
              <p className="text-[12.5px] leading-5 text-slate-700">{claim.statement}</p>
              <p className="mt-1 text-[10px] text-slate-400">Source: {claim.provenance.map((p) => `${p.source}.${p.field}`).join(", ")}</p>
            </div>
          ))}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-bold text-slate-800">Meeting brief</h3><button onClick={() => copy("brief", [data.meeting_brief.objective, data.meeting_brief.call_opener, ...data.meeting_brief.talking_points].join("\n\n"))} className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700"><Copy className="h-3 w-3" />{copied === "brief" ? "Copied" : "Copy"}</button></div>
            <p className="mt-2 text-[12px] text-slate-700"><strong>Objective:</strong> {data.meeting_brief.objective}</p>
            <p className="mt-2 text-[12px] leading-5 text-slate-600">“{data.meeting_brief.call_opener}”</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 p-3">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><PhoneCall className="h-3.5 w-3.5 text-indigo-500" />Recommended contact</h3>
            {contact ? <><div className="mt-2 text-sm font-semibold text-slate-900">{contact.full_name}</div><div className="text-[11px] text-slate-500">{contact.title || "Role unavailable"} · score {contact.score}</div><p className="mt-2 text-[11px] leading-4 text-slate-500">{contact.reason}</p></> : <p className="mt-2 text-[11px] text-slate-500">No tenant-visible contact yet. Enrich before outreach.</p>}
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><Mail className="h-3.5 w-3.5 text-indigo-500" />Draft email</h3>
            <div className="mt-2 text-[11px] font-semibold text-slate-700">{data.drafts.email.subject}</div>
            <p className="mt-1 whitespace-pre-line text-[11px] leading-4 text-slate-500">{data.drafts.email.body}</p>
            <button onClick={() => copy("email", `Subject: ${data.drafts.email.subject}\n\n${data.drafts.email.body}`)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700"><Copy className="h-3 w-3" />{copied === "email" ? "Copied" : "Copy email"}</button>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><MessageSquareText className="h-3.5 w-3.5 text-indigo-500" />Draft LinkedIn</h3>
            <p className="mt-2 text-[11px] leading-4 text-slate-500">{data.drafts.linkedin.body}</p>
            <button onClick={() => copy("linkedin", data.drafts.linkedin.body)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700"><Copy className="h-3 w-3" />{copied === "linkedin" ? "Copied" : "Copy message"}</button>
          </div>
          {handoffAction?.available && <button type="button" disabled={handoff === "working" || handoff === "done"} onClick={workLead} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-[12px] font-bold text-white hover:bg-indigo-700 disabled:opacity-60">{handoff === "done" ? <Check className="h-4 w-4" /> : <Bot className="h-4 w-4" />}{handoff === "working" ? "Handing off…" : handoff === "done" ? "Harvey has the lead" : handoff === "error" ? "Try handoff again" : "Have Harvey Work This Lead"}</button>}
        </div>
      </div>
    </section>
  );
}
