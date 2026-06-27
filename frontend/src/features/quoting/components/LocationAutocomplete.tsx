/**
 * LocationAutocomplete — assistive type-ahead for US city/state/zip fields.
 *
 * Uses Photon (komoot's free OSM autocomplete — no API key, CORS-enabled,
 * callable directly from the browser). Suggestions are assistive only: the
 * field still works as a plain text input, and Photon downtime can never break
 * the form (fetch failures are swallowed and simply show no suggestions).
 *
 * Drop-in replacement for the lane-form city <input>: it writes the same string
 * via onChange so downstream effects (e.g. auto-mileage) keep working.
 */
import { useEffect, useRef, useState } from "react";

interface PhotonProps {
  name?: string;
  city?: string;
  state?: string;
  postcode?: string;
  countrycode?: string;
}

interface PhotonFeature {
  properties?: PhotonProps;
  geometry?: { coordinates?: [number, number] };
}

/** Full US state/territory name → 2-letter abbreviation (50 states + DC). */
const STATE_ABBR: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  "District of Columbia": "DC",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

function formatLabel(props: PhotonProps): string {
  const city = props.city || props.name || "";
  const st = STATE_ABBR[props.state ?? ""] ?? props.state ?? "";
  const zip = props.postcode ?? "";
  return [city, [st, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

const inputCls =
  "h-10 w-full rounded-[9px] border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/15";

export interface LocationAutocompleteProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: LocationAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  // Monotonic request id — only the latest query's response is allowed to win.
  const reqIdRef = useRef(0);
  // Suppress the next fetch after a programmatic select (so picking a suggestion
  // doesn't immediately re-open the dropdown).
  const skipNextRef = useRef(false);

  // Debounced Photon fetch keyed on `value`.
  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const reqId = ++reqIdRef.current;
    setLoading(true);
    const t = setTimeout(() => {
      const url =
        "https://photon.komoot.io/api/?q=" +
        encodeURIComponent(q) +
        "&limit=6&lang=en";
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
        .then((data: { features?: PhotonFeature[] }) => {
          // Stale-response guard: ignore anything but the latest request.
          if (reqId !== reqIdRef.current) return;
          const labels: string[] = [];
          const seen = new Set<string>();
          for (const f of data.features ?? []) {
            const props = f.properties;
            if (!props || props.countrycode !== "US") continue;
            const label = formatLabel(props);
            if (!label || seen.has(label)) continue;
            seen.add(label);
            labels.push(label);
            if (labels.length >= 6) break;
          }
          setSuggestions(labels);
          setHighlight(-1);
          setOpen(true);
          setLoading(false);
        })
        .catch(() => {
          // Graceful degradation: swallow errors, show no suggestions.
          if (reqId !== reqIdRef.current) return;
          setSuggestions([]);
          setLoading(false);
        });
    }, 250);

    return () => clearTimeout(t);
  }, [value]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const select = (label: string) => {
    skipNextRef.current = true;
    onChange(label);
    setSuggestions([]);
    setOpen(false);
    setHighlight(-1);
  };

  const showDropdown = open && (loading || suggestions.length > 0);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        setOpen(true);
        setHighlight(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1 >= suggestions.length ? 0 : h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 < 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === "Enter") {
      if (highlight >= 0 && highlight < suggestions.length) {
        e.preventDefault();
        select(suggestions[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className={className ?? inputCls}
        autoComplete="off"
      />
      {showDropdown && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-[9px] border border-slate-200 bg-white py-1 shadow-lg">
          {loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-slate-400">Searching…</li>
          )}
          {suggestions.map((s, i) => (
            <li
              key={s}
              // onMouseDown (not onClick) so selection fires before the input's
              // blur, keeping the click reliable.
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={
                "cursor-pointer px-3 py-2 text-[13px] text-slate-900 " +
                (i === highlight ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50")
              }
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
