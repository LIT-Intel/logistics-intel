/**
 * SharedLanesViewer — public read-only trade-lanes portal at `/s/:token`
 * (design handoff #2 §4.6, `Trade Lanes Map.dc.html` viewer top-bar block).
 *
 * No auth: the `share-map` edge function's `view` action validates the token
 * server-side and returns an ALREADY-REDACTED payload (excluded fields are
 * never sent). The `include` flags it returns only drive the UI redaction
 * affordances ("Hidden", removed sections) in TradeLanesOpenView.
 */
import React from "react";
import { useParams } from "react-router-dom";
import { ArrowUpRight, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { assembleDataset } from "@/features/company-profile/data/rollups";
import type {
  LaneMonthDbRow,
  TsMonthlyDbRow,
} from "@/features/company-profile/data/rollups";
import type { UnifiedShipmentDbRow } from "@/features/company-profile/data/normalizeShipments";
import { TradeLanesOpenView } from "@/features/company-profile/components/overview/TradeLanesOpenView";
import { FONT_BODY, FONT_DISPLAY } from "@/features/company-profile/components/ui";

// ---------------------------------------------------------------- types

interface ViewPayload {
  ok: true;
  company: { name: string; key: string };
  shared_by?: string | null;
  expires_at?: string | null;
  include?: { spend: boolean; bols: boolean; suppliers: boolean; carriers: boolean };
  initial_state?: { period?: unknown; metric?: string; lane?: string | null } | null;
  /** UnifiedShipmentDbRow-shaped, but `id` may be absent on redacted payloads. */
  bols?: (Omit<UnifiedShipmentDbRow, "id"> & { id?: string | null })[];
  tsMonths?: TsMonthlyDbRow[];
  laneMonths?: LaneMonthDbRow[];
}

type ErrorKind = "expired" | "invalid";
type State =
  | { status: "loading" }
  | { status: "error"; kind: ErrorKind }
  | { status: "ready"; payload: ViewPayload };

// ---------------------------------------------------------------- pieces

function ErrorCard({ kind }: { kind: ErrorKind }) {
  return (
    <div
      className="fixed inset-0 grid place-items-center px-4"
      style={{ background: "#020617", fontFamily: FONT_BODY }}
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border px-8 py-10 text-center"
        style={{
          background: "rgba(2,6,23,0.72)",
          borderColor: "rgba(255,255,255,0.08)",
          boxShadow: "0 30px 60px rgba(2,6,23,0.45)",
        }}
      >
        <div
          style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, letterSpacing: "-0.01em", color: "#f8fafc" }}
        >
          {kind === "expired" ? "This link has expired" : "This link is invalid"}
        </div>
        <div className="mt-2 text-[14px] text-[#94a3b8]">Ask the sender for a fresh link.</div>
        <a
          href="https://logisticintel.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-[10px] px-5 text-white no-underline active:scale-[.97] motion-reduce:active:scale-100"
          style={{
            fontFamily: FONT_BODY,
            fontWeight: 600,
            fontSize: 13,
            background: "#3b82f6",
            boxShadow: "0 0 18px rgba(59,130,246,0.5)",
          }}
        >
          Explore with LIT
          <ArrowUpRight size={15} />
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function SharedLanesViewer() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = React.useState<State>({ status: "loading" });

  // noindex — public tokenized page must never be crawled
  React.useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex";
    document.head.appendChild(m);
    return () => {
      document.head.removeChild(m);
    };
  }, []);

  React.useEffect(() => {
    if (!token) {
      setState({ status: "error", kind: "invalid" });
      return;
    }
    let alive = true;
    (async () => {
      const asError = (code: unknown, httpStatus?: number): State => ({
        status: "error",
        kind: code === "expired" || httpStatus === 410 ? "expired" : "invalid",
      });
      try {
        const { data, error } = await supabase.functions.invoke("share-map", {
          body: { action: "view", token },
        });
        if (!alive) return;
        if (error) {
          // FunctionsHttpError: the JSON body ({ ok:false, error }) sits on .context
          let code: unknown = null;
          let httpStatus: number | undefined;
          const ctx = (error as { context?: { status?: number; json?: () => Promise<unknown> } }).context;
          httpStatus = ctx?.status;
          try {
            if (ctx && typeof ctx.json === "function") {
              const j = (await ctx.json()) as { error?: unknown } | null;
              code = j?.error ?? null;
            }
          } catch {
            /* non-JSON error body */
          }
          if (alive) setState(asError(code, httpStatus));
          return;
        }
        const d = data as (ViewPayload & { ok: boolean; error?: unknown }) | null;
        if (!d || d.ok === false) {
          setState(asError(d?.error));
          return;
        }
        setState({ status: "ready", payload: d });
      } catch {
        if (alive) setState({ status: "error", kind: "invalid" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  // ---- dataset assembly (client-side, same pipeline as the app) ----------
  const dataset = React.useMemo(() => {
    if (state.status !== "ready") return null;
    const p = state.payload;
    const bolRows: UnifiedShipmentDbRow[] = (p.bols ?? []).map((r) => ({
      ...r,
      id: String(r.id ?? r.bol_number ?? ""),
    }));
    return assembleDataset(
      { bolRows, tsRows: p.tsMonths ?? [], laneRows: p.laneMonths ?? [] },
      null,
    );
  }, [state]);

  // ---- states -------------------------------------------------------------
  if (state.status === "loading") {
    return (
      <div className="fixed inset-0 grid place-items-center" style={{ background: "#020617" }}>
        <style>{"@keyframes litShareSpin{to{transform:rotate(360deg)}}"}</style>
        <div
          aria-label="Loading shared view"
          className="h-9 w-9 rounded-full motion-reduce:animate-none"
          style={{
            border: "3px solid rgba(148,163,184,0.25)",
            borderTopColor: "#00F0FF",
            animation: "litShareSpin 800ms linear infinite",
          }}
        />
      </div>
    );
  }

  if (state.status === "error") return <ErrorCard kind={state.kind} />;

  const p = state.payload;
  if (!dataset) return <ErrorCard kind="invalid" />;

  const expires = p.expires_at
    ? new Date(p.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "never";
  const include = {
    spend: p.include?.spend ?? true,
    bols: p.include?.bols ?? true,
    suppliers: p.include?.suppliers ?? true,
    carriers: p.include?.carriers ?? true,
  };

  return (
    <div className="fixed inset-0" style={{ background: "#020617" }}>
      {/* 48px viewer top bar (above the open view, which starts at top:48) */}
      <div
        className="fixed left-0 right-0 top-0 z-[1300] flex items-center gap-3.5 border-b px-5"
        style={{
          height: 48,
          background: "#020617",
          borderColor: "#1F2937",
          color: "#cbd5e1",
          fontFamily: FONT_BODY,
          fontSize: 13,
        }}
      >
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13, color: "#f8fafc" }}>
          Logistics Intel
        </span>
        <span className="h-[18px] w-px flex-none bg-[#334155]" />
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <Eye size={15} color="#00F0FF" className="flex-none" />
          <span>
            Read-only view of <b style={{ color: "#f8fafc" }}>{p.company.name}</b>
          </span>
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: "#64748b" }}>
          {p.shared_by ? `Shared by ${p.shared_by} · ` : ""}expires {expires}
        </span>
        <span className="flex-1" />
        <a
          href="https://logisticintel.com/?utm_source=share_portal"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-white no-underline active:scale-[.97] motion-reduce:active:scale-100"
          style={{
            fontFamily: FONT_BODY,
            fontWeight: 600,
            fontSize: 12,
            background: "#3b82f6",
            boxShadow: "0 0 14px rgba(59,130,246,0.5)",
          }}
        >
          Explore with LIT
          <ArrowUpRight size={14} />
        </a>
      </div>

      {/* the open view portals itself fixed with top:48 in viewerMode */}
      <TradeLanesOpenView
        ds={dataset}
        companyName={p.company.name}
        initialM0={Math.max(0, dataset.lastMi - 11)}
        initialM1={dataset.lastMi}
        onClose={() => {}}
        viewerMode
        redactions={include}
      />
    </div>
  );
}
