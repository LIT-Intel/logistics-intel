import * as React from 'react';
import { Ship, Plane, X } from 'lucide-react';

export function FiltersDrawer({
  open,
  onOpenChange,
  filters,
  values,
  onChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: any;
  values: { origin?: string; destination?: string; mode?: string; date_start?: string; date_end?: string; year?: string; origin_city?: string; dest_city?: string; dest_state?: string; dest_postal?: string; dest_port?: string };
  onChange: (patch: Partial<{ origin: string | undefined; destination: string | undefined; mode: string | undefined; date_start: string | undefined; date_end: string | undefined; year: string | undefined; origin_city: string | undefined; dest_city: string | undefined; dest_state: string | undefined; dest_postal: string | undefined; dest_port: string | undefined }>) => void;
  onApply: () => void;
}) {
  const countries: string[] =
    (Array.isArray(filters?.dest_countries) && filters.dest_countries.length
      ? filters.dest_countries
      : Array.isArray(filters?.origins)
      ? filters.origins
      : Array.isArray(filters?.origin_countries)
      ? filters.origin_countries
      : []) as string[];

  return (
    <div className={open ? 'block' : 'hidden'}>
      <div className="mt-3 rounded-2xl border border-slate-200 bg-white/95 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-800">Filters</div>
          <button onClick={() => onOpenChange(false)} className="rounded-lg border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
            <X className="h-3.5 w-3.5 inline mr-1" /> Close
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-neutral-600">Origin Country</label>
            <input
              list="lit-countries"
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
              placeholder="Type a country…"
              value={values.origin ?? ''}
              onChange={(e) => onChange({ origin: e.target.value.trim() ? e.target.value : undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Origin City</label>
            <input
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
              placeholder="City"
              value={values.origin_city ?? ''}
              onChange={(e) => onChange({ origin_city: e.target.value.trim() ? e.target.value : undefined })}
            />
          </div>
          <div className="md:col-span-1">
            <label className="text-xs text-neutral-600">Year</label>
            <input
              type="number"
              min="2000"
              max="2100"
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
              placeholder="YYYY"
              value={values.year ?? ''}
              onChange={(e) => onChange({ year: e.target.value.trim() ? e.target.value : undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Date Start</label>
            <input
              type="date"
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
              value={values.date_start ?? ''}
              onChange={(e) => onChange({ date_start: e.target.value.trim() ? e.target.value : undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Date End</label>
            <input
              type="date"
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
              value={values.date_end ?? ''}
              onChange={(e) => onChange({ date_end: e.target.value.trim() ? e.target.value : undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Destination Country</label>
            <input
              list="lit-countries"
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
              placeholder="Type a country…"
              value={values.destination ?? ''}
              onChange={(e) => onChange({ destination: e.target.value.trim() ? e.target.value : undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Destination City</label>
            <input
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
              placeholder="City"
              value={values.dest_city ?? ''}
              onChange={(e) => onChange({ dest_city: e.target.value.trim() ? e.target.value : undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Destination State</label>
            <input
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
              placeholder="State / Province"
              value={values.dest_state ?? ''}
              onChange={(e) => onChange({ dest_state: e.target.value.trim() ? e.target.value : undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Destination Postal / Zip</label>
            <input
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
              placeholder="Postal / Zip"
              value={values.dest_postal ?? ''}
              onChange={(e) => onChange({ dest_postal: e.target.value.trim() ? e.target.value : undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Destination Port</label>
            <input
              className="w-full h-10 rounded-xl border border-neutral-300 px-3 text-sm"
              placeholder="UN/LOCODE or Name"
              value={values.dest_port ?? ''}
              onChange={(e) => onChange({ dest_port: e.target.value.trim() ? e.target.value : undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600">Mode</label>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                aria-label="Ocean"
                onClick={() => onChange({ mode: values.mode === 'ocean' ? undefined : 'ocean' })}
                className={`h-10 w-12 rounded-xl grid place-items-center border ${
                  values.mode === 'ocean'
                    ? 'border-violet-400 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-700'
                    : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}
                title="Ocean"
              >
                <Ship size={18} />
              </button>
              <button
                type="button"
                aria-label="Air"
                onClick={() => onChange({ mode: values.mode === 'air' ? undefined : 'air' })}
                className={`h-10 w-12 rounded-xl grid place-items-center border ${
                  values.mode === 'air'
                    ? 'border-violet-400 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-700'
                    : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}
                title="Air"
              >
                <Plane size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => {
              onChange({ origin: undefined, destination: undefined, mode: undefined });
            }}
          >
            Clear
          </button>
          <button
            className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm hover:bg-indigo-700"
            onClick={() => {
              onApply();
              onOpenChange(false);
            }}
          >
            Apply
          </button>
        </div>
      </div>
      <datalist id="lit-countries">
        {countries.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}
