// QueryInterpretation — visual feedback card that shows the user
// what Pulse parsed out of their natural-language prompt. Renders
// between the search hero and the prompt gallery / results, so the
// user sees the interpretation BEFORE pressing Enter.
//
// Each entity is a removable chip. Clicking the X rewrites the query
// to drop that entity (best-effort string replacement). The card
// fades in when there's at least one parsed entity, fades out when
// the query is empty.
//
// This is the "Coach reads your prompt" moment — paired with the
// dark-slate Pulse Coach branding so the interpretation feels like
// the AI is actively listening.

import {
  Box,
  Building2,
  Clock,
  Compass,
  Flag,
  Globe,
  Hash,
  HelpCircle,
  Loader2,
  MapPin,
  Ship,
  Sparkles,
  TrendingUp,
  User,
  Wand2,
  X,
} from 'lucide-react';

const DIRECTION_LABEL = {
  import: 'Importing',
  export: 'Exporting',
  ship: 'Shipping',
};

export default function QueryInterpretation({
  parsed,
  query,
  onChangeQuery,
  onRun,
  classifying,
}) {
  // Show the card when we have entities OR when an LLM call is in
  // flight (so the spinner appears even before the first result lands)
  if (!parsed?.hasAny && !classifying) return null;

  function removeFromQuery(needle) {
    if (!query || !needle) return;
    // Best-effort: remove the matched phrase (whole-word, case-insensitive)
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\s*\\b${escaped}\\b\\s*`, 'i');
    const next = query.replace(re, ' ').replace(/\s+/g, ' ').trim();
    onChangeQuery?.(next);
  }

  const intentLabel =
    parsed.intent === 'people' ? 'Find decision makers'
    : parsed.intent === 'lookalike' ? 'Find lookalikes'
    : 'Find companies';

  return (
    <div
      className="relative mt-3 overflow-hidden rounded-[14px] border"
      style={{
        background: 'linear-gradient(160deg, #0F172A 0%, #1E293B 60%, #102240 100%)',
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: '0 6px 22px rgba(15,23,42,0.18)',
      }}
    >
      {/* Cyan halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.22), transparent 70%)' }}
      />

      <div className="relative px-4 py-3">
        {/* Header */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-md border"
            style={{ background: 'rgba(0,240,255,0.12)', borderColor: 'rgba(0,240,255,0.35)' }}
          >
            <Sparkles className="h-3 w-3" style={{ color: '#00F0FF' }} />
          </div>
          <span
            className="font-display text-[10.5px] font-bold uppercase tracking-[0.08em]"
            style={{ color: '#00F0FF' }}
          >
            Pulse Coach reads your prompt
          </span>
          <span className="font-body text-[11px] text-slate-400">·</span>
          <span className="font-body text-[11px] text-slate-300">{intentLabel}</span>

          {classifying ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
              style={{ background: 'rgba(0,240,255,0.10)', color: '#7DD3FC' }}
            >
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Coach thinking…
            </span>
          ) : parsed?.source === 'llm' && parsed?.confidence != null ? (
            <span
              title={`LLM confidence ${Math.round(parsed.confidence * 100)}%`}
              className="font-mono inline-flex rounded-full px-1.5 py-0.5 text-[10px]"
              style={{ background: 'rgba(0,240,255,0.08)', color: '#7DD3FC' }}
            >
              {Math.round(parsed.confidence * 100)}%
            </span>
          ) : null}

          {/* Run button — gives the user a CTA inside the card */}
          {onRun && parsed?.hasAny ? (
            <button
              type="button"
              onClick={onRun}
              className="font-display ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition"
              style={{
                background: 'rgba(0,240,255,0.10)',
                borderColor: 'rgba(0,240,255,0.35)',
                color: '#7DD3FC',
              }}
            >
              <Sparkles className="h-2.5 w-2.5" />
              Run with these
            </button>
          ) : null}
        </div>

        {/* Clarifying question — surfaced when the LLM thought the
            prompt was ambiguous enough to ask. Only one at a time. */}
        {parsed?.clarifying_question ? (
          <div
            className="mb-2 flex items-start gap-2 rounded-md border px-2.5 py-2"
            style={{
              background: 'rgba(0,240,255,0.06)',
              borderColor: 'rgba(0,240,255,0.20)',
            }}
          >
            <HelpCircle className="mt-0.5 h-3 w-3 shrink-0" style={{ color: '#7DD3FC' }} />
            <span className="font-body text-[12px] leading-relaxed text-slate-200">
              {parsed.clarifying_question}
            </span>
          </div>
        ) : null}

        {/* Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {parsed.quantity ? (
            <Chip icon={Hash} label={`${parsed.quantity} results`} onRemove={() => removeFromQuery(`${parsed.quantity}`)} />
          ) : null}

          {parsed.direction ? (
            <Chip
              icon={Ship}
              label={DIRECTION_LABEL[parsed.direction] || parsed.direction}
              tone="cyan"
              onRemove={() => removeFromQuery(parsed.direction)}
            />
          ) : null}

          {parsed.similarTo ? (
            <Chip
              icon={Compass}
              label={`Like ${parsed.similarTo}`}
              tone="cyan"
              onRemove={() => removeFromQuery(parsed.similarTo)}
            />
          ) : null}

          {parsed.products.map((p) => (
            <Chip key={`p-${p}`} icon={Box} label={p} tone="amber" onRemove={() => removeFromQuery(p)} />
          ))}

          {parsed.industries.map((ind) => (
            <Chip key={`i-${ind}`} icon={Building2} label={cap(ind)} tone="violet" onRemove={() => removeFromQuery(ind)} />
          ))}

          {parsed.roles.map((r) => (
            <Chip key={`r-${r}`} icon={User} label={r} tone="violet" onRemove={() => removeFromQuery(r)} />
          ))}

          {parsed.origins.map((loc) => (
            <Chip
              key={`o-${loc.code}`}
              icon={Flag}
              label={`From ${loc.name}`}
              tone="green"
              onRemove={() => removeFromQuery(loc.alias || loc.name)}
            />
          ))}

          {parsed.destinations.map((loc) => (
            <Chip
              key={`d-${loc.code}`}
              icon={MapPin}
              label={`To ${loc.name}`}
              tone="green"
              onRemove={() => removeFromQuery(loc.alias || loc.name)}
            />
          ))}

          {/* Unscoped countries (no from/to context) */}
          {parsed.origins.length === 0 && parsed.destinations.length === 0 && parsed.countries.map((c) => (
            <Chip
              key={`c-${c.code}`}
              icon={Globe}
              label={c.name}
              tone="green"
              onRemove={() => removeFromQuery(c.alias || c.name)}
            />
          ))}
          {parsed.origins.length === 0 && parsed.destinations.length === 0 && parsed.states.map((s) => (
            <Chip
              key={`s-${s.code}`}
              icon={MapPin}
              label={s.name}
              tone="green"
              onRemove={() => removeFromQuery(s.name)}
            />
          ))}
          {parsed.metros.map((m) => (
            <Chip
              key={`m-${m.code}`}
              icon={MapPin}
              label={m.name}
              tone="green"
              onRemove={() => removeFromQuery(m.name)}
            />
          ))}
        </div>

        {/* Suggested refinements — surface the LLM's "try this" chips
            so the user can one-click into a tighter / broader search */}
        {parsed?.suggested_refinements?.length > 0 ? (
          <div className="mt-2.5 border-t border-white/5 pt-2">
            <div
              className="font-display mb-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em]"
              style={{ color: '#7DD3FC' }}
            >
              <Wand2 className="h-2.5 w-2.5" />
              Coach suggests
            </div>
            <div className="flex flex-wrap gap-1.5">
              {parsed.suggested_refinements.slice(0, 3).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onChangeQuery?.(suggestion)}
                  title="Replace your prompt with this refinement"
                  className="font-body inline-flex max-w-full items-center gap-1 truncate rounded-md border px-2 py-1 text-left text-[11px]"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderColor: 'rgba(255,255,255,0.10)',
                    color: '#E2E8F0',
                  }}
                >
                  <span className="truncate">{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Footer hint when freight filters are detected */}
        {(parsed?.direction || parsed?.products?.length || parsed?.origins?.length || parsed?.destinations?.length) ? (
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/5 pt-2 text-[10.5px] text-slate-400">
            <TrendingUp className="h-2.5 w-2.5" style={{ color: '#7DD3FC' }} />
            Freight filters will narrow the cache-first search against your saved companies.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Chip({ icon: Icon, label, tone, onRemove }) {
  const map = {
    default: { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.10)', color: '#E2E8F0' },
    cyan:    { bg: 'rgba(0,240,255,0.10)',   border: 'rgba(0,240,255,0.30)',   color: '#7DD3FC' },
    green:   { bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.30)',   color: '#86EFAC' },
    violet:  { bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.30)',  color: '#C4B5FD' },
    amber:   { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  color: '#FCD34D' },
  };
  const c = map[tone] || map.default;
  return (
    <span
      className="font-display inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: c.bg, borderColor: c.border, color: c.color }}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{label}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="ml-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10"
        >
          <X className="h-2 w-2" />
        </button>
      ) : null}
    </span>
  );
}

function cap(s) {
  return String(s || '').replace(/\b\w/g, (m) => m.toUpperCase());
}
