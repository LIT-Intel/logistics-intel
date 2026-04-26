import React from 'react';
import {
  X,
  Info,
  ExternalLink,
  ArrowDownToLine,
  CheckCircle2,
  UserCheck,
  Building2,
  Landmark,
  IdCard,
  Loader,
  Lock,
  ArrowRight,
  Check,
} from 'lucide-react';
import { T, Btn } from './tokens';

const STEPS = [
  { l: 'Intro',       Icon: Info },
  { l: 'Stripe',      Icon: ExternalLink },
  { l: 'Return',      Icon: ArrowDownToLine },
  { l: 'Payouts on',  Icon: CheckCircle2 },
];

const STEP_INDEX = { intro: 0, redirecting: 1, returned: 2, verified: 3 };

export default function StripeConnectFlow({
  step = 'intro',
  onClose,
  onContinue,
  onFinish,
  onResume,
  disabled = false,
}) {
  const stepIdx = STEP_INDEX[step] ?? 0;

  return (
    <div
      style={{
        background: 'rgba(15,23,42,0.45)',
        backdropFilter: 'blur(6px)',
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: T.ffBody,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 18,
          boxShadow: T.shadowLg,
          width: '100%',
          maxWidth: 520,
          overflow: 'hidden',
        }}
      >
        {/* Stripe-branded header */}
        <div
          style={{
            background: 'linear-gradient(135deg,#635bff 0%,#4f46e5 100%)',
            padding: '28px 28px 22px',
            color: '#fff',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
            }}
          >
            <div
              style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'ui-serif,Georgia,serif',
                fontWeight: 700, fontSize: 18, letterSpacing: '-0.03em',
              }}
            >
              S
            </div>
            <div
              style={{
                fontFamily: T.ffDisplay,
                fontSize: 12.5, fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                opacity: 0.85,
              }}
            >
              Powered by Stripe · Express
            </div>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none', color: '#fff',
                width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <div
            style={{
              fontFamily: T.ffDisplay, fontSize: 22, fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            Connect payouts
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
            Stripe handles identity, tax, and bank verification. LIT never sees your details.
          </div>
        </div>

        {/* Stepper */}
        <div
          style={{
            padding: '18px 28px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {STEPS.map((s, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            const StepIcon = s.Icon;
            return (
              <React.Fragment key={s.l}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    color: active ? T.brand : done ? T.green : T.inkFaint,
                  }}
                >
                  <div
                    style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: done ? T.greenBg : active ? T.brandSoft : T.bgSunken,
                      border: `1.5px solid ${done ? T.green : active ? T.brand : T.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {done ? <Check size={11} /> : <StepIcon size={11} />}
                  </div>
                  <span
                    style={{
                      fontSize: 11.5, fontWeight: 600, fontFamily: T.ffDisplay,
                    }}
                  >
                    {s.l}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      flex: 1, height: 1.5,
                      background: done ? T.green : T.border,
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step body */}
        <div style={{ padding: '22px 28px 24px', minHeight: 230 }}>
          {step === 'intro' && (
            <>
              <div
                style={{
                  fontFamily: T.ffDisplay, fontSize: 15, fontWeight: 700,
                  color: T.ink, marginBottom: 10,
                }}
              >
                You'll need
              </div>
              {[
                { Icon: UserCheck, l: 'Legal name and address',           d: 'For tax reporting and identity verification.' },
                { Icon: Building2, l: 'Business details (if applicable)', d: 'Sole props can skip — personal account is fine.' },
                { Icon: Landmark,  l: 'Bank account or debit card',       d: 'Where Stripe sends your payouts.' },
                { Icon: IdCard,    l: 'Government ID (for some countries)', d: 'Stripe may ask for a photo of a passport or license.' },
              ].map((r) => {
                const RowIcon = r.Icon;
                return (
                  <div
                    key={r.l}
                    style={{
                      display: 'flex', gap: 11,
                      padding: '10px 0',
                      borderBottom: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <div
                      style={{
                        width: 28, height: 28, borderRadius: 7,
                        background: T.brandSoft,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <RowIcon size={13} color={T.brand} />
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: T.ffDisplay, fontSize: 13, fontWeight: 600,
                          color: T.ink,
                        }}
                      >
                        {r.l}
                      </div>
                      <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 1 }}>
                        {r.d}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {step === 'redirecting' && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div
                style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: T.brandSoft,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <ExternalLink size={22} color={T.brand} />
              </div>
              <div
                style={{
                  fontFamily: T.ffDisplay, fontSize: 16, fontWeight: 700,
                  color: T.ink, marginBottom: 6,
                }}
              >
                Opening Stripe…
              </div>
              <div
                style={{
                  fontSize: 13, color: T.inkSoft, maxWidth: 380, margin: '0 auto',
                }}
              >
                Complete onboarding in the new tab. Come back here when you're done — we'll confirm payout status automatically.
              </div>
            </div>
          )}

          {step === 'returned' && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div
                style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: T.amberBg,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <Loader size={22} color={T.amber} />
              </div>
              <div
                style={{
                  fontFamily: T.ffDisplay, fontSize: 16, fontWeight: 700,
                  color: T.ink, marginBottom: 6,
                }}
              >
                Verifying with Stripe
              </div>
              <div
                style={{
                  fontSize: 13, color: T.inkSoft, maxWidth: 380, margin: '0 auto',
                }}
              >
                This usually takes a few seconds. If Stripe needs more info, we'll show exactly what's missing.
              </div>
            </div>
          )}

          {step === 'verified' && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div
                style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: T.greenBg,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <CheckCircle2 size={22} color={T.green} />
              </div>
              <div
                style={{
                  fontFamily: T.ffDisplay, fontSize: 16, fontWeight: 700,
                  color: T.ink, marginBottom: 6,
                }}
              >
                Payouts enabled
              </div>
              <div
                style={{
                  fontSize: 13, color: T.inkSoft, maxWidth: 380, margin: '0 auto',
                }}
              >
                You're all set. Cleared commissions will be paid out on the 1st of each month.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 28px',
            borderTop: `1px solid ${T.borderSoft}`,
            display: 'flex', alignItems: 'center', gap: 10,
            background: T.bgSubtle,
          }}
        >
          <div
            style={{
              fontSize: 11.5, color: T.inkFaint, flex: 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Lock size={11} /> Stripe is a PCI-DSS Level 1 certified payments provider.
          </div>
          {step === 'intro' && (
            <button
              type="button"
              style={{
                ...Btn.primary,
                opacity: disabled ? 0.55 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
              disabled={disabled}
              onClick={onContinue}
            >
              Continue to Stripe <ArrowRight size={13} />
            </button>
          )}
          {step === 'redirecting' && (
            <button type="button" style={Btn.ghost} onClick={onFinish}>
              I finished onboarding
            </button>
          )}
          {step === 'returned' && (
            <button type="button" style={Btn.ghost} disabled>
              Checking status…
            </button>
          )}
          {step === 'verified' && (
            <button type="button" style={Btn.primary} onClick={onResume}>
              Go to dashboard <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
