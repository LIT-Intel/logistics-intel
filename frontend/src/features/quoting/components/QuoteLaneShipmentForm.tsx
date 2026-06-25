/**
 * QuoteLaneShipmentForm — THE mode-aware lane/shipment section.
 *
 * Domain rule (the whole point of this component):
 *   - International (ocean/air): show ports/airports + Incoterms.
 *   - Drayage: port/ramp origin + city/state/zip dest, NO incoterms.
 *   - Domestic (ftl/ltl): city/state/zip address fields + miles. NEVER ports,
 *     NEVER incoterms.
 *
 * Fields are driven entirely by `MODE_FIELDS`, `SERVICE_TYPES`, `USES_INCOTERMS`,
 * and `CATEGORY` from `@/lib/quoting/modeFields` so the form stays in lockstep
 * with the shared config.
 */
import { Ship, Plane, Truck, Container } from "lucide-react";
import type { QuoteMode } from "@/api/quoting";
import {
  SERVICE_TYPES,
  CATEGORY,
  USES_INCOTERMS,
  MODE_FIELDS,
} from "@/lib/quoting/modeFields";

/** The slice of builder state this form reads/writes. */
export interface LaneFields {
  mode: QuoteMode;
  service_type?: string;
  incoterms?: string;
  origin_port?: string;
  destination_port?: string;
  origin_city?: string;
  destination_city?: string;
  equipment_type?: string;
  container_count?: number;
  weight_lbs?: number;
  distance_miles?: number;
  cargo_value?: number;
  hs_code?: string;
  commodity?: string;
}

const MODE_OPTIONS: { value: QuoteMode; label: string }[] = [
  { value: "ocean", label: "Ocean" },
  { value: "air", label: "Air" },
  { value: "drayage", label: "Drayage" },
  { value: "ftl", label: "FTL" },
  { value: "ltl", label: "LTL" },
];

const CAT_ICON: Record<QuoteMode, typeof Ship> = {
  ocean: Ship,
  air: Plane,
  drayage: Container,
  ftl: Truck,
  ltl: Truck,
};

const CAT_TONE: Record<"intl" | "dray" | "dom", string> = {
  intl: "bg-violet-50 text-violet-700 border-violet-200",
  dray: "bg-cyan-50 text-cyan-700 border-cyan-200",
  dom: "bg-amber-50 text-amber-800 border-amber-200",
};

const INCOTERMS = ["FOB", "EXW", "FCA", "CIF", "CIP", "DAP", "DDP"];

const INCOTERMS_TYPE = "incoterms";

const num = (v: string): number | undefined => {
  if (v.trim() === "") return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

/** Map a MODE_FIELDS extra-field key to the LaneFields property it edits. */
const EXTRA_VALUE: Record<string, (f: LaneFields) => number | string | undefined> = {
  container_count: (f) => f.container_count,
  weight_lbs: (f) => f.weight_lbs,
  distance_miles: (f) => f.distance_miles,
  cargo_value: (f) => f.cargo_value,
  hs_code: (f) => f.hs_code,
  // Keys present in MODE_FIELDS with no dedicated column (pallet_count, pieces)
  // are rendered but not persisted in Phase 1.
};

export default function QuoteLaneShipmentForm({
  value,
  onChange,
}: {
  value: LaneFields;
  onChange: (patch: Partial<LaneFields>) => void;
}) {
  const mode = value.mode;
  const cfg = MODE_FIELDS[mode];
  const cat = CATEGORY[mode];
  const CatIcon = CAT_ICON[mode];
  const usesPorts = mode === "ocean" || mode === "air" || mode === "drayage";
  const showIncoterms = USES_INCOTERMS[mode];

  // Origin/dest bind to port columns for international + drayage origin, else to
  // the city column. (Drayage dest is an address but we keep it in the city
  // column for Phase 1 since there is no single "address" column.)
  const originIsPort = usesPorts;
  const destIsPort = mode === "ocean" || mode === "air";

  const originVal = originIsPort ? value.origin_port : value.origin_city;
  const destVal = destIsPort ? value.destination_port : value.destination_city;

  return (
    <div className="space-y-3">
      {/* Category badge */}
      <div>
        <span
          className={
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold " +
            CAT_TONE[cat.tone]
          }
        >
          <CatIcon className="h-3 w-3" />
          {cat.label}
        </span>
      </div>

      {/* Mode + Service type */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Mode">
          <select
            value={mode}
            onChange={(e) => onChange({ mode: e.target.value as QuoteMode })}
            className={selectCls}
          >
            {MODE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Service Type">
          <select
            value={value.service_type ?? ""}
            onChange={(e) => onChange({ service_type: e.target.value })}
            className={selectCls}
          >
            <option value="">Select…</option>
            {SERVICE_TYPES[mode].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Origin / Destination */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={cfg.originLabel}>
          <input
            value={originVal ?? ""}
            onChange={(e) =>
              onChange(
                originIsPort
                  ? { origin_port: e.target.value }
                  : { origin_city: e.target.value },
              )
            }
            className={inputCls}
            placeholder={cfg.originLabel}
          />
        </Field>
        <Field label={cfg.destLabel}>
          <input
            value={destVal ?? ""}
            onChange={(e) =>
              onChange(
                destIsPort
                  ? { destination_port: e.target.value }
                  : { destination_city: e.target.value },
              )
            }
            className={inputCls}
            placeholder={cfg.destLabel}
          />
        </Field>
      </div>

      {/* Incoterms (intl only) + Equipment + extras */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {showIncoterms && (
          <Field label="Incoterms" type={INCOTERMS_TYPE}>
            <select
              value={value.incoterms ?? ""}
              onChange={(e) => onChange({ incoterms: e.target.value })}
              className={selectCls}
            >
              <option value="">Select…</option>
              {INCOTERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        )}

        {cfg.equipment[0] !== "—" && (
          <Field label="Equipment">
            <select
              value={value.equipment_type ?? ""}
              onChange={(e) => onChange({ equipment_type: e.target.value })}
              className={selectCls}
            >
              <option value="">Select…</option>
              {cfg.equipment.map((eq) => (
                <option key={eq} value={eq}>
                  {eq}
                </option>
              ))}
            </select>
          </Field>
        )}

        {cfg.extra.map((ex) => {
          const persisted = ex.key in EXTRA_VALUE;
          const raw = persisted ? EXTRA_VALUE[ex.key](value) : undefined;
          return (
            <Field key={ex.key} label={ex.label} mono={ex.mono}>
              <input
                value={raw == null ? "" : String(raw)}
                onChange={(e) => {
                  if (!persisted) return; // pallet_count / pieces: not stored in Phase 1
                  const v = e.target.value;
                  if (ex.key === "hs_code") onChange({ hs_code: v });
                  else if (ex.key === "container_count") onChange({ container_count: num(v) });
                  else if (ex.key === "weight_lbs") onChange({ weight_lbs: num(v) });
                  else if (ex.key === "distance_miles") onChange({ distance_miles: num(v) });
                  else if (ex.key === "cargo_value") onChange({ cargo_value: num(v) });
                }}
                className={ex.mono ? inputMonoCls : inputCls}
                placeholder={ex.label}
              />
            </Field>
          );
        })}

        {/* Commodity is universal across modes. */}
        <Field label="Commodity">
          <input
            value={value.commodity ?? ""}
            onChange={(e) => onChange({ commodity: e.target.value })}
            className={inputCls}
            placeholder="Commodity"
          />
        </Field>
      </div>
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-[9px] border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/15";
const inputMonoCls = inputCls + " font-mono font-semibold";
const selectCls = inputCls;

function Field({
  label,
  children,
  mono,
  type,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  type?: string;
}) {
  // `type` reserved for future per-field styling hooks; kept for readability.
  void type;
  void mono;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}
