// Search | Explore tab wrapper for the Pulse page. URL-synced via the
// `tab` search param (Search is default; `?tab=explore` opens Explore).
// Pass exploreEnabled to gate the Explore tab behind an entitlement
// flag (Phase 4 wires this from useEntitlements).

import { useSearchParams } from 'react-router-dom';
import { Compass, Search } from 'lucide-react';

function Tab({ active, onClick, icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition ${
        active ? 'border-slate-900 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-900'
      }`}
    >
      {icon}{children}
    </button>
  );
}

export default function PulseTabs({ children, exploreEnabled }) {
  const [sp, setSp] = useSearchParams();
  // Explore is the primary view when the user has access. Search is
  // reachable via ?tab=search. Old links with ?tab=explore still work.
  const requested = sp.get('tab');
  const tab = exploreEnabled
    ? (requested === 'search' ? 'search' : 'explore')
    : 'search';
  const setTab = (t) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      // Default (explore) is bare URL; non-default goes in the query.
      if (exploreEnabled) {
        if (t === 'explore') next.delete('tab'); else next.set('tab', t);
      } else {
        if (t === 'search') next.delete('tab'); else next.set('tab', t);
      }
      return next;
    }, { replace: true });
  };
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-slate-200 bg-white px-4 pt-3">
        <div className="flex gap-1">
          {exploreEnabled && (
            <Tab active={tab === 'explore'} onClick={() => setTab('explore')} icon={<Compass size={14} />}>Explore</Tab>
          )}
          <Tab active={tab === 'search'} onClick={() => setTab('search')} icon={<Search size={14} />}>Search</Tab>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {typeof children === 'function' ? children({ tab }) : children}
      </div>
    </div>
  );
}
