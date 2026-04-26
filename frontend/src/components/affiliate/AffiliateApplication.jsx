import React, { useState } from 'react';
import {
  Hourglass,
  ArrowLeft,
  ArrowRight,
  Send,
  XCircle,
} from 'lucide-react';
import { T, Btn } from './tokens';
import { Badge, Card } from './primitives';

function Field({ label, placeholder, multiline, value, onChange, disabled }) {
  const base = {
    width: '100%',
    background: T.bgSubtle,
    border: `1.5px solid ${T.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13.5,
    fontFamily: T.ffBody,
    color: T.ink,
    outline: 'none',
    opacity: disabled ? 0.6 : 1,
  };
  return (
    <div>
      <div
        style={{
          fontSize: 12, fontWeight: 600, fontFamily: T.ffDisplay,
          color: T.inkMuted, marginBottom: 6,
        }}
      >
        {label}
      </div>
      {multiline ? (
        <textarea
          rows={3}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          style={{ ...base, resize: 'vertical', minHeight: 76 }}
        />
      ) : (
        <input
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          style={base}
        />
      )}
    </div>
  );
}

export default function AffiliateApplication({
  state = 'form',
  onSubmit,
  submittedAt,
  reviewer,
  rejectionReason,
  backendUnavailable = false,
}) {
  const [step, setStep] = useState(1);

  if (state === 'pending') {
    return (
      <div
        style={{
          background: T.bgApp, minHeight: '100%',
          padding: '56px 40px', fontFamily: T.ffBody,
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Card style={{ padding: 36, textAlign: 'center' }}>
            <div
              style={{
                width: 52, height: 52, borderRadius: 12,
                background: T.amberBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 18px',
              }}
            >
              <Hourglass size={22} color={T.amber} />
            </div>
            <div
              style={{
                fontFamily: T.ffDisplay, fontSize: 22, fontWeight: 700,
                color: T.ink, letterSpacing: '-0.02em',
              }}
            >
              Application under review
            </div>
            <div
              style={{
                fontSize: 13.5, color: T.inkSoft,
                marginTop: 10, lineHeight: 1.55,
                maxWidth: 420, margin: '10px auto 0',
              }}
            >
              Thanks for applying. Our partnerships team reviews every application — expect a response within 2 business days.
            </div>
            <div
              style={{
                display: 'flex', gap: 16, justifyContent: 'center',
                marginTop: 24, paddingTop: 20,
                borderTop: `1px solid ${T.borderSoft}`,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10.5, color: T.inkFaint, fontFamily: T.ffDisplay,
                    fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}
                >
                  Submitted
                </div>
                <div style={{ fontFamily: T.ffMono, fontSize: 13, color: T.ink, marginTop: 3 }}>
                  {submittedAt || '—'}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10.5, color: T.inkFaint, fontFamily: T.ffDisplay,
                    fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}
                >
                  Status
                </div>
                <div style={{ marginTop: 3 }}>
                  <Badge tone="warn" dot>Pending review</Badge>
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10.5, color: T.inkFaint, fontFamily: T.ffDisplay,
                    fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}
                >
                  Reviewer
                </div>
                <div style={{ fontFamily: T.ffMono, fontSize: 13, color: T.ink, marginTop: 3 }}>
                  {reviewer || '—'}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (state === 'rejected') {
    return (
      <div
        style={{
          background: T.bgApp, minHeight: '100%',
          padding: '56px 40px', fontFamily: T.ffBody,
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Card style={{ padding: 36, textAlign: 'center' }}>
            <div
              style={{
                width: 52, height: 52, borderRadius: 12,
                background: T.redBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 18px',
              }}
            >
              <XCircle size={22} color={T.red} />
            </div>
            <div
              style={{
                fontFamily: T.ffDisplay, fontSize: 22, fontWeight: 700,
                color: T.ink, letterSpacing: '-0.02em',
              }}
            >
              Application not accepted
            </div>
            <div
              style={{
                fontSize: 13.5, color: T.inkSoft,
                marginTop: 10, lineHeight: 1.55,
                maxWidth: 460, margin: '10px auto 0',
              }}
            >
              {rejectionReason ||
                'Your partner program application wasn’t accepted at this time. You’re welcome to reapply once your audience or channels evolve.'}
            </div>
            <div style={{ marginTop: 24 }}>
              <Badge tone="danger" dot>Not accepted</Badge>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // state === 'form'
  return (
    <div
      style={{
        background: T.bgApp, minHeight: '100%',
        padding: '40px 40px', fontFamily: T.ffBody,
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 22 }}>
          <Badge tone="brand">Become a partner</Badge>
          <h1
            style={{
              fontFamily: T.ffDisplay, fontSize: 30, fontWeight: 700,
              letterSpacing: '-0.025em', marginTop: 12, color: T.ink,
            }}
          >
            Apply to the LIT Partner Program
          </h1>
          <p
            style={{
              fontSize: 14, color: T.inkSoft,
              marginTop: 8, lineHeight: 1.55,
            }}
          >
            Tell us about your audience and how you'd like to work with us. Reviewed within 2 business days.
          </p>
        </div>

        {backendUnavailable && (
          <div
            style={{
              background: T.amberBg,
              border: `1px solid ${T.amberBorder}`,
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 18,
              fontSize: 12.5,
              color: T.inkMuted,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: T.amber, fontFamily: T.ffDisplay }}>
              Application backend not enabled yet.
            </strong>{' '}
            You can preview the form below, but submissions can&apos;t be saved until the partner program backend is live.
            Email{' '}
            <a
              href="mailto:partnerships@logisticintel.com"
              style={{ color: T.brand, textDecoration: 'underline' }}
            >
              partnerships@logisticintel.com
            </a>{' '}
            to express interest in the meantime.
          </div>
        )}

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {['You', 'Audience', 'Agreement'].map((s, i) => (
            <div
              key={s}
              style={{
                flex: 1, height: 4, borderRadius: 2,
                background: step >= i + 1 ? T.brand : T.bgSunken,
              }}
            />
          ))}
        </div>

        <Card style={{ padding: 28 }}>
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Full name" placeholder="Jordan Davis" disabled={backendUnavailable} />
              <Field label="Company or brand" placeholder="Nordic Freight Advisory" disabled={backendUnavailable} />
              <Field label="Website or LinkedIn" placeholder="https://" disabled={backendUnavailable} />
              <Field label="Country" placeholder="United States" disabled={backendUnavailable} />
            </div>
          )}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field
                label="Describe your audience"
                multiline
                placeholder="Who follows you, reads your newsletter, or hires you?"
                disabled={backendUnavailable}
              />
              <Field
                label="Audience size"
                placeholder="e.g. 4,200 newsletter subscribers"
                disabled={backendUnavailable}
              />
              <Field
                label="Primary channels"
                placeholder="Newsletter, LinkedIn, podcast, direct advisory…"
                disabled={backendUnavailable}
              />
              <div>
                <div
                  style={{
                    fontSize: 12, fontWeight: 600, fontFamily: T.ffDisplay,
                    color: T.inkMuted, marginBottom: 6,
                  }}
                >
                  Expected referral volume
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['< 5 / mo', '5–20 / mo', '20+ / mo', 'Not sure yet'].map((o) => (
                    <label
                      key={o}
                      style={{
                        ...Btn.ghost, padding: '8px 12px', fontSize: 12,
                        cursor: backendUnavailable ? 'not-allowed' : 'pointer',
                        fontWeight: 500, opacity: backendUnavailable ? 0.6 : 1,
                      }}
                    >
                      <input
                        type="radio"
                        name="vol"
                        disabled={backendUnavailable}
                        style={{ marginRight: 6 }}
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  background: T.brandSoft,
                  border: `1px solid ${T.brandBorder}`,
                  borderRadius: 10, padding: 16,
                }}
              >
                <div
                  style={{
                    fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 700,
                    color: T.brandDeep, marginBottom: 6,
                  }}
                >
                  Proposed terms
                </div>
                <ul
                  style={{
                    fontSize: 13, color: T.inkMuted, lineHeight: 1.8,
                    paddingLeft: 18, margin: 0,
                  }}
                >
                  <li>
                    Starter tier: <strong>30% recurring for 12 months</strong>{' '}
                    <span style={{ color: T.inkFaint }}>
                      (program terms subject to approval)
                    </span>
                  </li>
                  <li>90-day attribution window</li>
                  <li>$50 minimum payout, monthly batch via Stripe Connect</li>
                  <li>No brand-bidding on paid search</li>
                </ul>
              </div>
              <label
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9,
                  fontSize: 13, color: T.inkMuted, lineHeight: 1.5,
                }}
              >
                <input
                  type="checkbox"
                  disabled={backendUnavailable}
                  style={{ marginTop: 3 }}
                />
                I agree to the{' '}
                <a href="#" style={{ color: T.brand, textDecoration: 'underline' }}>
                  Partner Agreement
                </a>{' '}
                and{' '}
                <a href="#" style={{ color: T.brand, textDecoration: 'underline' }}>
                  Brand Guidelines
                </a>
                . Final rate set at approval.
              </label>
              <label
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9,
                  fontSize: 13, color: T.inkMuted, lineHeight: 1.5,
                }}
              >
                <input
                  type="checkbox"
                  disabled={backendUnavailable}
                  style={{ marginTop: 3 }}
                />
                I understand payouts are made via Stripe Connect Express and require identity verification.
              </label>
            </div>
          )}
        </Card>

        <div
          style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 18,
          }}
        >
          <button
            type="button"
            style={{
              ...Btn.ghost,
              visibility: step > 1 ? 'visible' : 'hidden',
            }}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            <ArrowLeft size={13} /> Back
          </button>
          {step < 3 ? (
            <button
              type="button"
              style={Btn.primary}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue <ArrowRight size={13} />
            </button>
          ) : (
            <button
              type="button"
              style={{
                ...Btn.primary,
                opacity: backendUnavailable ? 0.55 : 1,
                cursor: backendUnavailable ? 'not-allowed' : 'pointer',
              }}
              disabled={backendUnavailable}
              title={
                backendUnavailable
                  ? 'Application backend not enabled yet'
                  : undefined
              }
              onClick={onSubmit}
            >
              {backendUnavailable
                ? 'Submissions disabled'
                : 'Submit application'}{' '}
              <Send size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
