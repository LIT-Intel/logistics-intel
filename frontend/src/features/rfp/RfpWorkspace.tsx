import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Save,
  Ship,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
} from "lucide-react";
import {
  emptyLane,
  emptyPayload,
  rfp,
  type RfpCompany,
  type RfpDetail,
  type RfpLane,
  type RfpPayload,
  type RfpRecord,
  type RfpStatus,
} from "@/api/rfp";
import { quoting, type QuoteLineItem, type QuoteMode } from "@/api/quoting";
import LitSectionCard from "@/components/ui/LitSectionCard";
import QuoteCompanySelector, { type AttachedCompany } from "@/features/quoting/components/QuoteCompanySelector";
import { RfpStatusPill } from "./components/RfpStatusPill";

type Tab = "overview" | "lanes" | "intelligence" | "documents" | "activity";

const STATUS_OPTIONS: Array<{ value: RfpStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "intake", label: "Intake" },
  { value: "pricing", label: "Pricing" },
  { value: "review", label: "Internal review" },
  { value: "submitted", label: "Submitted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const MODE_OPTIONS: QuoteMode[] = ["ocean", "air", "drayage", "ftl", "ltl"];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function RfpWorkspace() {
  const { rfpId } = useParams<{ rfpId: string }>();
  const [searchParams] = useSearchParams();
  const companyIdFromUrl = searchParams.get("company_id");
  const isNew = !rfpId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [record, setRecord] = useState<RfpRecord | null>(null);
  const [company, setCompany] = useState<AttachedCompany | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<RfpStatus>("draft");
  const [dueDate, setDueDate] = useState("");
  const [payload, setPayload] = useState<RfpPayload>(emptyPayload());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const hydratedId = useRef<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["rfp", "detail", rfpId],
    queryFn: () => rfp.detail(rfpId!),
    enabled: Boolean(rfpId),
  });
  const companyContextQuery = useQuery({
    queryKey: ["rfp", "company-context", companyIdFromUrl],
    queryFn: () => rfp.companyContext(companyIdFromUrl!),
    enabled: isNew && Boolean(companyIdFromUrl),
  });

  useEffect(() => {
    const context = companyContextQuery.data?.data;
    if (!context || company) return;
    setCompany(toAttachedCompany(context.company));
    setTitle(`${context.company.name} RFP`);
    if (context.suggested_lanes.length) {
      setPayload((current) => ({
        ...current,
        lanes: context.suggested_lanes.slice(0, 3).map((lane) => ({ ...emptyLane(), ...lane, id: crypto.randomUUID() })),
      }));
    }
  }, [companyContextQuery.data?.data, company]);

  useEffect(() => {
    if (!detailQuery.data?.data || hydratedId.current === rfpId) return;
    const detail = detailQuery.data.data;
    hydratedId.current = rfpId ?? null;
    setRecord(detail.rfp);
    setTitle(detail.rfp.title);
    setStatus(detail.rfp.status);
    setDueDate(detail.rfp.due_date ?? "");
    setPayload(normalizeClientPayload(detail.rfp.payload));
    if (detail.company) setCompany(toAttachedCompany(detail.company));
  }, [detailQuery.data?.data, rfpId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!company?.company_id) throw new Error("Select a company first.");
      if (!title.trim()) throw new Error("Enter an RFP name.");
      return rfp.save({
        rfp_id: record?.id,
        title: title.trim(),
        company_id: company.company_id,
        status,
        due_date: dueDate || undefined,
        payload,
      });
    },
    onSuccess: async (result) => {
      setRecord(result.data.rfp);
      setSavedAt(Date.now());
      setSaveError(null);
      await queryClient.invalidateQueries({ queryKey: ["rfp"] });
      if (!rfpId) navigate(`/app/rfp/${result.data.rfp.id}`, { replace: true });
    },
    onError: (error: Error) => setSaveError(error.message || "Unable to save RFP."),
  });

  const quoteMutation = useMutation({
    mutationFn: async () => {
      let saved = record;
      if (!saved) {
        const result = await saveMutation.mutateAsync();
        saved = result.data.rfp;
      }
      const first = payload.lanes[0];
      if (!first || !company?.company_id) throw new Error("Add at least one lane before creating a quote.");
      const lineItems: QuoteLineItem[] = payload.lanes.map((lane, index) => ({
        name: `${lane.origin || "Origin"} → ${lane.destination || "Destination"}`,
        description: [lane.mode.toUpperCase(), lane.equipment, lane.commodity].filter(Boolean).join(" · "),
        unit: lane.frequency || "shipment",
        quantity: lane.annual_volume || 1,
        unit_cost: lane.buy_rate || 0,
        unit_sell: lane.sell_rate || 0,
        sort_order: index,
      }));
      return quoting.create({
        rfp_id: saved.id,
        company_id: company.company_id,
        mode: first.mode,
        service_type: payload.lanes.length > 1 ? `Multi-lane ${first.mode}` : first.mode,
        origin_city: first.origin,
        destination_city: first.destination,
        equipment_type: first.equipment,
        container_count: first.annual_volume,
        weight_lbs: first.weight_lbs,
        commodity: first.commodity,
        incoterms: first.incoterm,
        valid_until: first.validity_end || dueDate || undefined,
        notes: payload.summary.service_requirements || payload.summary.description,
        line_items: lineItems,
      });
    },
    onSuccess: (result) => navigate(`/app/quoting/${result.data.quote.id}`),
    onError: (error: Error) => setQuoteError(error.message || "Unable to create quote revision."),
  });

  const detail: RfpDetail | null = detailQuery.data?.data ?? null;
  const totals = useMemo(() => computeRfpTotals(payload.lanes), [payload.lanes]);
  const readiness = useMemo(() => {
    const checks = [Boolean(company), Boolean(title.trim()), Boolean(dueDate), payload.lanes.length > 0, payload.lanes.every((lane) => lane.origin && lane.destination), payload.lanes.every((lane) => lane.sell_rate > 0)];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [company, title, dueDate, payload.lanes]);

  if (!isNew && detailQuery.isLoading) return <LoadingState />;
  if (!isNew && detailQuery.isError) return <ErrorState onBack={() => navigate("/app/rfp")} />;

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3">
          <button type="button" onClick={() => navigate("/app/rfp")} className="grid h-9 w-9 place-items-center rounded-[9px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="Back to RFPs"><ArrowLeft className="h-[18px] w-[18px]" /></button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-[18px] font-bold tracking-[-0.3px] text-slate-900">{isNew ? "New RFP" : title || "RFP Workspace"}</h1>
              {record?.rfp_number && <span className="font-mono text-[11.5px] font-semibold text-blue-700">{record.rfp_number}</span>}
              <RfpStatusPill status={status} />
            </div>
            <p className="mt-0.5 truncate text-[12px] text-slate-500">{company?.company_name ? `${company.company_name} · ${payload.lanes.length} lane${payload.lanes.length === 1 ? "" : "s"}` : "Select a saved company to begin"}</p>
          </div>
          <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {savedAt && !saveMutation.isPending && <span className="hidden items-center gap-1.5 text-[12px] text-slate-400 md:inline-flex"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Saved</span>}
            <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="inline-flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 font-display text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:flex-none">{saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Draft</button>
            <button type="button" onClick={() => quoteMutation.mutate()} disabled={quoteMutation.isPending || saveMutation.isPending || !payload.lanes.length} className="inline-flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[10px] px-4 font-display text-[13px] font-semibold text-white hover:brightness-105 disabled:opacity-60 sm:flex-none" style={{ background: "linear-gradient(180deg,#2563eb,#1d4ed8)" }}>{quoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />} Create Quote Revision</button>
          </div>
        </div>
      </div>

      {(saveError || quoteError) && <div className="mx-auto mt-3 max-w-[1440px] px-4 sm:px-6"><div className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{saveError || quoteError}</div></div>}

      <div className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto rounded-[11px] border border-slate-200 bg-white p-1 shadow-sm">
          {([
            ["overview", "Overview", Building2],
            ["lanes", "Lanes & Pricing", FileSpreadsheet],
            ["intelligence", "LIT Intelligence", Sparkles],
            ["documents", "Documents", FolderOpen],
            ["activity", "Activity", Activity],
          ] as Array<[Tab, string, typeof Building2]>).map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)} className={`inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-[8px] px-3 text-[12px] font-semibold transition ${activeTab === key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}><Icon className="h-3.5 w-3.5" /> {label}</button>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 px-4 py-5 pb-20 sm:px-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="min-w-0 space-y-4">
          {activeTab === "overview" && <OverviewTab company={company} title={title} status={status} dueDate={dueDate} payload={payload} onCompany={setCompany} onTitle={setTitle} onStatus={setStatus} onDueDate={setDueDate} onPayload={setPayload} />}
          {activeTab === "lanes" && <LanesTab lanes={payload.lanes} onChange={(lanes) => setPayload((current) => ({ ...current, lanes }))} />}
          {activeTab === "intelligence" && <IntelligenceTab detail={detail} onAddLane={(lane) => { setPayload((current) => ({ ...current, lanes: [...current.lanes, lane] })); setActiveTab("lanes"); }} />}
          {activeTab === "documents" && <DocumentsTab rfpId={record?.id ?? null} detail={detail} onUploaded={() => detailQuery.refetch()} onNeedSave={() => saveMutation.mutate()} />}
          {activeTab === "activity" && <ActivityTab detail={detail} navigate={navigate} />}
        </div>
        <CommercialSummary totals={totals} readiness={readiness} lanes={payload.lanes} quotes={detail?.quotes ?? []} onReviewLanes={() => setActiveTab("lanes")} />
      </div>
    </div>
  );
}

function OverviewTab({ company, title, status, dueDate, payload, onCompany, onTitle, onStatus, onDueDate, onPayload }: {
  company: AttachedCompany | null; title: string; status: RfpStatus; dueDate: string; payload: RfpPayload;
  onCompany: (company: AttachedCompany) => void; onTitle: (value: string) => void; onStatus: (value: RfpStatus) => void; onDueDate: (value: string) => void; onPayload: (value: RfpPayload) => void;
}) {
  const patchSummary = (patch: Partial<RfpPayload["summary"]>) => onPayload({ ...payload, summary: { ...payload.summary, ...patch } });
  return <>
    <LitSectionCard title="Customer & Opportunity" sub="Link the RFP to a Command Center company so LIT can bring shipment intelligence into the workspace.">
      <QuoteCompanySelector company={company} onSelect={onCompany} />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="RFP Name"><input value={title} onChange={(event) => onTitle(event.target.value)} placeholder="2027 North America Transportation Bid" className={input} /></Field>
        <Field label="Status"><select value={status} onChange={(event) => onStatus(event.target.value as RfpStatus)} className={input}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
        <Field label="Customer Contact"><input value={payload.summary.contact_name} onChange={(event) => patchSummary({ contact_name: event.target.value })} placeholder="Name" className={input} /></Field>
        <Field label="Contact Email"><input type="email" value={payload.summary.contact_email} onChange={(event) => patchSummary({ contact_email: event.target.value })} placeholder="name@company.com" className={input} /></Field>
        <Field label="Proposal Due Date"><input type="date" value={dueDate} onChange={(event) => onDueDate(event.target.value)} className={input} /></Field>
        <Field label="Currency"><select value={payload.summary.currency} onChange={(event) => patchSummary({ currency: event.target.value })} className={input}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option></select></Field>
      </div>
    </LitSectionCard>
    <LitSectionCard title="Scope & Requirements">
      <div className="space-y-3">
        <Field label="Opportunity Summary"><textarea rows={3} value={payload.summary.description} onChange={(event) => patchSummary({ description: event.target.value })} placeholder="What is the customer asking LIT's user to solve?" className={textarea} /></Field>
        <Field label="Service Requirements"><textarea rows={5} value={payload.summary.service_requirements} onChange={(event) => patchSummary({ service_requirements: event.target.value })} placeholder="Transit expectations, routing constraints, special handling, service KPIs, customs, warehousing, insurance…" className={textarea} /></Field>
      </div>
    </LitSectionCard>
  </>;
}

function LanesTab({ lanes, onChange }: { lanes: RfpLane[]; onChange: (lanes: RfpLane[]) => void }) {
  const update = (index: number, patch: Partial<RfpLane>) => onChange(lanes.map((lane, i) => i === index ? { ...lane, ...patch } : lane));
  return <LitSectionCard title="Lane Workspace" sub="Price every customer lane in one working surface. Annual value and margin update as you type." padded={false}>
    <div className="overflow-x-auto">
      <table className="min-w-[1420px] w-full border-collapse">
        <thead><tr className="bg-[#FAFBFC]"><LaneTh>#</LaneTh><LaneTh>Origin</LaneTh><LaneTh>Destination</LaneTh><LaneTh>Mode</LaneTh><LaneTh>Equipment</LaneTh><LaneTh>Annual Volume</LaneTh><LaneTh>Commodity</LaneTh><LaneTh>Transit</LaneTh><LaneTh>Buy Rate</LaneTh><LaneTh>Sell Rate</LaneTh><LaneTh>Margin</LaneTh><LaneTh>Valid To</LaneTh><LaneTh /></tr></thead>
        <tbody>{lanes.map((lane, index) => {
          const margin = lane.sell_rate - lane.buy_rate;
          const marginPct = lane.sell_rate > 0 ? (margin / lane.sell_rate) * 100 : 0;
          return <tr key={lane.id} className="border-b border-slate-100 align-top">
            <LaneTd><span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 font-mono text-[11px] font-bold text-slate-600">{index + 1}</span></LaneTd>
            <LaneTd><input value={lane.origin} onChange={(event) => update(index, { origin: event.target.value })} placeholder="Shanghai, CN" className={cellInput} /></LaneTd>
            <LaneTd><input value={lane.destination} onChange={(event) => update(index, { destination: event.target.value })} placeholder="Savannah, GA" className={cellInput} /></LaneTd>
            <LaneTd><select value={lane.mode} onChange={(event) => update(index, { mode: event.target.value as QuoteMode })} className={cellInput}>{MODE_OPTIONS.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select></LaneTd>
            <LaneTd><input value={lane.equipment} onChange={(event) => update(index, { equipment: event.target.value })} placeholder="40HC" className={cellInput} /></LaneTd>
            <LaneTd><input type="number" min="0" value={lane.annual_volume || ""} onChange={(event) => update(index, { annual_volume: toNumber(event.target.value) })} className={cellInput + " font-mono"} /></LaneTd>
            <LaneTd><input value={lane.commodity} onChange={(event) => update(index, { commodity: event.target.value })} placeholder="Consumer goods" className={cellInput} /></LaneTd>
            <LaneTd><input type="number" min="0" value={lane.transit_days || ""} onChange={(event) => update(index, { transit_days: toNumber(event.target.value) })} className={cellInput + " font-mono"} /></LaneTd>
            <LaneTd><input type="number" min="0" value={lane.buy_rate || ""} onChange={(event) => update(index, { buy_rate: toNumber(event.target.value) })} className={cellInput + " font-mono"} /></LaneTd>
            <LaneTd><input type="number" min="0" value={lane.sell_rate || ""} onChange={(event) => update(index, { sell_rate: toNumber(event.target.value) })} className={cellInput + " font-mono"} /></LaneTd>
            <LaneTd><div className={`min-w-[92px] rounded-[8px] px-2 py-2 font-mono text-[11px] font-bold ${margin >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{money.format(margin)}<br /><span className="text-[9.5px] opacity-70">{marginPct.toFixed(1)}%</span></div></LaneTd>
            <LaneTd><input type="date" value={lane.validity_end} onChange={(event) => update(index, { validity_end: event.target.value })} className={cellInput} /></LaneTd>
            <LaneTd><button type="button" disabled={lanes.length === 1} onClick={() => onChange(lanes.filter((_, i) => i !== index))} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></LaneTd>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
      <p className="text-[11.5px] text-slate-500">Rates are per shipment/container. Annual totals use lane volume × rate.</p>
      <button type="button" onClick={() => onChange([...lanes, emptyLane()])} className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-blue-700 hover:bg-blue-100"><Plus className="h-4 w-4" /> Add Lane</button>
    </div>
  </LitSectionCard>;
}

function IntelligenceTab({ detail, onAddLane }: { detail: RfpDetail | null; onAddLane: (lane: RfpLane) => void }) {
  if (!detail?.company) return <EmptyPanel icon={Sparkles} title="Save the RFP to load LIT Intelligence" body="Once the customer is linked, LIT will surface observed shipment lanes and company activity here." />;
  const company = detail.company;
  return <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <IntelKpi label="Shipments 12M" value={formatNumber(company.shipments_12m)} icon={Ship} />
      <IntelKpi label="Estimated TEU" value={formatNumber(company.teu_12m)} icon={BarChart3} />
      <IntelKpi label="Recent Lane Activity" value={formatNumber(detail.intelligence.recent_shipments)} icon={TrendingUp} />
      <IntelKpi label="Latest Shipment" value={formatShortDate(company.most_recent_shipment_date)} icon={CalendarDays} />
    </div>
    <LitSectionCard title="Observed Trade Lanes" sub="These are company intelligence signals, not customer-provided bid lanes. Add only the lanes relevant to this RFP." padded={false}>
      {detail.intelligence.top_lanes.length ? <div className="divide-y divide-slate-100">{detail.intelligence.top_lanes.map((lane, index) => (
        <div key={`${lane.exit_port}-${lane.entry_port}-${index}`} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-cyan-50 text-cyan-700"><Ship className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-slate-900"><span>{lane.exit_port}</span><ArrowRight className="h-3.5 w-3.5 text-slate-400" /><span>{lane.entry_port}</span></div><div className="mt-1 text-[11px] text-slate-500">{lane.shipments.toLocaleString()} shipments · {lane.teu.toLocaleString()} TEU · updated {formatShortDate(lane.updated_at)}</div></div>
          <button type="button" onClick={() => onAddLane({ ...emptyLane(), origin: lane.exit_port, destination: lane.entry_port, mode: "ocean", annual_volume: lane.shipments })} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-slate-200 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" /> Add to RFP</button>
        </div>
      ))}</div> : <div className="px-6 py-12 text-center text-[12.5px] text-slate-500">No observed port-level lanes are available for this company yet.</div>}
    </LitSectionCard>
    <LitSectionCard title="Data Confidence"><div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-[10px] bg-amber-50 text-amber-700"><Sparkles className="h-4 w-4" /></span><p className="text-[12.5px] leading-relaxed text-slate-600">LIT intelligence helps validate opportunity size and likely routes. It does not replace the customer's tender file, carrier confirmation, or final buy-rate approval.</p></div></LitSectionCard>
  </>;
}

function DocumentsTab({ rfpId, detail, onUploaded, onNeedSave }: { rfpId: string | null; detail: RfpDetail | null; onUploaded: () => void; onNeedSave: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file?: File) => {
    if (!file || !rfpId) return;
    setUploading(true); setError(null);
    try { await rfp.uploadDocument(rfpId, file); onUploaded(); }
    catch (err: any) { setError(err?.message ?? "Upload failed."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const openDocument = async (documentId: string) => {
    if (!rfpId) return;
    try { const result = await rfp.documentUrl(rfpId, documentId); window.open(result.data.signed_url, "_blank", "noopener,noreferrer"); }
    catch (err: any) { setError(err?.message ?? "Unable to open document."); }
  };
  if (!rfpId) return <EmptyPanel icon={Save} title="Save this RFP before adding documents" body="The workspace needs an RFP number before files can be stored securely." action="Save RFP" onAction={onNeedSave} />;
  return <LitSectionCard title="RFP Documents" sub="Customer tenders, lane spreadsheets, rate sheets, and supporting files. Maximum 10 MB per file." padded={false}>
    <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-[10px] bg-blue-50 text-blue-700"><FolderOpen className="h-4 w-4" /></span><div><div className="text-[12.5px] font-bold text-slate-900">Private workspace files</div><div className="text-[11px] text-slate-500">PDF, XLS, XLSX, CSV, DOC, DOCX</div></div></div>
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.xls,.xlsx,.csv,.doc,.docx" onChange={(event) => upload(event.target.files?.[0])} />
      <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="inline-flex h-9 items-center justify-center gap-2 rounded-[9px] bg-blue-600 px-3.5 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload File</button>
    </div>
    {error && <div className="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</div>}
    {detail?.documents.length ? <div className="divide-y divide-slate-100">{detail.documents.map((document) => <button type="button" key={document.id} onClick={() => openDocument(document.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"><span className="grid h-9 w-9 place-items-center rounded-[9px] bg-slate-100 text-slate-600"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-semibold text-slate-900">{document.file_name}</span><span className="block text-[10.5px] text-slate-400">{formatBytes(document.size_bytes)} · {formatShortDate(document.created_at)}</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></button>)}</div> : <div className="px-6 py-12 text-center text-[12.5px] text-slate-500">No documents uploaded yet.</div>}
  </LitSectionCard>;
}

function ActivityTab({ detail, navigate }: { detail: RfpDetail | null; navigate: ReturnType<typeof useNavigate> }) {
  if (!detail) return <EmptyPanel icon={Activity} title="Activity starts after the first save" body="LIT will record creation, edits, status changes, uploaded documents, and quote revisions." />;
  return <>
    <LitSectionCard title="Quote Revisions" sub="Each version remains linked to this RFP; the original opportunity is never overwritten." padded={false}>
      {detail.quotes.length ? <div className="divide-y divide-slate-100">{detail.quotes.map((quote) => <button type="button" key={quote.id} onClick={() => navigate(`/app/quoting/${quote.id}`)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"><span className="grid h-9 w-9 place-items-center rounded-[9px] bg-emerald-50 text-emerald-700"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[12.5px] font-bold text-slate-900">Revision {quote.revision_no} · {quote.quote_number}</span><span className="block text-[10.5px] capitalize text-slate-500">{quote.status.replace(/_/g, " ")} · updated {formatShortDate(quote.updated_at)}</span></span><span className="font-mono text-[12px] font-bold text-slate-900">{money.format(quote.total_sell)}</span><ArrowRight className="h-4 w-4 text-slate-400" /></button>)}</div> : <div className="px-6 py-10 text-center text-[12.5px] text-slate-500">No quote revisions yet.</div>}
    </LitSectionCard>
    <LitSectionCard title="Activity Timeline" padded={false}>
      {detail.events.length ? <div className="divide-y divide-slate-100">{detail.events.map((event) => <div key={event.id} className="flex items-start gap-3 px-4 py-3"><span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-blue-700"><Activity className="h-3.5 w-3.5" /></span><div><div className="text-[12px] font-semibold text-slate-800">{eventLabel(event.event_type)}</div><div className="mt-0.5 text-[10.5px] text-slate-400">{formatLongDate(event.created_at)}</div></div></div>)}</div> : <div className="px-6 py-10 text-center text-[12.5px] text-slate-500">No activity recorded yet.</div>}
    </LitSectionCard>
  </>;
}

function CommercialSummary({ totals, readiness, lanes, quotes, onReviewLanes }: { totals: ReturnType<typeof computeRfpTotals>; readiness: number; lanes: RfpLane[]; quotes: RfpDetail["quotes"]; onReviewLanes: () => void }) {
  return <div className="space-y-4 xl:sticky xl:top-[82px] xl:self-start">
    <section className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-3 text-white"><div className="flex items-center gap-2 font-display text-[13px] font-bold"><CircleDollarSign className="h-4 w-4 text-cyan-300" /> Commercial Summary</div></div>
      <div className="space-y-3 p-4">
        <SummaryRow label="Annual buy" value={money.format(totals.annualBuy)} />
        <SummaryRow label="Annual sell" value={money.format(totals.annualSell)} strong />
        <SummaryRow label="Gross profit" value={money.format(totals.grossProfit)} tone={totals.grossProfit >= 0 ? "good" : "bad"} />
        <div className="border-t border-slate-100 pt-3"><div className="flex items-end justify-between"><div><div className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-slate-400">Blended Margin</div><div className={`mt-1 font-mono text-[26px] font-bold ${totals.marginPct >= 15 ? "text-emerald-600" : totals.marginPct > 0 ? "text-amber-600" : "text-slate-400"}`}>{totals.marginPct.toFixed(1)}%</div></div><span className="text-[11px] text-slate-400">{lanes.length} lanes</span></div></div>
        <button type="button" onClick={onReviewLanes} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[9px] border border-slate-200 bg-slate-50 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-100">Review Lane Pricing <ArrowRight className="h-3.5 w-3.5" /></button>
      </div>
    </section>
    <section className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div className="font-display text-[12.5px] font-bold text-slate-900">Proposal Readiness</div><span className="font-mono text-[12px] font-bold text-blue-700">{readiness}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all" style={{ width: `${readiness}%` }} /></div><p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">Complete the customer, due date, lane, and sell-rate fields before submission.</p></section>
    <section className="rounded-[14px] border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50 p-4"><div className="flex items-center gap-2 font-display text-[12.5px] font-bold text-slate-900"><Sparkles className="h-4 w-4 text-cyan-700" /> LIT Advantage</div><p className="mt-2 text-[11.5px] leading-relaxed text-slate-600">Compare the customer's tender with observed shipment activity before committing pricing.</p></section>
    {quotes.length > 0 && <section className="rounded-[14px] border border-emerald-200 bg-emerald-50 p-4"><div className="text-[10px] font-bold uppercase tracking-[0.07em] text-emerald-700">Latest Quote</div><div className="mt-1 text-[13px] font-bold text-emerald-900">Revision {quotes[0].revision_no} · {quotes[0].quote_number}</div><div className="mt-1 font-mono text-[12px] text-emerald-800">{money.format(quotes[0].total_sell)}</div></section>}
  </div>;
}

function SummaryRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "good" | "bad" }) { return <div className="flex items-center justify-between"><span className="text-[11.5px] text-slate-500">{label}</span><span className={`font-mono text-[12px] ${strong ? "font-bold text-slate-900" : "font-semibold"} ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : "text-slate-700"}`}>{value}</span></div>; }
function IntelKpi({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Ship }) { return <div className="rounded-[13px] border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-slate-400">{label}</span><Icon className="h-4 w-4 text-blue-600" /></div><div className="mt-2 font-mono text-[20px] font-bold text-slate-900">{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1.5"><span className="font-display text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">{label}</span>{children}</label>; }
function LaneTh({ children }: { children?: React.ReactNode }) { return <th className="whitespace-nowrap border-b border-slate-100 px-2 py-3 text-left text-[9px] font-bold uppercase tracking-[0.07em] text-slate-400">{children}</th>; }
function LaneTd({ children }: { children: React.ReactNode }) { return <td className="px-2 py-2">{children}</td>; }
function EmptyPanel({ icon: Icon, title, body, action, onAction }: { icon: typeof Sparkles; title: string; body: string; action?: string; onAction?: () => void }) { return <div className="rounded-[14px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span><h3 className="mt-3 font-display text-[14px] font-bold text-slate-900">{title}</h3><p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-slate-500">{body}</p>{action && onAction && <button type="button" onClick={onAction} className="mt-4 inline-flex h-9 items-center rounded-[9px] bg-blue-600 px-3.5 text-[12px] font-semibold text-white hover:bg-blue-700">{action}</button>}</div>; }
function LoadingState() { return <div className="grid min-h-[60vh] place-items-center text-[13px] text-slate-400"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading RFP workspace…</span></div>; }
function ErrorState({ onBack }: { onBack: () => void }) { return <div className="mx-auto max-w-md px-6 py-16 text-center"><div className="font-display text-[15px] font-bold text-slate-900">Couldn't load this RFP</div><p className="mt-1 text-[13px] text-slate-500">It may have been removed or belongs to another workspace.</p><button type="button" onClick={onBack} className="mt-5 h-10 rounded-[10px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">Back to RFPs</button></div>; }

const input = "h-10 w-full rounded-[9px] border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/15";
const textarea = input + " h-auto py-2 leading-relaxed";
const cellInput = "h-9 min-w-[120px] w-full rounded-[8px] border border-slate-200 bg-white px-2.5 text-[11.5px] text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10";

function normalizeClientPayload(value: unknown): RfpPayload {
  const base = emptyPayload();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<RfpPayload>;
  return { version: 2, summary: { ...base.summary, ...(raw.summary ?? {}) }, lanes: Array.isArray(raw.lanes) && raw.lanes.length ? raw.lanes.map((lane) => ({ ...emptyLane(), ...lane, id: lane.id || crypto.randomUUID() })) : base.lanes, output: raw.output ?? {} };
}
function toAttachedCompany(company: RfpCompany): AttachedCompany { return { company_id: company.id, company_name: company.name, domain: company.domain, shipments_12m: company.shipments_12m ?? null, top_routes: company.top_route_12m ? [company.top_route_12m] : null, address: [company.city, company.state, company.country_code].filter(Boolean).join(", ") }; }
function computeRfpTotals(lanes: RfpLane[]) { const annualBuy = lanes.reduce((sum, lane) => sum + (lane.buy_rate || 0) * (lane.annual_volume || 0), 0); const annualSell = lanes.reduce((sum, lane) => sum + (lane.sell_rate || 0) * (lane.annual_volume || 0), 0); const grossProfit = annualSell - annualBuy; return { annualBuy, annualSell, grossProfit, marginPct: annualSell > 0 ? (grossProfit / annualSell) * 100 : 0 }; }
function toNumber(value: string) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function formatNumber(value?: number | null) { return value == null ? "—" : Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function formatShortDate(value?: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function formatLongDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(1)} MB`; }
function eventLabel(value: string) { return ({ created: "RFP created", updated: "RFP updated", status_changed: "Status changed", document_uploaded: "Document uploaded", quote_revision_created: "Quote revision created" } as Record<string, string>)[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase()); }
