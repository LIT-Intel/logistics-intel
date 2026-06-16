// V6-style left icon strip. ~50px wide, dark navy background, white/cyan
// icons. Tools: filter, bookmark, layers, analytics, insights, library.
// Matches the DSV Sales Explorer V6 reference.

import { Filter, Bookmark, Layers, BarChart3, Sparkles, Library } from 'lucide-react';

const TOOLS = [
  { id: 'filter', icon: Filter, label: 'Filters' },
  { id: 'bookmark', icon: Bookmark, label: 'Saved views' },
  { id: 'layers', icon: Layers, label: 'Map layers' },
  { id: 'analytics', icon: BarChart3, label: 'Analytics' },
  { id: 'insights', icon: Sparkles, label: 'Insights' },
  { id: 'library', icon: Library, label: 'Library' },
];

export default function ExploreSidebar({ active, onSelect }) {
  return (
    <aside className="w-12 bg-[#0F1828] border-r border-slate-800/60 flex flex-col items-center py-3 gap-1">
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
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${
              isActive
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </aside>
  );
}
