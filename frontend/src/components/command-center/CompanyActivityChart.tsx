import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
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
  const fcl = payload.find((item) => item.name === "FCL")?.value ?? 0;
  const lcl = payload.find((item) => item.name === "LCL")?.value ?? 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="text-slate-600">FCL: {fcl.toLocaleString()}</p>
      <p className="text-slate-600">LCL: {lcl.toLocaleString()}</p>
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
    <div className="mt-4 h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="period" tickLine={false} tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend />
          <Bar dataKey="fcl" name="FCL" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="lcl" name="LCL" fill="#0f766e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
