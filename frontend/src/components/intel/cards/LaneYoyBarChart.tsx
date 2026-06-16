// LaneYoyBarChart — grouped bar chart: per lane, three bars (prior-prior,
// prior, trailing 12m) with the YoY% delta labeled above the trailing bar.
// Replaces the legacy YoY table format with a chart the user can actually
// read at a glance.

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { useLaneYoyTrend } from "@/api/intel";

interface LaneYoyBarChartProps {
  companyName: string;
}

const COLOR_PRIOR_PRIOR = "#CBD5E1"; // slate-300
const COLOR_PRIOR = "#94A3B8"; // slate-400
const COLOR_TRAILING_UP = "#10B981"; // emerald-500
const COLOR_TRAILING_DOWN = "#F43F5E"; // rose-500
const COLOR_TRAILING_FLAT = "#3B82F6"; // blue-500 (no prior baseline)

// Compact country-name -> 2-letter ISO code map. Mirrors LaneMixStackedBar
// so both charts produce identical lane keys (used as the join key for the
// stacked-bar's YoY chip overlay).
const COUNTRY_SHORT: Record<string, string> = {
  "united states of america": "US",
  "united states": "US",
  usa: "US",
  "united kingdom": "UK",
  "south korea": "KR",
  "republic of korea": "KR",
  "north korea": "KP",
  "viet nam": "VN",
  vietnam: "VN",
  "people's republic of china": "CN",
  china: "CN",
  taiwan: "TW",
  "hong kong": "HK",
  germany: "DE",
  france: "FR",
  spain: "ES",
  italy: "IT",
  netherlands: "NL",
  belgium: "BE",
  india: "IN",
  bangladesh: "BD",
  pakistan: "PK",
  thailand: "TH",
  indonesia: "ID",
  malaysia: "MY",
  philippines: "PH",
  japan: "JP",
  singapore: "SG",
  cambodia: "KH",
  jordan: "JO",
  morocco: "MA",
  guatemala: "GT",
  mexico: "MX",
  canada: "CA",
  brazil: "BR",
  australia: "AU",
};

function shortCountry(country: string | null | undefined): string {
  const c = (country || "").trim();
  if (!c) return "";
  if (/^[A-Z]{2,3}$/.test(c)) return c;
  return COUNTRY_SHORT[c.toLowerCase()] || c;
}

// Fix 4 — Destination format: "City, ST CC"; country-only fallback when no
// city. Origin is country-only by design (Fix 3/4 spec — source-data gap).
function formatLaneEndpoint(
  city: string | null | undefined,
  state: string | null | undefined,
  country: string | null | undefined,
): string {
  const ci = (city || "").trim();
  const st = (state || "").trim();
  const cc = shortCountry(country);
  if (!ci) return cc || "—";
  if (st && cc) return `${ci}, ${st} ${cc}`;
  if (st) return `${ci}, ${st}`;
  if (cc) return `${ci} ${cc}`;
  return ci;
}

function formatLaneOrigin(country: string | null | undefined): string {
  const c = (country || "").trim();
  if (!c) return "—";
  return c;
}

export default function LaneYoyBarChart({ companyName }: LaneYoyBarChartProps) {
  const { data, isLoading } = useLaneYoyTrend(companyName);

  const rows = React.useMemo(() => {
    return (data || [])
      .map((r) => {
        const origin = formatLaneOrigin(r.origin_country);
        const dest = formatLaneEndpoint(
          r.destination_city,
          r.destination_state,
          r.destination_country,
        );
        const lane = `${origin} → ${dest}`;
        return {
          lane,
          // Fix 4 — wider truncation (24 chars) so destination city is
          // legible; full lane string in Tooltip.
          shortLane:
            lane.length > 24 ? lane.slice(0, 23) + "…" : lane,
          priorPrior: Number(r.prior_prior_12m) || 0,
          prior: Number(r.prior_12m) || 0,
          trailing: Number(r.trailing_12m) || 0,
          yoy: r.yoy_pct == null ? null : Number(r.yoy_pct),
          insufficientHistory: r.yoy_pct == null,
        };
      })
      .sort((a, b) => b.trailing - a.trailing)
      .slice(0, 6);
  }, [data]);

  if (isLoading) {
    return (
      <LitSectionCard title="Lane YoY trend" sub="Trailing 12m vs prior 12m">
        <SkeletonChart />
      </LitSectionCard>
    );
  }
  if (rows.length === 0) {
    return (
      <LitSectionCard title="Lane YoY trend" sub="Trailing 12m vs prior 12m">
        <Empty />
      </LitSectionCard>
    );
  }

  const height = 360;

  return (
    <LitSectionCard
      title="Lane YoY trend"
      sub="3 trailing-12m windows · YoY delta above trailing bar"
    >
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 24, right: 8, left: 0, bottom: 56 }}
            barCategoryGap="22%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="shortLane"
              tick={{ fontSize: 10, fill: "#475569" }}
              tickLine={false}
              axisLine={{ stroke: "#E2E8F0" }}
              interval={0}
              angle={-25}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip content={<YoyTooltip />} cursor={{ fill: "#F8FAFC" }} />
            <Legend
              verticalAlign="top"
              align="right"
              height={20}
              iconType="square"
              wrapperStyle={{ fontSize: 10, color: "#64748B" }}
            />
            <Bar
              dataKey="priorPrior"
              name="-24m"
              fill={COLOR_PRIOR_PRIOR}
              radius={[3, 3, 0, 0]}
              isAnimationActive
              animationDuration={700}
            />
            <Bar
              dataKey="prior"
              name="-12m"
              fill={COLOR_PRIOR}
              radius={[3, 3, 0, 0]}
              isAnimationActive
              animationDuration={700}
            />
            <Bar
              dataKey="trailing"
              name="Trailing 12m"
              radius={[3, 3, 0, 0]}
              isAnimationActive
              animationDuration={700}
            >
              {rows.map((r, i) => {
                const color =
                  r.yoy == null
                    ? COLOR_TRAILING_FLAT
                    : r.yoy >= 0
                      ? COLOR_TRAILING_UP
                      : COLOR_TRAILING_DOWN;
                return <Cell key={i} fill={color} />;
              })}
              <LabelList dataKey="yoy" content={<YoyLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {rows.some((r) => r.insufficientHistory) && (
        <div className="border-t border-slate-100 px-3 py-2">
          <span className="font-display inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-[2px] text-[9.5px] font-semibold text-slate-500">
            Some lanes show "Insufficient history" — no prior-12m baseline yet.
          </span>
        </div>
      )}
    </LitSectionCard>
  );
}

function YoyLabel(props: any) {
  const { x, y, width, value } = props;
  if (value == null) {
    return (
      <text
        x={x + width / 2}
        y={y - 8}
        textAnchor="middle"
        fontSize="9.5"
        fill="#64748B"
        fontWeight={600}
      >
        —
      </text>
    );
  }
  const v = Number(value);
  const fill = v > 0 ? "#047857" : v < 0 ? "#BE123C" : "#475569";
  const arrow = v > 0 ? "↑" : v < 0 ? "↓" : "";
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      textAnchor="middle"
      fontSize="10"
      fill={fill}
      fontWeight={700}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {arrow} {Math.abs(v).toFixed(1)}%
    </text>
  );
}

function YoyTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="font-display min-w-[200px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg">
      <div className="mb-1 font-semibold">{row.lane || label}</div>
      <div
        className="space-y-0.5 text-[10.5px] opacity-90 tabular-nums"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        <div>-24m: {row.priorPrior.toLocaleString()}</div>
        <div>-12m: {row.prior.toLocaleString()}</div>
        <div>Trailing 12m: {row.trailing.toLocaleString()}</div>
        {row.yoy != null ? (
          <div>YoY: {row.yoy >= 0 ? "+" : ""}{row.yoy.toFixed(1)}%</div>
        ) : (
          <div>YoY: insufficient history</div>
        )}
      </div>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="flex items-end gap-3 py-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-1 items-end gap-1">
          <div className="h-12 flex-1 rounded bg-slate-100" />
          <div className="h-16 flex-1 rounded bg-slate-100" />
          <div
            className="flex-1 rounded bg-slate-100"
            style={{ height: 40 + i * 8 }}
          />
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="px-6 py-8 text-center">
      <p className="font-body text-[11.5px] text-slate-500">
        No YoY trend yet — refresh intel to populate sliding 12-month windows.
      </p>
    </div>
  );
}
