'use client';
import * as React from 'react';
import { Ship, Plane } from 'lucide-react';

type Props = {
  value: {
    origin: string | null;
    destination: string | null;
    hs: string | null;            // comma-separated
    mode: 'ocean' | 'air' | null;
  };
  onChange: (next: Props['value']) => void;
};

const COUNTRIES = [
  'Argentina','Australia','Bahamas','Bangladesh','Belgium','Brazil','Canada','China','Colombia',
  'Denmark','Dominican Republic','France','Germany','Hong Kong','India','Indonesia','Ireland',
  'Italy','Japan','Korea, Republic of','Malaysia','Mexico','Netherlands','New Zealand','Pakistan',
  'Philippines','Poland','Portugal','Singapore','Spain','Sweden','Taiwan','Thailand','Turkey',
  'United Arab Emirates','United Kingdom','United States','Vietnam'
];

export default function SearchFilters({ value, onChange }: Props) {
  const [origin, setOrigin] = React.useState(value.origin ?? '');
  const [destination, setDestination] = React.useState(value.destination ?? '');
  const [hs, setHs] = React.useState(value.hs ?? '');
  const [mode, setMode] = React.useState<'ocean'|'air'|null>(value.mode ?? 'ocean');

  // Simple typeahead suggestions
  const [originSug, setOriginSug] = React.useState<string[]>([]);
  const [destSug, setDestSug]   = React.useState<string[]>([]);
  React.useEffect(() => {
    const o = origin.trim().toLowerCase();
    const d = destination.trim().toLowerCase();
    setOriginSug(o ? COUNTRIES.filter(c => c.toLowerCase().includes(o)).slice(0,6) : []);
    setDestSug  (d ? COUNTRIES.filter(c => c.toLowerCase().includes(d)).slice(0,6) : []);
  }, [origin, destination]);

  // Push state up (debounced) so page can auto-search as user types
  React.useEffect(() => {
    const id = setTimeout(() => {
      onChange({
        origin: origin.trim() ? origin.trim() : null,
        destination: destination.trim() ? destination.trim() : null,
        hs: hs.trim() ? hs.trim() : null,
        mode
      });
    }, 350);
    return () => clearTimeout(id);
  }, [origin, destination, hs, mode]); // eslint-disable-line

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {/* Origin */}
        <div>
          <label className="text-xs text-neutral-600">Origin</label>
          <div className="relative mt-1">
            <input
              value={origin}
              onChange={e => setOrigin(e.target.value)}
              placeholder="Type a country…"
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
            />
            {originSug.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-neutral-200 bg-white shadow">
                {originSug.map((s) => (
                  <button
                    key={s}
                    onClick={() => setOrigin(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50"
                  >{s}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Destination */}
        <div>
          <label className="text-xs text-neutral-600">Destination</label>
          <div className="relative mt-1">
            <input
              value={destination}
              onChange={e => setDestination(e.target.value)}
              placeholder="Type a country…"
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
            />
            {destSug.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-neutral-200 bg-white shadow">
                {destSug.map((s) => (
                  <button
                    key={s}
                    onClick={() => setDestination(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50"
                  >{s}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* HS Codes */}
        <div>
          <label className="text-xs text-neutral-600">HS Codes</label>
          <input
            value={hs}
            onChange={e => setHs(e.target.value)}
            placeholder="e.g., 9403, 8501"
            className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm mt-1"
          />
          <div className="text-[11px] text-neutral-500 mt-1">Comma-separated; partial prefixes ok.</div>
        </div>

        {/* Mode icon toggle */}
        <div>
          <label className="text-xs text-neutral-600">Mode</label>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              aria-label="Ocean"
              onClick={() => setMode('ocean')}
              className={`h-10 w-12 rounded-xl grid place-items-center border ${mode==='ocean' ? 'border-violet-400 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-700' : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'}`}
              title="Ocean"
            >
              <Ship size={18}/>
            </button>
            <button
              type="button"
              aria-label="Air"
              onClick={() => setMode('air')}
              className={`h-10 w-12 rounded-xl grid place-items-center border ${mode==='air' ? 'border-violet-400 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-700' : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'}`}
              title="Air"
            >
              <Plane size={18}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
