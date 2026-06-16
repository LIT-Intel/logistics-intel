// V6-style floating Industry/Vertical legend overlay on the map.
// Collapsible card with colored chip + count for each industry. Click a
// chip to filter to just that industry.

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { INDUSTRY_PALETTE, industryColor } from './bubblePalettes';

export default function IndustryLegendOverlay({ rows, activeIndustry, onIndustryClick, onClose }) {
  const [collapsed, setCollapsed] = useState(false);

  const counts = useMemo(() => {
    const m = new Map();
    for (const r of rows ?? []) {
      const key = r.industry ?? 'Other';
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  if (!counts.length) return null;

  return (
    <div className="absolute left-4 top-4 z-[450] w-[520px] max-w-[60vw] rounded-lg bg-white/95 backdrop-blur shadow-xl border border-slate-200">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
        >
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          Industry
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close legend"
            className="text-slate-400 hover:text-slate-700"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="px-3 py-2 flex flex-wrap gap-x-3 gap-y-1.5">
          {counts.map(([industry, count]) => {
            const isActive = activeIndustry === industry;
            return (
              <button
                key={industry}
                type="button"
                onClick={() => onIndustryClick?.(industry)}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition ${
                  isActive
                    ? 'bg-cyan-100 ring-1 ring-cyan-500 text-cyan-900'
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                <span
                  aria-hidden
                  className="w-3 h-3 rounded-sm"
                  style={{ background: industryColor(industry) }}
                />
                <span className="truncate max-w-[140px]">{industry}</span>
                <span className="text-slate-400 tabular-nums">{count.toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
