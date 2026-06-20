// ExplorerTabs — the top-of-page tab switcher between "Company Search"
// and "Pulse Explorer" inside the Intelligence Explorer shell.
//
// Hidden by default in PR 1 (the Pulse Explorer page mounts the shell
// with `hideTabs` so users see zero change). PR 2 makes both tabs
// visible at /app/search.

import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, Compass } from 'lucide-react';
import { useExplorer } from './ExplorerContext';

const TABS = [
  {
    id: 'company',
    label: 'Company Search',
    icon: SearchIcon,
    description: 'Look up a specific company by name, importer, shipper, or supplier.',
  },
  {
    id: 'pulse',
    label: 'Pulse Explorer',
    icon: Compass,
    description:
      'Ask a freight question — geography, industry, trade lane, growth, volume — and discover matching accounts.',
  },
];

export default function ExplorerTabs({ disabled }) {
  const { mode, setMode } = useExplorer();
  const [sp, setSp] = useSearchParams();

  // URL ↔ mode sync. ?tab=pulse opens the Pulse Explorer tab; no param
  // (or ?tab=company) opens Company Search. Tab clicks update the URL
  // so refresh + share-link preserve state. Bidirectional so an
  // external link like /app/search?tab=pulse opens the right tab.
  useEffect(() => {
    const requested = sp.get('tab');
    if (requested === 'pulse' && mode !== 'pulse') setMode('pulse');
    else if (requested === 'company' && mode !== 'company') setMode('company');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const handleSetMode = (next) => {
    if (disabled?.includes?.(next)) return;
    setMode(next);
    setSp((prev) => {
      const url = new URLSearchParams(prev);
      // Company is the default on /app/search — keep URL clean for it.
      if (next === 'company') url.delete('tab'); else url.set('tab', next);
      return url;
    }, { replace: true });
  };

  return (
    <div
      className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 pt-2"
      role="tablist"
      aria-label="Intelligence Explorer mode"
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = mode === t.id;
        const tabDisabled = disabled?.includes?.(t.id);
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={tabDisabled || undefined}
            disabled={tabDisabled}
            onClick={() => handleSetMode(t.id)}
            title={tabDisabled ? `${t.label} — wiring up next` : t.description}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 transition',
              active
                ? 'border-cyan-500 text-slate-900 font-semibold'
                : tabDisabled
                  ? 'border-transparent text-slate-400 cursor-not-allowed'
                  : 'border-transparent text-slate-500 hover:text-slate-900',
            ].join(' ')}
          >
            <Icon size={14} className={active ? 'text-cyan-600' : ''} />
            {t.label}
            {tabDisabled ? (
              <span className="ml-1 rounded-sm bg-slate-100 px-1 py-px text-[9px] uppercase tracking-wide text-slate-400">
                soon
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
