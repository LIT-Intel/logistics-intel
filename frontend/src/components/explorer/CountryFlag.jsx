// Image-based country flag.
//
// WHY: Unicode regional-indicator flag emoji (🇺🇸) DON'T render on Windows
// desktop browsers — Chrome/Edge on Windows ship no flag-emoji font, so the
// glyph falls back to the bare "US" letters or an empty box. They render fine
// on macOS / iOS / Android, which is why flags "work on mobile but not
// desktop." Rendering a real <img> from flagcdn fixes it on every platform.
//
// Accepts any messy country value (ISO-2, "USA", "Or 97005, Us"), normalises
// to a lowercase ISO-2, and renders nothing when it can't resolve one so
// callers can drop it inline without a null-check wrapper.

function normIso(code) {
  if (!code || typeof code !== 'string') return '';
  const t = code.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(t)) return t.toLowerCase();
  if (/\b(US|USA|U\.S(\.A)?)\b/.test(t)) return 'us';
  const m = t.match(/[A-Z]{2}/);
  return m ? m[0].toLowerCase() : '';
}

export default function CountryFlag({ code, size = 14, className = '' }) {
  const iso = normIso(code);
  if (!iso) return null;
  // 4:3 flag aspect. Request 2× width from flagcdn for crispness on retina.
  const w = Math.round((size * 4) / 3);
  return (
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      srcSet={`https://flagcdn.com/w80/${iso}.png 2x`}
      width={w}
      height={size}
      loading="lazy"
      decoding="async"
      alt=""
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-[2px] object-cover ring-1 ring-black/5 ${className}`}
      style={{ width: w, height: size }}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}
