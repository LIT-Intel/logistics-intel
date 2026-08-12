import { useEffect, useMemo, useState } from "react";
import { Mail, Send, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Demo Invitations — the outbound half of the sales funnel (Phase 2 of
 * the enterprise admin build). Members of the internal LIT org send
 * personal demo invitations; every invite row then walks the funnel
 * automatically via DB triggers:
 *   sent → delivered → opened → clicked → signed up → trial → paid
 * (delivery/open/click from Resend webhooks, signup from auth, paid from
 * subscriptions). Access is enforced by RLS — non-internal users see
 * nothing and the send edge fn rejects them.
 */

type DemoInvite = {
  id: string;
  sender_user_id: string;
  sender_email: string | null;
  prospect_email: string;
  prospect_name: string | null;
  prospect_company: string | null;
  personal_note: string | null;
  status: string;
  sent_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  signed_up_at: string | null;
  trial_started_at: string | null;
  upgraded_at: string | null;
  upgraded_plan_code: string | null;
};

const STAGES: Array<{ key: keyof DemoInvite | "sent_at"; label: string }> = [
  { key: "sent_at", label: "Sent" },
  { key: "delivered_at", label: "Delivered" },
  { key: "opened_at", label: "Opened" },
  { key: "clicked_at", label: "Clicked" },
  { key: "signed_up_at", label: "Signed up" },
  { key: "trial_started_at", label: "Trial" },
  { key: "upgraded_at", label: "Paid" },
];

function FunnelDots({ invite }: { invite: DemoInvite }) {
  if (invite.bounced_at) {
    return (
      <span className="font-display inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-rose-700">
        Bounced
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((s, i) => {
        const reached = Boolean(invite[s.key]);
        return (
          <div key={s.key} className="flex items-center" title={`${s.label}${reached ? " ✓" : ""}`}>
            {i > 0 && (
              <div className={`h-px w-2 ${reached ? "bg-blue-400" : "bg-slate-200"}`} />
            )}
            <div
              className={[
                "h-2.5 w-2.5 rounded-full border",
                reached
                  ? s.key === "upgraded_at"
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-blue-500 bg-blue-500"
                  : "border-slate-300 bg-white",
              ].join(" ")}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function DemoInvites() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<DemoInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [mineOnly, setMineOnly] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", company: "", note: "" });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("lit_demo_invites")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    setInvites((data as DemoInvite[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(
    () => (mineOnly ? invites.filter((i) => i.sender_user_id === user?.id) : invites),
    [invites, mineOnly, user?.id],
  );

  const stats = useMemo(() => {
    const total = visible.length;
    const opened = visible.filter((i) => i.opened_at).length;
    const signedUp = visible.filter((i) => i.signed_up_at).length;
    const paid = visible.filter((i) => i.upgraded_at).length;
    return { total, opened, signedUp, paid };
  }, [visible]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  async function handleSend() {
    const email = form.email.trim();
    if (!email || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-demo-invite", {
        body: {
          email,
          name: form.name.trim() || undefined,
          company: form.company.trim() || undefined,
          note: form.note.trim() || undefined,
        },
      });
      if (error || data?.ok === false) {
        let msg = data?.error || error?.message || "Send failed";
        try {
          const parsed = await (error as any)?.context?.clone?.().json?.();
          if (parsed?.error) msg = parsed.error;
        } catch { /* keep msg */ }
        flash(msg);
      } else {
        flash(`Invitation sent to ${email}`);
        setForm({ email: "", name: "", company: "", note: "" });
        await load();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[20px] font-bold text-slate-900">Demo Invitations</h1>
          <p className="font-body mt-1 text-[13px] text-slate-500">
            Invite prospects to a walkthrough and watch them move through the funnel —
            delivery, opens, signup, and upgrade resolve automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="font-body flex items-center gap-1.5 text-[12.5px] text-slate-600">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
              className="accent-blue-600"
            />
            Mine only
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-700"
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Send card */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="font-display mb-3 text-[13px] font-bold text-slate-900">
          Send an invitation
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            type="email"
            required
            placeholder="prospect@company.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13.5px] outline-none focus:border-blue-400 focus:bg-white"
          />
          <input
            type="text"
            placeholder="First name (optional)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13.5px] outline-none focus:border-blue-400 focus:bg-white"
          />
          <input
            type="text"
            placeholder="Company (optional)"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13.5px] outline-none focus:border-blue-400 focus:bg-white"
          />
        </div>
        <textarea
          placeholder="Personal note (optional) — shows as a quote from you in the email"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          rows={2}
          className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13.5px] outline-none focus:border-blue-400 focus:bg-white"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="font-body text-[11.5px] text-slate-400">
            Sends from sales@logisticintel.com — replies land in the sales inbox.
          </span>
          <button
            type="button"
            disabled={sending || !form.email.trim()}
            onClick={() => void handleSend()}
            className="font-display inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send invitation
          </button>
        </div>
        {toast && (
          <div className="font-body mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[12.5px] text-blue-800">
            {toast}
          </div>
        )}
      </div>

      {/* Funnel stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Invited", value: stats.total },
          { label: "Opened", value: stats.opened },
          { label: "Signed up", value: stats.signedUp },
          { label: "Upgraded", value: stats.paid },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="font-mono text-[18px] font-bold text-slate-900">{s.value}</div>
            <div className="font-body text-[11px] uppercase tracking-[0.06em] text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Invites table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-10 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-body text-[13px]">Loading…</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Mail className="mx-auto h-6 w-6 text-slate-300" />
            <p className="font-body mt-2 text-[13px] text-slate-500">
              No invitations yet. Send your first one above.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {["Prospect", "Sender", "Funnel", "Sent"].map((h) => (
                  <th key={h} className="font-display px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="font-display text-[13px] font-semibold text-slate-900">
                      {inv.prospect_name || inv.prospect_email}
                    </div>
                    <div className="font-body text-[11.5px] text-slate-500">
                      {inv.prospect_name ? inv.prospect_email : ""}
                      {inv.prospect_company ? `${inv.prospect_name ? " · " : ""}${inv.prospect_company}` : ""}
                    </div>
                  </td>
                  <td className="font-body px-4 py-3 text-[12px] text-slate-600">
                    {(inv.sender_email || "").split("@")[0] || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <FunnelDots invite={inv} />
                    <div className="font-body mt-1 text-[10.5px] capitalize text-slate-400">
                      {inv.status === "upgraded" && inv.upgraded_plan_code
                        ? `Upgraded — ${inv.upgraded_plan_code}`
                        : inv.status.replace("_", " ")}
                    </div>
                  </td>
                  <td className="font-mono px-4 py-3 text-[11.5px] text-slate-500">
                    {new Date(inv.sent_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
