import React from "react";

type MonthlyPoint = {
  month: string;
  fcl: number;
  lcl: number;
};

type MonthlyFclLclChartProps = {
  data: MonthlyPoint[];
};

const FALLBACK_MONTHS: MonthlyPoint[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
].map((month) => ({ month, fcl: 0, lcl: 0 }));

function formatNumber(value: number): string {
  return value.toLocaleString();
}

export default function MonthlyFclLclChart({
  data,
}: MonthlyFclLclChartProps) {
  const normalizedData = data.length === 12 ? data : FALLBACK_MONTHS;
  const maxValue = React.useMemo(() => {
    const baseline = normalizedData.reduce((max, point) => {
      return Math.max(max, point.fcl, point.lcl);
    }, 0);
    return baseline > 0 ? baseline : 1;
  }, [normalizedData]);

  const [hovered, setHovered] = React.useState<MonthlyPoint | null>(null);

  return (
    <div>
      {hovered && (
        <div className="mb-3 inline-flex flex-wrap gap-3 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-50 shadow-xl">
          <span className="font-semibold">Month: {hovered.month}</span>
          <span>FCL: {formatNumber(hovered.fcl)}</span>
          <span>LCL: {formatNumber(hovered.lcl)}</span>
        </div>
      )}

      <div className="flex h-48 items-end gap-2 md:h-64 md:gap-3">
        {normalizedData.map((point, idx) => {
          const handleEnter = () => setHovered(point);
          const handleLeave = () => setHovered(null);

          const fclHeight = Math.max(0, (point.fcl / maxValue) * 100);
          const lclHeight = Math.max(0, (point.lcl / maxValue) * 100);

          return (
            <button
              key={`${point.month}-${idx}`}
              type="button"
              onMouseEnter={handleEnter}
              onMouseLeave={handleLeave}
              onFocus={handleEnter}
              onBlur={handleLeave}
              className="flex h-full flex-col items-center gap-1 focus:outline-none"
            >
              <div className="flex h-full items-end gap-1 md:gap-1.5">
                <div
                  className="w-2.5 rounded-t-md md:w-3"
                  style={{
                    height: `${fclHeight}%`,
                    backgroundImage: "linear-gradient(180deg, #6C4DFF 0%, #4C8DFF 100%)",
                  }}
                />
                <div
                  className="w-2.5 rounded-t-md bg-emerald-500 md:w-3"
                  style={{ height: `${lclHeight}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500">{point.month}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
