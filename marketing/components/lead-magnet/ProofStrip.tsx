import { LogoTile } from "../sections/LogoTile";
import styles from "./lead-magnet.module.css";

type Props = {
  /** Optional override of the leading label. */
  label?: string;
  /** Bare domains, e.g. "chrobinson.com". Resolved by LogoTile via
   *  logo.dev (with NEXT_PUBLIC_LOGO_DEV_TOKEN) or Google's favicon CDN. */
  domains?: string[];
};

const DEFAULT_DOMAINS = [
  "chrobinson.com",
  "rxo.com",
  "echo.com",
  "dhl.com",
  "dsv.com",
  "expeditors.com",
];

const LABELS: Record<string, string> = {
  "chrobinson.com": "C.H. Robinson",
  "rxo.com": "RXO",
  "echo.com": "Echo Global Logistics",
  "dhl.com": "DHL",
  "dsv.com": "DSV",
  "expeditors.com": "Expeditors",
};

/**
 * Customer/social-proof logo strip. Greyscale styling lives on the
 * wrapper (`logoCloud` filter) so the underlying <LogoTile> imagery
 * remains untouched and accessible. Defers all logo fetching to the
 * shared LogoTile component — no inline img.logo.dev URLs.
 */
export function ProofStrip({
  label = "Trusted by freight revenue teams at",
  domains = DEFAULT_DOMAINS,
}: Props) {
  return (
    <section className="border-y border-white/5 bg-dark-0">
      <div className="mx-auto flex max-w-content flex-col items-center gap-5 px-4 py-8 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
          {label}
        </p>
        <div className={`${styles.logoCloud} flex flex-wrap items-center justify-center gap-x-6 gap-y-4 sm:gap-x-10`}>
          {domains.map((domain) => (
            <LogoTile
              key={domain}
              domain={domain}
              name={LABELS[domain] ?? domain}
              size="md"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
