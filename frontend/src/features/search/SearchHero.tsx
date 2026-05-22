// SearchHero — marketing-grade hero block for /app/search.
//
// Pattern mirrors marketing/components/PageHero (inner-page CTA tier,
// not the dark marketing-hero tier — this is an in-app working page):
//   - SEARCH eyebrow pill in brand-blue
//   - Space Grotesk display H1 with a blue→violet gradient phrase
//   - DM Sans subhead, max-w-2xl centered
//
// Render only when `showHero` is true. Search.tsx hides this once a
// search has been submitted so the results list has full vertical room.

type Props = {
  showHero: boolean;
};

export default function SearchHero({ showHero }: Props) {
  if (!showHero) return null;
  return (
    <div className="mx-auto mt-2 mb-6 max-w-3xl px-4 text-center">
      <span
        className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700"
      >
        Search
      </span>
      <h1 className="font-display mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
        Find{" "}
        <em className="not-italic bg-[linear-gradient(90deg,#3b82f6_0%,#6366f1_60%,#8b5cf6_100%)] bg-clip-text text-transparent">
          any company
        </em>
        . View their trade picture.
      </h1>
      <p className="font-body mt-5 max-w-2xl mx-auto text-base leading-relaxed text-ink-500 sm:text-lg">
        Search 1.4M+ shippers by name. See who they import from, ship
        to, and how often.
      </p>
    </div>
  );
}
