import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
} from "recharts";

type ActivityPoint = {
  period: string;
  fcl: number;
  lcl: number;
};

type CompanyActivityChartProps = {
  data: ActivityPoint[];
};

const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload || !payload.length) return null;
  const fcl = payload.find((item) => item.name === "fcl")?.value ?? 0;
  const lcl = payload.find((item) => item.name === "lcl")?.value ?? 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="text-slate-600">FCL: {Number(fcl).toLocaleString()}</p>
      <p className="text-slate-600">LCL: {Number(lcl).toLocaleString()}</p>
      <p className="mt-1 font-semibold text-slate-900">
        Total: {(Number(fcl) + Number(lcl)).toLocaleString()}
      </p>
    </div>
  );
};

export default function CompanyActivityChart({ data }: CompanyActivityChartProps) {
  if (!data.length) {
    return (
      <p className="text-sm text-slate-500">
        No time-series data available for this company yet.
      </p>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#2563EB" }} />
          FCL
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#EA580C" }} />
          LCL
        </span>
      </div>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="30%">
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="period"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            <Bar dataKey="fcl" stackId="a" fill="#2563EB" radius={[0, 0, 0, 0]} />
            <Bar dataKey="lcl" stackId="a" fill="#EA580C" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
