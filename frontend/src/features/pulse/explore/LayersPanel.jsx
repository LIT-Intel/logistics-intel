// Layers panel — map style toggle (light / dark / outdoors) + layer
// toggles. Style switches are emitted up via onStyleChange; the map
// component re-binds the style.

import { Sun, Moon, Mountain, Layers } from 'lucide-react';

const STYLES = [
  { id: 'alidade_smooth', label: 'Light', icon: Sun, desc: 'Default — clean labels, easy to read' },
  { id: 'alidade_smooth_dark', label: 'Dark', icon: Moon, desc: 'Dark mode for low-light review' },
  { id: 'outdoors', label: 'Outdoors', icon: Mountain, desc: 'Terrain detail — useful for trade-lane geography' },
];

export default function LayersPanel({ mapStyle, onStyleChange }) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <header className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900 inline-flex items-center gap-2">
          <Layers size={16} /> Map layers
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">Switch base style. More layers coming soon.</p>
      </header>

      <div className="p-4 space-y-2">
        {STYLES.map((s) => {
          const Icon = s.icon;
          const isActive = (mapStyle ?? 'alidade_smooth') === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onStyleChange?.(s.id)}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition flex items-start gap-3 ${
                isActive
                  ? 'border-cyan-500 bg-cyan-50 ring-1 ring-cyan-300'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-cyan-600' : 'text-slate-500'} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">{s.label}</div>
                <div className="text-[11px] text-slate-500 leading-snug">{s.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-4">
        <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-500">
          Future layer toggles: port overlay, state boundaries, major shipping lanes.
        </div>
      </div>
    </div>
  );
}
