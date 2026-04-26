import { useState } from 'react';
import {
  Hourglass,
  ArrowLeft,
  ArrowRight,
  Send,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { T, Btn } from './tokens';
import { Badge, Card } from './primitives';

function Field({
  label,
  placeholder,
  multiline,
  value,
  onChange,
  disabled,
  error,
  required,
}) {
  const base = {
    width: '100%',
    background: T.bgSubtle,
    border: `1.5px solid ${error ? T.red : T.border}`,
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
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span>{label}</span>
        {required && <span style={{ color: T.red, fontWeight: 700 }}>*</span>}
      </div>
      {multiline ? (
        <textarea
          rows={3}
          placeholder={placeholder}
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
          style={{ ...base, resize: 'vertical', minHeight: 76 }}
        />
      ) : (
        <input
          placeholder={placeholder}
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
          style={base}
        />
      )}
      {error && (
        <div
          style={{
            fontSize: 11.5, color: T.red, marginTop: 4,
            fontFamily: T.ffDisplay, fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

const VOLUME_OPTIONS = ['< 5 / mo', '5–20 / mo', '20+ / mo', 'Not sure yet'];

const INITIAL_FORM = {
  full_name: '',
  company_or_brand: '',
  website_or_linkedin: '',
  country: '',
  audience_description: '',
  audience_size: '',
  primary_channels: '',
  expected_referral_volume: '',
  accepted_partner_terms: false,
  accepted_stripe_ack: false,
};

export default function AffiliateApplication({
  state = 'form',
  onSubmit,
  submittedAt,
  reviewer,
  rejectionReason,
  backendUnavailable = false,
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggle = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.checked }));

  function validateStep(s) {
    const e = {};
    if (s === 1) {
      if (!form.full_name.trim()) e.full_name = 'Required';
      if (!form.company_or_brand.trim()) e.company_or_brand = 'Required';
    }
    if (s === 2) {
      if (!form.audience_description.trim()) e.audience_description = 'Required';
      if (!form.primary_channels.trim()) e.primary_channels = 'Required';
    }
    if (s === 3) {
      if (!form.accepted_partner_terms)
        e.accepted_partner_terms = 'Must accept partner terms';
      if (!form.accepted_stripe_ack)
        e.accepted_stripe_ack = 'Must acknowledge Stripe payouts';
    }
    return e;
  }

  function goNext() {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setStep((s) => Math.min(3, s + 1));
  }

  async function handleSubmit() {
    setSubmitError(null);
    const all = { ...validateStep(1), ...validateStep(2), ...validateStep(3) };
    setErrors(all);
    if (Object.keys(all).length > 0) {
      // Jump back to first step that has errors.
      if (validateStep(1) && Object.keys(validateStep(1)).length) setStep(1);
      else if (Object.keys(validateStep(2)).length) setStep(2);
      else setStep(3);
      return;
    }
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      const result = await onSubmit({
        full_name: form.full_name.trim(),
        company_or_brand: form.company_or_brand.trim(),
        website_or_linkedin: form.website_or_linkedin.trim() || null,
        country: form.country.trim() || null,
        audience_description: form.audience_description.trim(),
        audience_size: form.audience_size.trim() || null,
        primary_channels: form.primary_channels.trim(),
        expected_referral_volume: form.expected_referral_volume.trim() || null,
        accepted_partner_terms: form.accepted_partner_terms,
        accepted_stripe_ack: form.accepted_stripe_ack,
      });
      if (result && result.ok === false) {
        setSubmitError(
          result.code === 'ALREADY_PARTNER'
            ? 'You are already an approved partner.'
            : result.code === 'VALIDATION_FAILED'
              ? 'Please fix the highlighted fields.'
              : result.error || 'Submission failed.'
        );
        if (result.errors) setErrors(result.errors);
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unexpected error submitting application.'
      );
    } finally {
      setSubmitting(false);
    }
  }

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

        {submitError && !backendUnavailable && (
          <div
            style={{
              background: T.redBg,
              border: `1px solid ${T.redBorder}`,
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <AlertTriangle size={16} color={T.red} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12.5, color: T.inkMuted, lineHeight: 1.5 }}>
              <strong style={{ color: T.red, fontFamily: T.ffDisplay }}>
                Couldn&apos;t submit application.
              </strong>{' '}
              {submitError}
            </div>
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
              <Field
                label="Full name"
                placeholder="Jordan Davis"
                value={form.full_name}
                onChange={update('full_name')}
                disabled={backendUnavailable || submitting}
                error={errors.full_name}
                required
              />
              <Field
                label="Company or brand"
                placeholder="Nordic Freight Advisory"
                value={form.company_or_brand}
                onChange={update('company_or_brand')}
                disabled={backendUnavailable || submitting}
                error={errors.company_or_brand}
                required
              />
              <Field
                label="Website or LinkedIn"
                placeholder="https://"
                value={form.website_or_linkedin}
                onChange={update('website_or_linkedin')}
                disabled={backendUnavailable || submitting}
              />
              <Field
                label="Country"
                placeholder="United States"
                value={form.country}
                onChange={update('country')}
                disabled={backendUnavailable || submitting}
              />
            </div>
          )}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field
                label="Describe your audience"
                multiline
                placeholder="Who follows you, reads your newsletter, or hires you?"
                value={form.audience_description}
                onChange={update('audience_description')}
                disabled={backendUnavailable || submitting}
                error={errors.audience_description}
                required
              />
              <Field
                label="Audience size"
                placeholder="e.g. 4,200 newsletter subscribers"
                value={form.audience_size}
                onChange={update('audience_size')}
                disabled={backendUnavailable || submitting}
              />
              <Field
                label="Primary channels"
                placeholder="Newsletter, LinkedIn, podcast, direct advisory…"
                value={form.primary_channels}
                onChange={update('primary_channels')}
                disabled={backendUnavailable || submitting}
                error={errors.primary_channels}
                required
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
                  {VOLUME_OPTIONS.map((o) => {
                    const selected = form.expected_referral_volume === o;
                    return (
                      <label
                        key={o}
                        style={{
                          ...Btn.ghost,
                          padding: '8px 12px',
                          fontSize: 12,
                          cursor: backendUnavailable || submitting ? 'not-allowed' : 'pointer',
                          fontWeight: 500,
                          opacity: backendUnavailable || submitting ? 0.6 : 1,
                          borderColor: selected ? T.brand : T.border,
                          color: selected ? T.brand : T.inkMuted,
                          background: selected ? T.brandSoft : '#FFFFFF',
                        }}
                      >
                        <input
                          type="radio"
                          name="vol"
                          checked={selected}
                          onChange={() =>
                            setForm((f) => ({ ...f, expected_referral_volume: o }))
                          }
                          disabled={backendUnavailable || submitting}
                          style={{ marginRight: 6 }}
                        />
                        {o}
                      </label>
                    );
                  })}
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
                  checked={form.accepted_partner_terms}
                  onChange={toggle('accepted_partner_terms')}
                  disabled={backendUnavailable || submitting}
                  style={{ marginTop: 3 }}
                />
                <span>
                  I agree to the{' '}
                  <a href="#" style={{ color: T.brand, textDecoration: 'underline' }}>
                    Partner Agreement
                  </a>{' '}
                  and{' '}
                  <a href="#" style={{ color: T.brand, textDecoration: 'underline' }}>
                    Brand Guidelines
                  </a>
                  . Final rate set at approval.
                </span>
              </label>
              {errors.accepted_partner_terms && (
                <div
                  style={{
                    fontSize: 11.5, color: T.red, marginLeft: 26,
                    fontFamily: T.ffDisplay, fontWeight: 500,
                  }}
                >
                  {errors.accepted_partner_terms}
                </div>
              )}
              <label
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9,
                  fontSize: 13, color: T.inkMuted, lineHeight: 1.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={form.accepted_stripe_ack}
                  onChange={toggle('accepted_stripe_ack')}
                  disabled={backendUnavailable || submitting}
                  style={{ marginTop: 3 }}
                />
                <span>
                  I understand payouts are made via Stripe Connect Express and require identity verification.
                </span>
              </label>
              {errors.accepted_stripe_ack && (
                <div
                  style={{
                    fontSize: 11.5, color: T.red, marginLeft: 26,
                    fontFamily: T.ffDisplay, fontWeight: 500,
                  }}
                >
                  {errors.accepted_stripe_ack}
                </div>
              )}
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
            disabled={submitting}
          >
            <ArrowLeft size={13} /> Back
          </button>
          {step < 3 ? (
            <button
              type="button"
              style={Btn.primary}
              onClick={goNext}
              disabled={submitting}
            >
              Continue <ArrowRight size={13} />
            </button>
          ) : (
            <button
              type="button"
              style={{
                ...Btn.primary,
                opacity: backendUnavailable || submitting ? 0.55 : 1,
                cursor: backendUnavailable || submitting ? 'not-allowed' : 'pointer',
              }}
              disabled={backendUnavailable || submitting}
              title={
                backendUnavailable
                  ? 'Application backend not enabled yet'
                  : undefined
              }
              onClick={handleSubmit}
            >
              {backendUnavailable
                ? 'Submissions disabled'
                : submitting
                  ? 'Submitting…'
                  : 'Submit application'}{' '}
              <Send size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
