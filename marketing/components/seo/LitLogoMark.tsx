/**
 * LIT logo mark — same SVG as the in-app LitAppIcon, scaled into a
 * slate-950 box. The `alive` prop applies the cyan breathing animation
 * (mount-burst + slow ambient pulse) for marketing-site placements
 * where the brand voice should feel "intelligence is online."
 */
export function LitLogoMark({ size = 32, alive = false }: { size?: number; alive?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center justify-center bg-dark-0 ring-1 ring-white/5",
        alive ? "animate-lit-alive" : "",
      ].join(" ")}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none">
        <path d="M4 4v16h7.8" stroke="#00F0FF" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.35 4h9.65" stroke="#00F0FF" strokeWidth="2.25" strokeLinecap="round" />
        <path d="M10.35 10h4.2" stroke="#00F0FF" strokeWidth="2.25" strokeLinecap="round" />
        <path d="M15.85 10v9.9" stroke="#00F0FF" strokeWidth="2.25" strokeLinecap="round" />
        <path d="M10.35 19.9h5.5" stroke="#00F0FF" strokeWidth="2.25" strokeLinecap="round" />
      </svg>
    </span>
  );
}
