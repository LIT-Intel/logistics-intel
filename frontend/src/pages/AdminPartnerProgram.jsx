// /admin/partner-program — Partner Program Admin (super-admin only).
//
// Design source: docs/design-specs/lit-design-system/affiliate/AffiliateAdmin.jsx
//
// Reads:  affiliate-admin edge function (super-admin gated, service-role internally)
// Writes: affiliate-review edge function (approve / reject)
//
// 5 tabs: Applications, Partners, Commissions, Payout runs, Tiers.
// All data is real. No fake rows. Empty states everywhere there's no data.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Inbox,
  Users,
  Coins,
  Send,
  Layers,
  AlertCircle,
  Info,
  Pencil,
  Play,
  CheckCircle2,
  XCircle,
  UserPlus,
  MoreVertical,
  Mail,
  Ban,
  RotateCcw,
  Trash2,
  Copy,
} from 'lucide-react';
import {
  fetchAdminKpis,
  fetchAdminApplications,
  fetchAdminInvites,
  fetchAdminPartners,
  fetchAdminCommissions,
  fetchAdminPayouts,
  fetchAdminTiers,
  reviewApplication,
  createAffiliateInvite,
  resendInvite,
  revokeInvite,
  deactivatePartner,
  reactivatePartner,
  softDeletePartner,
  resendStripeOnboarding,
  updatePartnerCommission,
} from '@/lib/affiliateAdmin';
import { T, Btn } from '@/components/affiliate/tokens';
import { Badge, Card, StatCell } from '@/components/affiliate/primitives';

const TABS = [
  { k: 'applications', l: 'Applications', Icon: Inbox },
  { k: 'partners',     l: 'Partners',     Icon: Users },
  { k: 'commissions',  l: 'Commissions',  Icon: Coins },
  { k: 'payouts',      l: 'Payout runs',  Icon: Send },
  { k: 'tiers',        l: 'Tiers',        Icon: Layers },
];

function fmtCurrency(cents, currency = 'usd') {
  const v = (cents || 0) / 100;
  try {
    return v.toLocaleString(undefined, {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
      maximumFractionDigits: 2,
    });
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function fmtRelative(iso) {
  if (!iso) return '—';
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const hour = 3_600_000;
    const day = 24 * hour;
    if (diff < hour) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
    if (diff < day) return `${Math.round(diff / hour)}h ago`;
    if (diff < 30 * day) return `${Math.round(diff / day)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function statusTone(status) {
  switch (status) {
    case 'pending':    return 'warn';
    case 'approved':   return 'success';
    case 'earned':     return 'success';
    case 'paid':       return 'success';
    case 'active':     return 'success';
    case 'rejected':   return 'danger';
    case 'voided':     return 'danger';
    case 'failed':     return 'danger';
    case 'cancelled':  return 'danger';
    case 'suspended':  return 'danger';
    case 'terminated': return 'danger';
    case 'flagged':    return 'danger';
    case 'processing': return 'warn';
    case 'withdrawn':  return 'neutral';
    default:           return 'neutral';
  }
}

function EmptyRow({ label }) {
  return (
    <div
      style={{
        padding: '40px 24px', textAlign: 'center',
        fontSize: 12.5, color: T.inkFaint,
        background: T.bgSubtle, borderTop: `1px dashed ${T.border}`,
      }}
    >
      {label}
    </div>
  );
}

function ErrorBanner({ children, onRetry }) {
  if (!children) return null;
  return (
    <div
      style={{
        background: T.redBg,
        border: `1px solid ${T.redBorder}`,
        borderRadius: 10,
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 16,
      }}
    >
      <AlertCircle size={16} color={T.red} />
      <div style={{ flex: 1, fontSize: 12.5, color: T.inkMuted }}>{children}</div>
      {onRetry && (
        <button type="button" style={Btn.ghost} onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 36,
      }}
    >
      <div
        style={{
          width: 24, height: 24, borderRadius: '50%',
          border: `3px solid ${T.bgSunken}`,
          borderTopColor: T.brand,
          animation: 'lit-aff-admin-spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes lit-aff-admin-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const TH_STYLE = {
  padding: '10px 16px', fontSize: 10.5, fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: T.inkFaint, fontFamily: T.ffDisplay,
};
const TD_BASE = { padding: '12px 16px' };

/* ── Applications tab ───────────────────────────────────────── */
function AdminApplications({ onChange }) {
  const [kpis, setKpis] = useState(null);
  const [rows, setRows] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [confirmReject, setConfirmReject] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [search, setSearch] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [kpiRes, appRes, invRes] = await Promise.all([
      fetchAdminKpis(),
      fetchAdminApplications(),
      fetchAdminInvites(),
    ]);
    if (kpiRes.ok) setKpis(kpiRes);
    else setError(kpiRes.error || 'Failed to load KPIs');
    if (appRes.ok) setRows(appRes.applications || []);
    else if (!error) setError(appRes.error || 'Failed to load applications');
    if (invRes.ok) setInvites(invRes.invites || []);
    setLoading(false);
  }, [error]);

  useEffect(() => { load(); }, [load]);

  async function handleResendInvite(invite) {
    if (busyId) return;
    setBusyId(invite.id);
    const result = await resendInvite(invite.id);
    setBusyId(null);
    if (result.ok) {
      await load();
    } else {
      setError(result.error || `Failed to resend invite (${result.code || ''})`.trim());
    }
  }
  async function handleRevokeInvite(invite) {
    if (busyId) return;
    if (!window.confirm(`Revoke invitation to ${invite.email}? They won't be able to claim it.`)) return;
    setBusyId(invite.id);
    const result = await revokeInvite(invite.id);
    setBusyId(null);
    if (result.ok) {
      await load();
      onChange?.();
    } else {
      setError(result.error || 'Failed to revoke invite');
    }
  }
  async function handleInviteCreated() {
    setShowInviteModal(false);
    await load();
    onChange?.();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      [r.full_name, r.email, r.company_or_brand, r.audience_description, r.primary_channels]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  async function approve(row) {
    if (busyId) return;
    setBusyId(row.id);
    const result = await reviewApplication(row.id, 'approve');
    setBusyId(null);
    if (result.ok) {
      await load();
      onChange?.();
    } else {
      setError(result.error || 'Approve failed');
    }
  }

  async function reject() {
    if (!confirmReject) return;
    const id = confirmReject.id;
    setBusyId(id);
    const result = await reviewApplication(id, 'reject', {
      rejection_reason: rejectReason.trim() || undefined,
    });
    setBusyId(null);
    setConfirmReject(null);
    setRejectReason('');
    if (result.ok) {
      await load();
      onChange?.();
    } else {
      setError(result.error || 'Reject failed');
    }
  }

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ErrorBanner onRetry={load}>{error}</ErrorBanner>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          style={Btn.primary}
          onClick={() => setShowInviteModal(true)}
        >
          <UserPlus size={13} /> Invite affiliate
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <Card><StatCell label="Pending review"  value={kpis ? String(kpis.applications_pending) : '—'} /></Card>
        <Card><StatCell label="Open invites"    value={kpis ? String(kpis.invites_open) : '—'} /></Card>
        <Card><StatCell label="Approved (30d)"  value={kpis ? String(kpis.applications_approved_30d) : '—'} /></Card>
        <Card><StatCell label="Active partners" value={kpis ? String(kpis.partners_active) : '—'} /></Card>
      </div>

      {/* Invites */}
      <Card padded={false}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${T.borderSoft}`,
            fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 700, color: T.ink,
          }}
        >
          Invites · {invites.length}
        </div>
        {loading ? (
          <Spinner />
        ) : invites.length === 0 ? (
          <EmptyRow label="No invites sent yet. Use the Invite affiliate button to invite a new partner by email." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: T.bgSubtle, textAlign: 'left' }}>
                {['Recipient','Tier','Sent','Expires','State','Sent by',''].map((h) => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invites.map((iv, i, arr) => (
                <tr
                  key={iv.id}
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}
                >
                  <td style={TD_BASE}>
                    <div style={{ fontFamily: T.ffDisplay, fontWeight: 600, color: T.ink }}>
                      {iv.name || iv.email}
                    </div>
                    <div style={{ fontFamily: T.ffMono, fontSize: 11.5, color: T.inkFaint }}>
                      {iv.email}
                    </div>
                    {iv.company && (
                      <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
                        {iv.company}
                      </div>
                    )}
                  </td>
                  <td style={TD_BASE}>
                    {iv.tier_code ? <Badge tone="brand">{iv.tier_code}</Badge> : <span style={{ color: T.inkFaint }}>—</span>}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: T.ffMono, color: T.inkSoft }}>
                    {fmtRelative(iv.last_sent_at)}
                    {iv.send_count > 1 && (
                      <span style={{ fontSize: 11, color: T.inkFaint, marginLeft: 6 }}>
                        ×{iv.send_count}
                      </span>
                    )}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: T.ffMono, color: T.inkSoft }}>
                    {fmtDateShort(iv.expires_at)}
                  </td>
                  <td style={TD_BASE}>
                    <Badge
                      tone={
                        iv.state === 'pending' ? 'warn' :
                        iv.state === 'claimed' ? 'success' :
                        iv.state === 'revoked' ? 'danger' :
                        iv.state === 'expired' ? 'neutral' : 'neutral'
                      }
                      dot
                    >
                      {iv.state}
                    </Badge>
                  </td>
                  <td style={{ ...TD_BASE, fontSize: 11.5, color: T.inkFaint }}>
                    {iv.invited_by_email || '—'}
                  </td>
                  <td style={TD_BASE}>
                    {iv.state === 'pending' || iv.state === 'expired' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          style={{ ...Btn.ghost, padding: '5px 10px', fontSize: 11.5 }}
                          onClick={() => handleRevokeInvite(iv)}
                          disabled={busyId === iv.id}
                          title="Revoke invitation"
                        >
                          <Ban size={11} /> Revoke
                        </button>
                        <button
                          type="button"
                          style={{ ...Btn.primary, padding: '5px 10px', fontSize: 11.5 }}
                          onClick={() => handleResendInvite(iv)}
                          disabled={busyId === iv.id}
                          title={iv.state === 'expired' ? 'Generates a new token + extends expiry' : 'Resends the email with the existing token'}
                        >
                          <Mail size={11} /> {busyId === iv.id ? '…' : 'Resend'}
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11.5, color: T.inkFaint }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card padded={false}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${T.borderSoft}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <div style={{ fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 700, color: T.ink, flex: 1 }}>
            Applications
          </div>
          <input
            placeholder="Search applicant, email, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 12.5,
              fontFamily: T.ffBody,
              width: 280,
              outline: 'none',
            }}
          />
        </div>
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyRow label={rows.length === 0 ? 'No applications yet.' : 'No applications match that search.'} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: T.bgSubtle, textAlign: 'left' }}>
                {['Applicant','Audience','Channels','Volume','Submitted','Status',''].map((h) => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i, arr) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}
                >
                  <td style={TD_BASE}>
                    <div style={{ fontFamily: T.ffDisplay, fontWeight: 600, color: T.ink }}>
                      {r.full_name || '—'}
                    </div>
                    <div style={{ fontFamily: T.ffMono, fontSize: 11.5, color: T.inkFaint }}>
                      {r.email || '—'}
                    </div>
                    {r.company_or_brand && (
                      <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
                        {r.company_or_brand}
                      </div>
                    )}
                  </td>
                  <td style={{ ...TD_BASE, color: T.inkMuted, maxWidth: 240 }}>
                    {r.audience_description || '—'}
                    {r.audience_size && (
                      <div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}>
                        Size: {r.audience_size}
                      </div>
                    )}
                  </td>
                  <td style={{ ...TD_BASE, color: T.inkMuted }}>
                    {r.primary_channels || '—'}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: T.ffMono, color: T.ink }}>
                    {r.expected_referral_volume || '—'}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: T.ffMono, color: T.inkSoft }}>
                    {fmtRelative(r.submitted_at)}
                  </td>
                  <td style={TD_BASE}>
                    <Badge tone={statusTone(r.status)} dot>{r.status}</Badge>
                  </td>
                  <td style={TD_BASE}>
                    {r.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          style={{ ...Btn.ghost, padding: '5px 10px', fontSize: 11.5 }}
                          onClick={() => { setConfirmReject(r); setRejectReason(''); }}
                          disabled={busyId === r.id}
                        >
                          <XCircle size={11} /> Reject
                        </button>
                        <button
                          type="button"
                          style={{ ...Btn.primary, padding: '5px 10px', fontSize: 11.5 }}
                          onClick={() => approve(r)}
                          disabled={busyId === r.id}
                        >
                          <CheckCircle2 size={11} /> {busyId === r.id ? '…' : 'Approve'}
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11.5, color: T.inkFaint }}>
                        {r.reviewer ? `by ${r.reviewer}` : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {confirmReject && (
        <RejectModal
          row={confirmReject}
          reason={rejectReason}
          onChange={setRejectReason}
          onCancel={() => { setConfirmReject(null); setRejectReason(''); }}
          onConfirm={reject}
          busy={busyId === confirmReject.id}
        />
      )}
      {showInviteModal && (
        <InviteModal
          onCancel={() => setShowInviteModal(false)}
          onSuccess={handleInviteCreated}
        />
      )}
    </div>
  );
}

function InviteModal({ onCancel, onSuccess }) {
  const [form, setForm] = useState({
    email: '',
    name: '',
    company: '',
    note: '',
    tier_code: 'starter',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e?.preventDefault?.();
    setError(null);
    const email = form.email.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setError('Enter a valid email.');
      return;
    }
    setBusy(true);
    const result = await createAffiliateInvite({
      email,
      name: form.name.trim() || null,
      company: form.company.trim() || null,
      note: form.note.trim() || null,
      tier_code: form.tier_code || null,
    });
    setBusy(false);
    if (result.ok) {
      if (result.mode === 'created_email_failed') {
        setError(`Invite created but email failed to send: ${result.error || 'unknown error'}. You can resend from the Invites table.`);
        // Still close after a beat so they see the row.
        setTimeout(onSuccess, 1500);
        return;
      }
      onSuccess?.();
    } else {
      if (result.code === 'RESEND_NOT_CONFIGURED') {
        setError('Email sender (Resend) is not configured. Contact engineering — RESEND_API_KEY / RESEND_FROM_EMAIL must be set.');
      } else {
        setError(result.error || 'Failed to create invite.');
      }
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, fontFamily: T.ffBody,
      }}
      onClick={onCancel}
    >
      <Card
        style={{ width: '100%', maxWidth: 520, padding: 24 }}
        onClick={(e) => e.stopPropagation?.()}
      >
        <form onSubmit={submit} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Badge tone="brand">Invite affiliate</Badge>
          </div>
          <div
            style={{
              fontFamily: T.ffDisplay, fontSize: 18, fontWeight: 700,
              color: T.ink, letterSpacing: '-0.01em',
            }}
          >
            Send a partner invitation
          </div>
          <div
            style={{
              fontSize: 12.5, color: T.inkSoft, marginTop: 6, lineHeight: 1.55,
            }}
          >
            They'll receive a Resend email with a secure invite link. The link
            expires in 14 days and can only be claimed once. Approval happens
            automatically on first claim — they go straight to Stripe Connect
            onboarding.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
            <Field label="Email" required>
              <input
                type="email"
                value={form.email}
                onChange={update('email')}
                disabled={busy}
                placeholder="partner@example.com"
                style={inputStyle}
                autoFocus
              />
            </Field>
            <Field label="Name (optional)">
              <input
                value={form.name}
                onChange={update('name')}
                disabled={busy}
                placeholder="Jordan Davis"
                style={inputStyle}
              />
            </Field>
            <Field label="Company / brand (optional)">
              <input
                value={form.company}
                onChange={update('company')}
                disabled={busy}
                placeholder="Nordic Freight Advisory"
                style={inputStyle}
              />
            </Field>
            <Field label="Tier">
              <select
                value={form.tier_code}
                onChange={update('tier_code')}
                disabled={busy}
                style={inputStyle}
              >
                <option value="starter">Starter (30% / 12mo)</option>
                <option value="launch_promo">Launch Promo (40% / 12mo)</option>
                <option value="partner">Partner (custom)</option>
              </select>
            </Field>
          </div>

          <div style={{ marginTop: 10 }}>
            <Field label="Personal note (optional, included in the email)">
              <textarea
                value={form.note}
                onChange={update('note')}
                disabled={busy}
                rows={3}
                placeholder="Hey Jordan, big fan of your newsletter — would love to have you in the program."
                style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }}
              />
            </Field>
          </div>

          {error && (
            <div
              style={{
                background: T.redBg,
                border: `1px solid ${T.redBorder}`,
                borderRadius: 8,
                padding: '10px 12px',
                marginTop: 12,
                fontSize: 12.5,
                color: T.inkMuted,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: T.red, fontFamily: T.ffDisplay }}>Error:</strong>{' '}
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button type="button" style={Btn.ghost} onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              style={{ ...Btn.primary, opacity: busy ? 0.7 : 1 }}
              disabled={busy}
            >
              <Mail size={13} /> {busy ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  background: T.bgSubtle,
  border: `1.5px solid ${T.border}`,
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: T.ffBody,
  color: T.ink,
  outline: 'none',
};

function Field({ label, required, children }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11.5, fontWeight: 600, fontFamily: T.ffDisplay,
          color: T.inkMuted, marginBottom: 5,
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <span>{label}</span>
        {required && <span style={{ color: T.red, fontWeight: 700 }}>*</span>}
      </div>
      {children}
    </div>
  );
}

function RejectModal({ row, reason, onChange, onCancel, onConfirm, busy }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, fontFamily: T.ffBody,
      }}
      onClick={onCancel}
    >
      <Card
        style={{ width: '100%', maxWidth: 480, padding: 24 }}
        onClick={(e) => e.stopPropagation?.()}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <div style={{ fontFamily: T.ffDisplay, fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
            Reject application?
          </div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 14 }}>
            This will mark <strong>{row.full_name || row.email || row.id}</strong>’s application as rejected.
            They’ll be able to reapply later.
          </div>
          <textarea
            rows={3}
            placeholder="Optional rejection reason shared with the applicant…"
            value={reason}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: '100%',
              background: T.bgSubtle,
              border: `1.5px solid ${T.border}`,
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
              fontFamily: T.ffBody,
              color: T.ink,
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" style={Btn.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
            <button
              type="button"
              style={{
                ...Btn.primary,
                background: 'linear-gradient(180deg,#ef4444,#dc2626)',
                boxShadow: '0 1px 4px rgba(239,68,68,0.3)',
                opacity: busy ? 0.7 : 1,
              }}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? 'Rejecting…' : 'Reject application'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ── Partners tab ───────────────────────────────────────── */

// Per-partner referral-link truth check, mirroring the rule used in the
// partner-facing app: only "real" when status='active' AND not deactivated
// AND not deleted AND ref code present AND referral_link_status='active'.
function partnerReferralLink(p, baseUrl) {
  if (!p) return null;
  if (p.deleted_at) return null;
  if (p.deactivated_at) return null;
  if (p.status !== 'active') return null;
  if (p.referral_link_status !== 'active') return null;
  if (!p.ref_code) return null;
  return `${baseUrl}/?ref=${p.ref_code}`;
}

function PartnerActionsMenu({ partner, busy, onAction }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const items = [];
  if (partner.status === 'invited' || partner.status === 'active') {
    items.push({ key: 'stripe', label: 'Resend Stripe onboarding link', icon: Mail });
  }
  if (partner.status === 'active' || partner.status === 'invited') {
    items.push({ key: 'deactivate', label: 'Deactivate partner', icon: Ban, danger: true });
  }
  if (partner.status === 'deactivated' || partner.status === 'suspended') {
    items.push({ key: 'reactivate', label: 'Reactivate partner', icon: RotateCcw });
  }
  items.push({ key: 'delete', label: 'Delete partner (soft)', icon: Trash2, danger: true });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        style={{ ...Btn.ghost, padding: '5px 8px', fontSize: 11.5 }}
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label="Partner actions"
      >
        <MoreVertical size={13} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4,
            background: '#fff', border: `1px solid ${T.border}`,
            borderRadius: 8, boxShadow: T.shadowMd,
            minWidth: 240, zIndex: 5, overflow: 'hidden',
          }}
        >
          {items.map((it, i) => {
            const ItIcon = it.icon;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => { setOpen(false); onAction(it.key); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', textAlign: 'left',
                  padding: '9px 12px',
                  fontFamily: T.ffDisplay, fontSize: 12.5, fontWeight: 500,
                  background: 'transparent', border: 'none',
                  color: it.danger ? T.red : T.inkMuted,
                  cursor: 'pointer',
                  borderTop: i > 0 ? `1px solid ${T.borderSoft}` : 'none',
                }}
              >
                <ItIcon size={13} />
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommissionCell({ partner, onSaved, onError }) {
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState(String(partner.commission_pct ?? ''));
  const [months, setMonths] = useState(String(partner.commission_months ?? ''));
  const [busy, setBusy] = useState(false);

  function start() {
    setPct(String(partner.commission_pct ?? ''));
    setMonths(String(partner.commission_months ?? ''));
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
    setPct(String(partner.commission_pct ?? ''));
    setMonths(String(partner.commission_months ?? ''));
  }
  async function save() {
    const pctNum = Number(pct);
    const monthsNum = Number(months);
    if (!Number.isFinite(pctNum) || pctNum <= 0 || pctNum > 100) {
      onError?.('Commission % must be between 0 and 100.');
      return;
    }
    if (!Number.isInteger(monthsNum) || monthsNum < 1 || monthsNum > 120) {
      onError?.('Commission months must be a whole number between 1 and 120.');
      return;
    }
    setBusy(true);
    const result = await updatePartnerCommission({
      partner_id: partner.id,
      commission_pct: pctNum,
      commission_months: monthsNum,
    });
    setBusy(false);
    if (result.ok) {
      setEditing(false);
      onSaved?.(result.partner);
    } else {
      onError?.(result.error || 'Failed to update commission rate.');
    }
  }

  if (!editing) {
    return (
      <div>
        <Badge tone="brand">{partner.tier}</Badge>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
        >
          <span style={{ fontSize: 12, color: T.ink, fontWeight: 600 }}>
            {partner.commission_pct}% / {partner.commission_months} mo
          </span>
          <button
            type="button"
            onClick={start}
            title="Edit commission rate"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6,
              border: `1px solid ${T.brand}`,
              background: `${T.brand}12`,
              color: T.brand,
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Pencil size={11} />
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Badge tone="brand">{partner.tier}</Badge>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        <input
          type="number"
          min="0.01"
          max="100"
          step="0.5"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          disabled={busy}
          style={{
            width: 56, padding: '4px 6px', fontSize: 11.5,
            fontFamily: T.ffMono, color: T.ink,
            border: `1px solid ${T.border}`, borderRadius: 6,
            outline: 'none', background: T.bgCanvas,
          }}
          aria-label="Commission percent"
        />
        <span style={{ fontSize: 11, color: T.inkSoft }}>% /</span>
        <input
          type="number"
          min="1"
          max="120"
          step="1"
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          disabled={busy}
          style={{
            width: 44, padding: '4px 6px', fontSize: 11.5,
            fontFamily: T.ffMono, color: T.ink,
            border: `1px solid ${T.border}`, borderRadius: 6,
            outline: 'none', background: T.bgCanvas,
          }}
          aria-label="Commission months"
        />
        <span style={{ fontSize: 11, color: T.inkSoft }}>mo</span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{
            ...Btn.primary,
            padding: '4px 8px', fontSize: 11,
            opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          style={{ ...Btn.ghost, padding: '4px 8px', fontSize: 11 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function AdminPartners() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const baseUrl = useMemo(
    () => (import.meta.env.VITE_PUBLIC_APP_URL || 'https://logisticintel.com').replace(/\/$/, ''),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchAdminPartners();
    if (res.ok) setRows(res.partners || []);
    else setError(res.error || 'Failed to load partners');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(partner, action) {
    if (busyId) return;
    let result;
    setBusyId(partner.id);
    if (action === 'stripe') {
      result = await resendStripeOnboarding(partner.id, true);
      if (result.ok) {
        if (result.email_sent) {
          setNotice({ tone: 'success', text: `Sent fresh Stripe link to ${result.partner_email || partner.email}.` });
        } else {
          setNotice({ tone: 'info', text: `Stripe link generated. Email send was skipped or failed; copy from logs if needed.` });
        }
      } else if (result.code === 'STRIPE_NOT_CONFIGURED') {
        setNotice({ tone: 'warn', text: 'Stripe Connect is not configured.' });
      } else {
        setNotice({ tone: 'danger', text: result.error || 'Failed to generate Stripe link.' });
      }
    } else if (action === 'deactivate') {
      if (!window.confirm(`Deactivate ${partner.email || partner.ref_code}? Their referral link will be paused; commission history is preserved.`)) {
        setBusyId(null);
        return;
      }
      result = await deactivatePartner(partner.id);
      if (result.ok) setNotice({ tone: 'success', text: 'Partner deactivated.' });
      else setNotice({ tone: 'danger', text: result.error || 'Failed to deactivate.' });
    } else if (action === 'reactivate') {
      result = await reactivatePartner(partner.id);
      if (result.ok) setNotice({ tone: 'success', text: 'Partner reactivated.' });
      else setNotice({ tone: 'danger', text: result.error || 'Failed to reactivate.' });
    } else if (action === 'delete') {
      if (!window.confirm(`Soft-delete ${partner.email || partner.ref_code}? Their referral link is removed and they lose access to active partner features. Commission history is preserved. This is reversible only by engineering.`)) {
        setBusyId(null);
        return;
      }
      result = await softDeletePartner(partner.id);
      if (result.ok) setNotice({ tone: 'success', text: 'Partner deleted (soft).' });
      else setNotice({ tone: 'danger', text: result.error || 'Failed to delete.' });
    }
    setBusyId(null);
    if (result?.ok) await load();
  }

  async function copyReferral(partner) {
    const url = partnerReferralLink(partner, baseUrl);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(partner.id);
      setTimeout(() => setCopiedId((id) => (id === partner.id ? null : id)), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ErrorBanner onRetry={load}>{error}</ErrorBanner>
      {notice && (
        <div
          style={{
            background:
              notice.tone === 'success' ? T.greenBg :
              notice.tone === 'danger'  ? T.redBg :
              notice.tone === 'warn'    ? T.amberBg : T.brandSoft,
            border: `1px solid ${
              notice.tone === 'success' ? T.greenBorder :
              notice.tone === 'danger'  ? T.redBorder :
              notice.tone === 'warn'    ? T.amberBorder : T.brandBorder
            }`,
            borderRadius: 10,
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12.5, color: T.inkMuted,
          }}
        >
          <div style={{ flex: 1 }}>{notice.text}</div>
          <button type="button" style={Btn.quiet} onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      <Card padded={false}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${T.borderSoft}`,
            fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 700, color: T.ink,
          }}
        >
          {loading ? 'Partners' : `Partners · ${rows.length}`}
        </div>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyRow label="No partners yet. Invite an affiliate or approve an application to create the first partner." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: T.bgSubtle, textAlign: 'left' }}>
                {['Partner','Tier','Referral link','Stripe','Referrals','Lifetime','Status',''].map((h) => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i, arr) => {
                const refUrl = partnerReferralLink(r, baseUrl);
                const linkLabel = (r.referral_link_status || 'inactive').replace(/_/g, ' ');
                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}
                  >
                    <td style={TD_BASE}>
                      <div style={{ fontFamily: T.ffDisplay, fontWeight: 600, color: T.ink }}>
                        {r.email || r.user_id}
                      </div>
                      <div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}>
                        Joined {fmtRelative(r.joined_at)}
                      </div>
                    </td>
                    <td style={TD_BASE}>
                      <CommissionCell
                        partner={r}
                        onSaved={(updated) => {
                          setRows((prev) => prev.map((p) => (p.id === r.id ? { ...p, ...updated } : p)));
                          setNotice({
                            tone: 'success',
                            text: `Commission updated to ${updated.commission_pct}% for ${updated.commission_months} months.`,
                          });
                        }}
                        onError={(msg) => setNotice({ tone: 'danger', text: msg })}
                      />
                    </td>
                    <td style={TD_BASE}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Badge
                          tone={
                            r.referral_link_status === 'active' ? 'success' :
                            r.referral_link_status === 'paused' ? 'warn' :
                            r.referral_link_status === 'deleted' ? 'danger' : 'neutral'
                          }
                          dot
                        >
                          {linkLabel}
                        </Badge>
                        {refUrl ? (
                          <button
                            type="button"
                            style={{ ...Btn.ghost, padding: '4px 8px', fontSize: 11 }}
                            onClick={() => copyReferral(r)}
                            title={refUrl}
                          >
                            {copiedId === r.id ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                            {copiedId === r.id ? 'Copied' : 'Copy'}
                          </button>
                        ) : null}
                      </div>
                      {r.ref_code && (
                        <div style={{ fontFamily: T.ffMono, fontSize: 11, color: T.inkFaint, marginTop: 3 }}>
                          {r.ref_code}
                        </div>
                      )}
                    </td>
                    <td style={TD_BASE}>
                      <Badge tone={r.stripe_status === 'payouts_enabled' ? 'success' : 'warn'} dot>
                        {(r.stripe_status || 'not_connected').replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td style={{ ...TD_BASE, fontFamily: T.ffMono, color: T.ink }}>
                      {r.referrals_count}
                    </td>
                    <td style={{ ...TD_BASE, fontFamily: T.ffMono, color: T.brandDeep, fontWeight: 600 }}>
                      {fmtCurrency(r.lifetime_earnings_cents)}
                    </td>
                    <td style={TD_BASE}>
                      <Badge tone={statusTone(r.status)} dot>{r.status}</Badge>
                    </td>
                    <td style={TD_BASE}>
                      <PartnerActionsMenu
                        partner={r}
                        busy={busyId === r.id}
                        onAction={(key) => handleAction(r, key)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ── Commissions tab ───────────────────────────────────────── */
function AdminCommissions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchAdminCommissions();
      if (cancelled) return;
      if (res.ok) setRows(res.commissions || []);
      else setError(res.error || 'Failed to load commissions');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const flagged = rows.filter((r) => r.status === 'flagged').length;

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ErrorBanner>{error}</ErrorBanner>
      {flagged > 0 && (
        <Card>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <AlertCircle size={18} color={T.amber} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.ffDisplay, fontSize: 13.5, fontWeight: 700, color: T.ink }}>
                {flagged} commission{flagged === 1 ? '' : 's'} flagged for review
              </div>
              <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
                Review before next payout run.
              </div>
            </div>
          </div>
        </Card>
      )}
      <Card padded={false}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${T.borderSoft}`,
            fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 700, color: T.ink,
          }}
        >
          Commission ledger
        </div>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyRow label="No commissions yet. Cleared invoices from referred customers will appear here." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: T.bgSubtle, textAlign: 'left' }}>
                {['Created','Partner','Referred customer','Invoice','Amount','Clears','Status'].map((h) => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i, arr) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}
                >
                  <td style={{ ...TD_BASE, fontFamily: T.ffMono, color: T.inkSoft }}>
                    {fmtDateShort(r.created_at)}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: T.ffDisplay, fontWeight: 600, color: T.ink }}>
                    {r.partner_label || r.partner_id}
                    {r.partner_ref_code && (
                      <div style={{ fontFamily: T.ffMono, fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}>
                        {r.partner_ref_code}
                      </div>
                    )}
                  </td>
                  <td style={{ ...TD_BASE, color: T.inkMuted }}>
                    {r.referred_label || '—'}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: T.ffMono, color: T.inkSoft }}>
                    {r.invoice_id || '—'}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: T.ffMono, fontWeight: 600, color: T.ink }}>
                    {fmtCurrency(r.amount_cents, r.currency)}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: T.ffMono, color: T.inkSoft }}>
                    {fmtDateShort(r.clears_at)}
                  </td>
                  <td style={TD_BASE}>
                    <Badge tone={statusTone(r.status)} dot>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ── Payout runs tab ───────────────────────────────────────── */
function AdminPayouts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchAdminPayouts();
      if (cancelled) return;
      if (res.ok) setRows(res.payouts || []);
      else setError(res.error || 'Failed to load payouts');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto' }}>
      <ErrorBanner>{error}</ErrorBanner>
      <Card padded={false}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${T.borderSoft}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <div style={{ fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 700, color: T.ink, flex: 1 }}>
            Payout runs
          </div>
          <button
            type="button"
            style={{ ...Btn.ghost, opacity: 0.55, cursor: 'not-allowed' }}
            disabled
            title="Payout-run engine not enabled yet"
          >
            <Play size={12} /> Dry-run next batch
          </button>
          <button
            type="button"
            style={{ ...Btn.primary, opacity: 0.55, cursor: 'not-allowed' }}
            disabled
            title="Payout-run engine not enabled yet"
          >
            <Send size={12} /> Run payout
          </button>
        </div>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyRow label="No payout runs yet. Monthly batches will appear here once the payout engine ships." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: T.bgSubtle, textAlign: 'left' }}>
                {['Period','Commissions','Amount','Stripe transfer','Run at','Status'].map((h) => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i, arr) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}
                >
                  <td style={{ ...TD_BASE, fontFamily: T.ffDisplay, fontWeight: 600, color: T.ink }}>
                    {r.period_start ? new Date(r.period_start).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: T.ffMono, color: T.inkMuted }}>
                    {r.commissions_count}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: T.ffMono, fontWeight: 600, color: T.brandDeep }}>
                    {fmtCurrency(r.amount_cents, r.currency)}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: T.ffMono, color: T.inkSoft }}>
                    {r.stripe_transfer_id || '—'}
                  </td>
                  <td style={{ ...TD_BASE, color: T.inkSoft, fontFamily: T.ffMono }}>
                    {r.paid_on ? new Date(r.paid_on).toLocaleString() : '—'}
                  </td>
                  <td style={TD_BASE}>
                    <Badge tone={statusTone(r.status)} dot>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ── Tiers tab ───────────────────────────────────────── */
function AdminTiers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchAdminTiers();
      if (cancelled) return;
      if (res.ok) setRows(res.tiers || []);
      else setError(res.error || 'Failed to load tiers');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ErrorBanner>{error}</ErrorBanner>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Info size={14} color={T.brand} />
          <div style={{ fontSize: 12.5, color: T.inkMuted }}>
            Tier rates are snapshotted on each commission row at time of earn. Editing a tier never retroactively
            changes cleared commissions.
          </div>
        </div>
      </Card>
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyRow label="No tiers configured. Run the affiliate migration to seed the default tiers." />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {rows.map((t) => (
            <Card key={t.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Badge tone={t.is_active ? 'brand' : 'neutral'}>{t.name}</Badge>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  style={{ ...Btn.quiet, opacity: 0.55, cursor: 'not-allowed' }}
                  disabled
                  title="Editing tiers is not enabled yet"
                >
                  <Pencil size={11} /> Edit
                </button>
              </div>
              <div style={{ fontFamily: T.ffMono, fontSize: 32, fontWeight: 600, color: T.brandDeep, lineHeight: 1 }}>
                {t.commission_pct}%
              </div>
              <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
                recurring for {t.commission_months} months
              </div>
              <div style={{ height: 1, background: T.borderSoft, margin: '14px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.inkMuted }}>
                <span>Min payout</span>
                <span style={{ fontFamily: T.ffMono, color: T.ink, fontWeight: 600 }}>
                  {fmtCurrency(t.min_payout_cents)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.inkMuted, marginTop: 6 }}>
                <span>Attribution</span>
                <span style={{ fontFamily: T.ffMono, color: T.ink, fontWeight: 600 }}>
                  {t.attribution_days} days
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.inkMuted, marginTop: 6 }}>
                <span>Active partners</span>
                <span style={{ fontFamily: T.ffMono, color: T.ink, fontWeight: 600 }}>
                  {t.partners_count}
                </span>
              </div>
              {t.description && (
                <div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 10, lineHeight: 1.5 }}>
                  {t.description}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────── */
export default function AdminPartnerProgram() {
  const [tab, setTab] = useState('applications');
  const [kpiTick, setKpiTick] = useState(0);
  const [pendingCount, setPendingCount] = useState(null);

  // Load the lightweight KPI summary once for the tab badge.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchAdminKpis();
      if (!cancelled && res.ok) {
        setPendingCount(typeof res.applications_pending === 'number' ? res.applications_pending : null);
      }
    })();
    return () => { cancelled = true; };
  }, [kpiTick]);

  return (
    <div
      style={{
        background: T.bgApp,
        flex: 1,
        minHeight: '100%',
        width: '100%',
        fontFamily: T.ffBody,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: '#fff',
          borderBottom: `1px solid ${T.border}`,
          padding: '20px 32px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 4, flexWrap: 'nowrap',
          }}
        >
          <div
            style={{
              fontFamily: T.ffDisplay, fontSize: 20, fontWeight: 700,
              letterSpacing: '-0.02em', color: T.ink, whiteSpace: 'nowrap',
            }}
          >
            Partner program · Admin
          </div>
          <Badge tone="violet" dot>Internal</Badge>
        </div>
        <div style={{ fontSize: 12.5, color: T.inkSoft }}>
          Applications, tiers, commissions, payouts. Changes are audit-logged.
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 18, marginBottom: -21, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const active = tab === t.k;
            const TabIcon = t.Icon;
            const showBadge = t.k === 'applications' && pendingCount != null && pendingCount > 0;
            return (
              <button
                key={t.k}
                type="button"
                onClick={() => setTab(t.k)}
                style={{
                  background: 'none', border: 'none',
                  padding: '10px 14px', fontSize: 13, fontWeight: 600,
                  fontFamily: T.ffDisplay,
                  color: active ? T.brand : T.inkSoft,
                  cursor: 'pointer',
                  borderBottom: active ? `2px solid ${T.brand}` : '2px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <TabIcon size={13} />
                {t.l}
                {showBadge && (
                  <span
                    style={{
                      background: T.brand, color: '#fff', fontSize: 10, fontWeight: 700,
                      padding: '1px 6px', borderRadius: 9999,
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', minHeight: 0 }}>
        {tab === 'applications' && (
          <AdminApplications onChange={() => setKpiTick((n) => n + 1)} />
        )}
        {tab === 'partners'    && <AdminPartners />}
        {tab === 'commissions' && <AdminCommissions />}
        {tab === 'payouts'     && <AdminPayouts />}
        {tab === 'tiers'       && <AdminTiers />}
      </div>
    </div>
  );
}
