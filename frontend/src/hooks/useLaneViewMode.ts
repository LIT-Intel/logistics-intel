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

// v2 (CEO map-default migration 2026-08-13): the key is version-bumped so
// EVERY existing user flips to the map view once — any "globe" stored under
// the old un-versioned key ("lit:laneViewMode:<scope>") is deliberately
// ignored. Toggling after the flip writes to the v2 key, so the user's new
// choice (including going back to globe) persists normally from then on.
const STORAGE_KEY = "lit:laneViewMode:v2";

function readStored(scope: string): LaneViewMode {
  // Default is map — the interactive LaneMap is the primary trade-lane
  // surface (CEO dashboard overhaul 2026-08-13).
  if (typeof window === "undefined") return "map";
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${scope}`);
    if (raw === "globe" || raw === "map") return raw;
  } catch {
    // ignore — sandbox or storage disabled
  }
  return "map";
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
