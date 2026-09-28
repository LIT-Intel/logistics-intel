/**
 * ShareMapDialog — "Share trade lanes map" modal (design handoff #2 §4.6,
 * `Trade Lanes Map.dc.html` share-dialog block).
 *
 * Owner flow only. All persistence goes through the deployed `share-map`
 * edge function (create / list / revoke); each link is a server-side
 * snapshot — changing settings after a link exists shows a hint instead of
 * pretending to retro-actively update it.
 */
import React from "react";
import { Check, Copy, Eye, Info, Link as LinkIcon, Mail, Share2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, useReducedMotion } from "../ui";

const EASE = "cubic-bezier(0.16,1,0.3,1)";

// ---------------------------------------------------------------- types

export interface ShareInclude {
  spend: boolean;
  bols: boolean;
  suppliers: boolean;
  carriers: boolean;
}

interface ShareLinkRow {
  id: string;
  token: string;
  company_name?: string;
  access?: string;
  expires_at: string | null;
  include?: ShareInclude;
  revoked_at: string | null;
  view_count?: number;
  last_viewed_at?: string | null;
  created_at?: string;
}

const OVERLINE: React.CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 600,
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#64748b",
};

// ---------------------------------------------------------------- helpers

/** invoke share-map, unwrapping both error shapes (non-2xx → FunctionsHttpError
 *  with a Response in `.context`; 2xx body may still carry { ok:false }). */
async function callShareMap<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("share-map", { body });
  if (error) {
    let msg = (error as Error).message || "Request failed";
    try {
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (ctx && typeof ctx.json === "function") {
        const j = (await ctx.json()) as { error?: unknown } | null;
        if (j?.error) msg = String(j.error);
      }
    } catch {
      /* body not JSON — keep the transport message */
    }
    throw new Error(msg);
  }
  const d = data as { ok?: boolean; error?: unknown } | null;
  if (d && d.ok === false) throw new Error(String(d.error ?? "Request failed"));
  return data as T;
}

const parseEmails = (raw: string): string[] =>
  raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));

const fmtExpiry = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "never";

// ---------------------------------------------------------------- atoms

function Seg<T extends string | number | null>({
  options,
  value,
  onSelect,
}: {
  options: { id: T; label: string }[];
  value: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="flex gap-[2px] rounded-[10px] bg-[#F1F5F9] p-[3px]">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={String(o.id)}
            type="button"
            onClick={() => onSelect(o.id)}
            className="flex-1 cursor-pointer whitespace-nowrap rounded-[7px] border-0 px-2 py-[7px] text-center"
            style={{
              fontFamily: FONT_BODY,
              fontWeight: 600,
              fontSize: 12,
              background: on ? "#FFFFFF" : "transparent",
              color: on ? "#0F172A" : "#64748b",
              boxShadow: on ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
              transition: "background 200ms, color 200ms",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 38×22 switch, knob 18, #3b82f6 on / #CBD5E1 off, 200ms (README §4.6). */
function Toggle({ on, reduced }: { on: boolean; reduced: boolean }) {
  return (
    <div
      className="relative flex-none rounded-full"
      style={{
        width: 38,
        height: 22,
        background: on ? "#3b82f6" : "#CBD5E1",
        transition: reduced ? "none" : `background 200ms ${EASE}`,
      }}
    >
      <div
        className="absolute rounded-full bg-white"
        style={{
          top: 2,
          left: 2,
          width: 18,
          height: 18,
          boxShadow: "0 1px 3px rgba(15,23,42,0.25)",
          transform: `translateX(${on ? 16 : 0}px)`,
          transition: reduced ? "none" : `transform 200ms ${EASE}`,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- dialog

export function ShareMapDialog(props: {
  open: boolean;
  onClose: () => void;
  companyKey: string;
  companyUuid?: string | null;
  companyName: string;
  initialState?: { m0?: number; m1?: number; metric?: string; lane?: string | null };
  periodLabel?: string;
  unitLabel?: string;
  laneLabel?: string;
}) {
  const { open, onClose, companyKey, companyUuid, companyName, initialState } = props;
  const reduced = useReducedMotion();

  // ---- settings (snapshot per link; server-side source of truth) ---------
  const [access, setAccess] = React.useState<"link" | "invite">("link");
  const [emails, setEmails] = React.useState("");
  const [expiry, setExpiry] = React.useState<7 | 30 | 90 | null>(30);
  const [include, setInclude] = React.useState<ShareInclude>({
    spend: true,
    bols: true,
    suppliers: true,
    carriers: true,
  });

  // ---- links ---------------------------------------------------------------
  const [links, setLinks] = React.useState<ShareLinkRow[]>([]);
  const [current, setCurrent] = React.useState<ShareLinkRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const currentRef = React.useRef(current);
  currentRef.current = current;
  /** any settings change AFTER a link exists → "applies to new links" hint. */
  const touch = React.useCallback(() => {
    if (currentRef.current) setDirty(true);
  }, []);

  // ---- open: fetch existing links, pick newest non-revoked ----------------
  React.useEffect(() => {
    if (!open) return;
    setCopied(false);
    setError(null);
    setDirty(false);
    let alive = true;
    (async () => {
      try {
        const res = await callShareMap<{ ok: true; links: ShareLinkRow[] }>({
          action: "list",
          company_id: companyKey,
        });
        if (!alive) return;
        const rows = (res.links ?? [])
          .slice()
          .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
        setLinks(rows);
        setCurrent(rows.find((l) => !l.revoked_at) ?? null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load shared links");
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, companyKey]);

  // ---- Esc closes the dialog only (capture beats the open view's handler) -
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  // ---- actions -------------------------------------------------------------
  const doCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await callShareMap<{ ok: true; id: string; token: string }>({
        action: "create",
        company_id: companyKey,
        company_uuid: companyUuid ?? undefined,
        company_name: companyName,
        access,
        invite_emails: access === "invite" ? parseEmails(emails) : undefined,
        expires_days: expiry,
        include: { ...include },
        initial_state: {
          period:
            initialState?.m0 != null && initialState?.m1 != null
              ? `${initialState.m0}-${initialState.m1}`
              : undefined,
          metric: initialState?.metric,
          lane: initialState?.lane ?? undefined,
        },
      });
      const row: ShareLinkRow = {
        id: res.id,
        token: res.token,
        company_name: companyName,
        access,
        expires_at: expiry ? new Date(Date.now() + expiry * 86400000).toISOString() : null,
        include: { ...include },
        revoked_at: null,
        view_count: 0,
        created_at: new Date().toISOString(),
      };
      setLinks((ls) => [row, ...ls]);
      setCurrent(row);
      setDirty(false);
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the link");
    } finally {
      setCreating(false);
    }
  };

  const doRevoke = async (id: string) => {
    // optimistic strike-through; server call follows
    setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, revoked_at: new Date().toISOString() } : l)));
    if (currentRef.current?.id === id) setCurrent(null);
    try {
      await callShareMap<{ ok: true }>({ action: "revoke", id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke the link");
    }
  };

  const url = current ? `${window.location.origin}/s/${current.token}` : null;
  const copyTimer = React.useRef<number | null>(null);
  const doCopy = () => {
    if (!url) return;
    try {
      navigator.clipboard?.writeText(url)?.catch(() => {});
    } catch {
      /* clipboard unavailable — field still shows the link */
    }
    setCopied(true);
    if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
  };
  React.useEffect(
    () => () => {
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  // ---- render --------------------------------------------------------------
  const trans = (v: string) => (reduced ? "none" : v);
  const includeOpts: [keyof ShareInclude, string, string][] = [
    ["spend", "Estimated freight spend", "Modeled from lane rate × TEU"],
    ["bols", "Bill of lading records", "BOL numbers, dates, carriers, equipment"],
    ["suppliers", "Supplier names", "Shippers of record on each lane"],
    ["carriers", "Carrier mix", "Ocean carrier share per lane"],
  ];

  return (
    <>
      {/* scrim */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-[1300]"
        style={{
          background: "rgba(2,6,23,0.55)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: trans(`opacity 220ms ${EASE}`),
        }}
      />
      {/* modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={"Share trade lanes map · " + companyName}
        className="fixed left-1/2 top-1/2 z-[1301] overflow-auto bg-white"
        style={{
          width: 560,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 48px)",
          borderRadius: 20,
          boxShadow: "0 40px 80px rgba(2,6,23,0.45)",
          color: "#0F172A",
          fontFamily: FONT_BODY,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transform: `translate(-50%,-50%) scale(${open ? 1 : 0.96})`,
          transition: trans(`opacity 220ms ${EASE}, transform 260ms ${EASE}`),
        }}
      >
        {/* header */}
        <div className="flex justify-between gap-3 border-b border-[#EEF2F6] px-6 pb-4 pt-[22px]">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px]"
                style={{ background: "#0F172A", color: "#00F0FF", boxShadow: "0 0 12px rgba(0,240,255,0.25)" }}
              >
                <Share2 size={16} />
              </span>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, letterSpacing: "-0.01em" }}>
                Share trade lanes map
              </div>
            </div>
            <div className="mt-2 text-[13px] leading-normal text-[#64748b]">
              Anyone with the link can view a read-only portal for {companyName}. They don&apos;t need a LIT
              account.
            </div>
          </div>
          <button
            type="button"
            aria-label="Close share dialog"
            onClick={onClose}
            className="grid h-8 w-8 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-[#64748b] hover:bg-[#F1F5F9]"
          >
            <X size={16} />
          </button>
        </div>

        {/* body */}
        <div className="flex flex-col gap-[18px] px-6 py-[18px]">
          {error && (
            <div
              className="rounded-[10px] border px-3 py-2.5 text-[12px] leading-normal"
              style={{ background: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.35)", color: "#b45309" }}
            >
              {error}
            </div>
          )}

          {/* link row / create action */}
          {current ? (
            <div className="flex gap-2">
              <div
                className="flex h-[42px] min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3"
                style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 13, color: "#0F172A" }}
              >
                <LinkIcon size={14} color="#94a3b8" className="flex-none" />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{url}</span>
              </div>
              <button
                type="button"
                onClick={doCopy}
                className="flex h-[42px] flex-none cursor-pointer items-center gap-2 rounded-[10px] border-0 px-4 text-white active:scale-[.97] motion-reduce:active:scale-100"
                style={{
                  fontFamily: FONT_BODY,
                  fontWeight: 600,
                  fontSize: 13,
                  background: copied ? "#10b981" : "#3b82f6",
                  transition: trans(`background 200ms, transform 160ms ${EASE}`),
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrent(null);
                  setDirty(false);
                  setCopied(false);
                }}
                className="h-[42px] flex-none cursor-pointer rounded-[10px] border border-[#E5E7EB] bg-transparent px-3 text-[#64748b] hover:bg-[#F8FAFC]"
                style={{ fontFamily: FONT_BODY, fontWeight: 600, fontSize: 12 }}
              >
                New link
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 text-[12px] leading-normal text-[#64748b]">
                No active link yet. Create one with the settings below.
              </div>
              <button
                type="button"
                onClick={doCreate}
                disabled={creating}
                className="flex h-[42px] flex-none cursor-pointer items-center gap-2 rounded-[10px] border-0 px-4 text-white active:scale-[.97] motion-reduce:active:scale-100 disabled:cursor-default disabled:opacity-60"
                style={{
                  fontFamily: FONT_BODY,
                  fontWeight: 600,
                  fontSize: 13,
                  background: "#3b82f6",
                  boxShadow: "0 6px 18px rgba(59,130,246,0.35)",
                  transition: trans(`transform 160ms ${EASE}`),
                }}
              >
                <LinkIcon size={15} />
                {creating ? "Creating…" : "Create link"}
              </button>
            </div>
          )}

          {/* who can view / expires */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <div className="mb-2" style={OVERLINE}>
                Who can view
              </div>
              <Seg
                options={[
                  { id: "link" as const, label: "Anyone with link" },
                  { id: "invite" as const, label: "Invited only" },
                ]}
                value={access}
                onSelect={(v) => {
                  setAccess(v);
                  touch();
                }}
              />
            </div>
            <div>
              <div className="mb-2" style={OVERLINE}>
                Link expires
              </div>
              <Seg
                options={[
                  { id: 7 as const, label: "7 days" },
                  { id: 30 as const, label: "30 days" },
                  { id: 90 as const, label: "90 days" },
                  { id: null, label: "Never" },
                ]}
                value={expiry}
                onSelect={(v) => {
                  setExpiry(v as 7 | 30 | 90 | null);
                  touch();
                }}
              />
            </div>
          </div>

          {access === "invite" && (
            <div className="flex h-[42px] items-center gap-2 rounded-[10px] border border-[#E5E7EB] px-3">
              <Mail size={15} color="#94a3b8" className="flex-none" />
              <input
                type="text"
                value={emails}
                onChange={(e) => {
                  setEmails(e.target.value);
                  touch();
                }}
                placeholder="Add emails, e.g. buyer@shipper.com"
                className="h-full w-full border-0 bg-transparent outline-none placeholder:text-[#94a3b8]"
                style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#0F172A" }}
              />
            </div>
          )}

          {/* include toggles */}
          <div>
            <div className="mb-1.5" style={OVERLINE}>
              Include in shared view
            </div>
            {includeOpts.map(([k, label, sub]) => (
              <div
                key={k}
                onClick={() => {
                  setInclude((o) => ({ ...o, [k]: !o[k] }));
                  touch();
                }}
                className="flex cursor-pointer items-center gap-3 border-b border-[#F1F5F9] py-2.5"
              >
                <div className="flex-1">
                  <div style={{ fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13 }}>{label}</div>
                  <div className="text-[12px] text-[#64748b]">{sub}</div>
                </div>
                <Toggle on={include[k]} reduced={reduced} />
              </div>
            ))}
            {dirty && current && (
              <div className="mt-2 text-[11px] font-medium text-[#b45309]">
                Settings apply to new links — existing links keep the snapshot they were created with.
              </div>
            )}
          </div>

          {/* info note */}
          <div
            className="flex gap-2.5 rounded-xl border border-[#EEF2F6] bg-[#F8FAFC] px-3.5 py-3 text-[12px] leading-normal text-[#475569]"
          >
            <Info size={15} color="#3b82f6" className="mt-[1px] flex-none" />
            <span>
              Opens on <b>{props.periodLabel ?? "the current period"}</b>, sorted by{" "}
              <b>{props.unitLabel ?? "the current metric"}</b>, focused on <b>{props.laneLabel ?? "all lanes"}</b>.
              Viewers can change the period and lane, but can&apos;t export or see your CRM notes, owner, stage or
              contacts.
            </span>
          </div>

          {/* shared links mini-section */}
          {links.length > 0 && (
            <div>
              <div className="mb-1.5" style={OVERLINE}>
                Shared links
              </div>
              {links.map((l) => {
                const revoked = !!l.revoked_at;
                return (
                  <div
                    key={l.id}
                    className="flex items-center gap-2.5 border-b border-[#F1F5F9] py-2 text-[12px]"
                    style={{ opacity: revoked ? 0.55 : 1 }}
                  >
                    <span
                      className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                      style={{
                        fontFamily: FONT_MONO,
                        fontWeight: 500,
                        color: "#1d4ed8",
                        textDecoration: revoked ? "line-through" : "none",
                      }}
                    >
                      /s/{l.token.slice(0, 8)}…
                    </span>
                    <span className="flex-none tabular-nums text-[#64748b]" style={{ fontFamily: FONT_MONO }}>
                      {l.view_count ?? 0} views
                    </span>
                    <span className="flex-none text-[#94a3b8]">expires {fmtExpiry(l.expires_at)}</span>
                    {revoked ? (
                      <span className="flex-none font-semibold text-[#94a3b8]">Revoked</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => doRevoke(l.id)}
                        className="flex-none cursor-pointer rounded-md border border-[#E5E7EB] bg-transparent px-2 py-[3px] font-semibold text-[#b91c1c] hover:bg-[#FEF2F2]"
                        style={{ fontFamily: FONT_BODY, fontSize: 11 }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex flex-wrap justify-between gap-2.5 px-6 pb-5 pt-3.5">
          <button
            type="button"
            disabled={!url}
            onClick={() => {
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            }}
            className="flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-transparent px-3.5 text-[#0F172A] hover:bg-[#F8FAFC] disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
            style={{ fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13 }}
          >
            <Eye size={15} />
            Preview as viewer
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 cursor-pointer items-center rounded-[10px] border-0 px-5 text-white active:scale-[.97] motion-reduce:active:scale-100"
            style={{ fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13, background: "#0F172A" }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}

export default ShareMapDialog;
