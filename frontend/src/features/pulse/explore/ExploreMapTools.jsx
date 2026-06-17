// V6-style floating map toolbar — bottom-left vertical strip with map tools.
// Select-bubble, edit/draw, lasso, legend toggle.

import { MousePointer, Pencil, Lasso, BookOpen } from 'lucide-react';

const TOOLS = [
  { id: 'select', icon: MousePointer, label: 'Click to select' },
  { id: 'draw', icon: Pencil, label: 'Draw' },
  { id: 'lasso', icon: Lasso, label: 'Lasso select' },
  { id: 'legend', icon: BookOpen, label: 'Toggle legend' },
];

export default function ExploreMapTools({ active, onSelect }) {
  return (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 z-[400] flex flex-col gap-1 rounded-lg bg-slate-900/90 backdrop-blur-sm shadow-lg border border-slate-700/60 p-1">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect?.(t.id)}
            title={t.label}
            aria-label={t.label}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition ${
              isActive
                ? 'bg-cyan-500 text-white'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-cyan-300'
            }`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
