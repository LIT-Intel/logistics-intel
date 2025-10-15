import React from 'react';

type Props = {
  label: string;
  value: string | number;
  accentClass: string;
  deltaPercent?: number;
  deltaPositive?: boolean;
  icon?: React.ReactNode;
};

export default function LitKpi({ label, value, accentClass, deltaPercent, deltaPositive, icon }: Props) {
  const showDelta = typeof deltaPercent === 'number' && !Number.isNaN(deltaPercent);
  const deltaColor = deltaPositive ? 'text-green-600' : 'text-slate-500';
  return (
    <div className="relative p-6 rounded-2xl bg-white border border-slate-200 shadow-lg hover:shadow-xl transition">
      <div className={`absolute -top-3 left-6 h-6 w-6 rounded-full bg-gradient-to-r ${accentClass} opacity-80`} />
      {icon && (<div className="absolute top-3 right-3 text-slate-400">{icon}</div>)}
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-900">{String(value)}</p>
      {showDelta && (
        <p className={`mt-1 text-xs ${deltaColor}`}>{deltaPercent! > 0 ? `+${deltaPercent!.toFixed(1)}%` : `${deltaPercent!.toFixed(1)}%`} vs last period</p>
      )}
    </div>
  );
}

