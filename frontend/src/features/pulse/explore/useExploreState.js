// Central Pulse Explorer state — filters, color/size modes, selection,
// map state. URL-synced via the `explore` search param so views are
// deep-linkable.

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEFAULT = {
  filters: {},
  color: 'industry',
  size: 'teu',
  selection: [],
};

function decode(sp) {
  const raw = sp.get('explore');
  if (!raw) return DEFAULT;
  try { return { ...DEFAULT, ...JSON.parse(decodeURIComponent(raw)) }; }
  catch { return DEFAULT; }
}

function encode(state) {
  const trimmed = { ...state, selection: (state.selection ?? []).slice(0, 50) };
  return encodeURIComponent(JSON.stringify(trimmed));
}

export function useExploreState() {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => decode(sp), [sp]);

  const update = useCallback((patch) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      // Re-decode from the LATEST params, NOT the memoized `state` closure, so
      // several update() calls fired in the same tick COMPOSE instead of
      // clobbering each other. onLoadSelection does setFilters() then setColor()
      // then setSize(); with the stale closure, setColor/setSize rebuilt the
      // state from the pre-update snapshot and wiped the just-applied filters —
      // so loading a saved view (which carries color+size modes) never applied
      // its filter and "nothing loaded".
      next.set('explore', encode({ ...decode(prev), ...patch }));
      return next;
    }, { replace: true });
  }, [setSp]);

  const setFilters = useCallback((filters) => update({ filters }), [update]);
  const setColor = useCallback((color) => update({ color }), [update]);
  const setSize = useCallback((size) => update({ size }), [update]);
  const setSelection = useCallback((selection) => update({ selection }), [update]);
  const clearAll = useCallback(() => {
    setSp((prev) => { const n = new URLSearchParams(prev); n.delete('explore'); return n; }, { replace: true });
  }, [setSp]);

  return { state, setFilters, setColor, setSize, setSelection, clearAll };
}
