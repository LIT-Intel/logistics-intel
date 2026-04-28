// Universal "limit reached" UI for the LIMIT_EXCEEDED contract.
// Two surfaces:
//   <UpgradeRequiredModal limit={...} onClose={...} /> for blocking modals
//   <UpgradeRequiredInline limit={...} /> for inline banners on actions

import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import type { LimitExceeded } from '@/lib/usage';
import { FEATURE_LABELS } from '@/lib/usage';

function planLabel(plan: string) {
  if (plan === 'free_trial') return 'Free';
  if (plan === 'starter') return 'Starter';
  if (plan === 'growth') return 'Growth';
  if (plan === 'enterprise') return 'Enterprise';
  return plan;
}

function formatReset(reset?: string | null): string | null {
  if (!reset) return null;
  try {
    return new Date(reset).toLocaleDateString(undefined, {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch {
    return null;
  }
}

interface Props {
  limit: LimitExceeded;
  onClose?: () => void;
}

export function UpgradeRequiredModal({ limit, onClose }: Props) {
  const navigate = useNavigate();
  const label = FEATURE_LABELS[limit.feature] ?? { singular: limit.feature, plural: limit.feature, verb: 'do that' };
  const reset = formatReset(limit.reset_at);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: '#FFFFFF',
          borderRadius: 14,
          border: '1px solid #E5E7EB',
          boxShadow: '0 12px 40px rgba(15,23,42,0.18)',
          padding: 24,
          position: 'relative',
        }}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute', top: 12, right: 12,
              width: 28, height: 28, borderRadius: 8,
              border: 'none', background: '#F1F5F9', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#64748b',
            }}
          >
            <X size={14} />
          </button>
        )}
        <div
          style={{
            width: 48, height: 48, borderRadius: 12,
            background: '#FFFBEB',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <AlertTriangle size={22} color="#b45309" />
        </div>
        <div
          style={{
            fontSize: 20, fontWeight: 700,
            color: '#0F172A', letterSpacing: '-0.02em',
          }}
        >
          You've reached your {planLabel(limit.plan)} plan limit
        </div>
        <div style={{ fontSize: 14, color: '#475569', marginTop: 8, lineHeight: 1.55 }}>
          {planLabel(limit.plan)} includes <strong>{limit.limit}</strong>{' '}
          {label.plural}{reset ? ' per month' : ''}. You've used <strong>{limit.used}</strong>.
          Upgrade to continue.
        </div>
        {reset && (
          <div
            style={{
              fontSize: 12.5, color: '#94a3b8',
              background: '#F8FAFC', borderRadius: 8,
              padding: '8px 12px', marginTop: 14,
              border: '1px solid #EEF2F7',
            }}
          >
            Limit resets {reset}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 14px', borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#FFFFFF',
                color: '#475569', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Not now
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onClose?.();
              navigate(limit.upgrade_url || '/app/billing');
            }}
            style={{
              padding: '9px 16px', borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(180deg,#3B82F6,#2563EB)',
              color: '#FFFFFF', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 1px 4px rgba(59,130,246,0.3)',
            }}
          >
            Upgrade plan
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function UpgradeRequiredInline({ limit }: { limit: LimitExceeded }) {
  const navigate = useNavigate();
  const label = FEATURE_LABELS[limit.feature] ?? { singular: limit.feature, plural: limit.feature, verb: 'do that' };
  return (
    <div
      style={{
        background: '#FFFBEB',
        border: '1px solid #FDE68A',
        borderRadius: 10,
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 13, color: '#475569',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <AlertTriangle size={16} color="#b45309" />
      <div style={{ flex: 1 }}>
        <strong style={{ color: '#0F172A' }}>
          {planLabel(limit.plan)} plan includes {limit.limit} {label.plural}.
        </strong>{' '}
        You've used {limit.used}. Upgrade to continue.
      </div>
      <button
        type="button"
        onClick={() => navigate(limit.upgrade_url || '/app/billing')}
        style={{
          padding: '7px 14px', borderRadius: 8,
          border: 'none',
          background: 'linear-gradient(180deg,#3B82F6,#2563EB)',
          color: '#FFFFFF', fontSize: 12.5, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        Upgrade
        <ArrowRight size={12} />
      </button>
    </div>
  );
}
