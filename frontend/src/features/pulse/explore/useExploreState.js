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
      next.set('explore', encode({ ...state, ...patch }));
      return next;
    }, { replace: true });
  }, [setSp, state]);

  const setFilters = useCallback((filters) => update({ filters }), [update]);
  const setColor = useCallback((color) => update({ color }), [update]);
  const setSize = useCallback((size) => update({ size }), [update]);
  const setSelection = useCallback((selection) => update({ selection }), [update]);
  const clearAll = useCallback(() => {
    setSp((prev) => { const n = new URLSearchParams(prev); n.delete('explore'); return n; }, { replace: true });
  }, [setSp]);

  return { state, setFilters, setColor, setSize, setSelection, clearAll };
}
