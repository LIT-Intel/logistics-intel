import { useCallback, useEffect, useState } from "react";

/**
 * Persisted lane-view mode for the trade-lane surfaces on the Dashboard and
 * Company Profile. The same hook backs both surfaces so a user who flips to
 * map view on the Dashboard sees map view on the Company Profile too — one
 * preference, two consumers.
 *
 * `scope` lets us partition the preference per surface if we ever want them
 * to diverge (default: shared across both). Pass a unique scope to opt out.
 */
export type LaneViewMode = "globe" | "map";

const STORAGE_KEY = "lit:laneViewMode";

function readStored(scope: string): LaneViewMode {
  if (typeof window === "undefined") return "globe";
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${scope}`);
    if (raw === "globe" || raw === "map") return raw;
  } catch {
    // ignore — sandbox or storage disabled
  }
  return "globe";
}

export function useLaneViewMode(scope = "default"): {
  mode: LaneViewMode;
  setMode: (next: LaneViewMode) => void;
  toggle: () => void;
} {
  const [mode, setModeState] = useState<LaneViewMode>(() => readStored(scope));

  // Cross-tab sync: if another tab changes the preference, mirror it here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === `${STORAGE_KEY}:${scope}` && (e.newValue === "globe" || e.newValue === "map")) {
        setModeState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scope]);

  const setMode = useCallback(
    (next: LaneViewMode) => {
      setModeState(next);
      try {
        window.localStorage.setItem(`${STORAGE_KEY}:${scope}`, next);
      } catch {
        // ignore
      }
    },
    [scope],
  );

  const toggle = useCallback(() => {
    setMode(mode === "globe" ? "map" : "globe");
  }, [mode, setMode]);

  return { mode, setMode, toggle };
}
