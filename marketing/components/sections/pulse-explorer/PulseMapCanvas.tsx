"use client";

import { useEffect, useRef } from "react";
import type * as LeafletNS from "leaflet";
import "leaflet/dist/leaflet.css";
import { PULSE_CITIES, MAX_N } from "./data";

export type MapMode = "bubble" | "heat";

type LeafletWindow = {
  L: typeof LeafletNS & {
    heatLayer: (
      points: Array<[number, number, number]>,
      opts: Record<string, unknown>,
    ) => LeafletNS.Layer;
  };
};

/**
 * Real Leaflet + OpenStreetMap tile map with bubble-cluster markers and a
 * heat overlay. Mirrors the live Pulse Explorer basemap so the marketing
 * page is honest about what the product looks like. Loads Leaflet + the
 * heat plugin lazily on mount to keep them out of the SSR bundle.
 */
export function PulseMapCanvas({
  mode = "bubble",
  height = 460,
}: {
  mode?: MapMode;
  height?: number;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const bubbleRef = useRef<LeafletNS.LayerGroup | null>(null);
  const heatRef = useRef<LeafletNS.Layer | null>(null);

  // One-time init: Leaflet + heat plugin are CDN-free, but heavy and only
  // useful in the browser — dynamic-import keeps the SSR payload light.
  useEffect(() => {
    let cancelled = false;
    let mapInstance: LeafletNS.Map | null = null;

    (async () => {
      const Lmod = await import("leaflet");
      await import("leaflet.heat");
      const L = (Lmod.default ?? Lmod) as LeafletWindow["L"];
      if (cancelled || !elRef.current) return;

      const map = L.map(elRef.current, {
        zoomControl: false,
        scrollWheelZoom: false,
        attributionControl: true,
        dragging: true,
        doubleClickZoom: true,
        boxZoom: false,
        keyboard: false,
      }).setView([39.2, -95.5], 4);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        crossOrigin: true,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      const bubbles = L.layerGroup();
      PULSE_CITIES.forEach((c) => {
        const r = Math.round(16 + Math.sqrt(c.n / MAX_N) * 28);
        const fs = Math.max(12, Math.round(r * 0.62));
        const icon = L.divIcon({
          className: "pulse-bubble",
          html:
            `<div style="width:${r * 2}px;height:${r * 2}px;border-radius:50%;` +
            "background:radial-gradient(circle at 50% 36%, #38c9e2, #0b8eaa);" +
            "border:2px solid rgba(255,255,255,0.92);" +
            "box-shadow:0 3px 10px rgba(8,120,150,0.45);" +
            "display:flex;align-items:center;justify-content:center;" +
            "color:#fff;font-family:'Space Grotesk',sans-serif;font-weight:700;" +
            `font-size:${fs}px;line-height:1;">${c.n}</div>`,
          iconSize: [r * 2, r * 2],
          iconAnchor: [r, r],
        });
        L.marker([c.lat, c.lon], { icon, interactive: false }).addTo(bubbles);
      });
      bubbleRef.current = bubbles;

      const heatLayerFactory = (L as LeafletWindow["L"]).heatLayer;
      if (typeof heatLayerFactory === "function") {
        const pts: Array<[number, number, number]> = PULSE_CITIES.map((c) => [
          c.lat,
          c.lon,
          c.n / MAX_N,
        ]);
        heatRef.current = heatLayerFactory(pts, {
          radius: 46,
          blur: 32,
          max: 1,
          minOpacity: 0.4,
          gradient: {
            0.2: "#3b82f6",
            0.45: "#22d3ee",
            0.65: "#f59e0b",
            0.85: "#f97316",
            1.0: "#e11d2e",
          },
        });
      }

      mapInstance = map;
      mapRef.current = map;
      window.setTimeout(() => map.invalidateSize(), 60);

      // Apply initial mode now that layers exist.
      applyMode(map, mode);
    })();

    return () => {
      cancelled = true;
      if (mapInstance) {
        mapInstance.remove();
        mapRef.current = null;
      }
    };
    // Intentionally only-on-mount: subsequent `mode` changes are routed
    // through the second effect, which swaps layers in-place without
    // re-creating the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mode swap — bubble vs heat. Idempotent.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyMode(map, mode);
  }, [mode]);

  const applyMode = (map: LeafletNS.Map, m: MapMode) => {
    const b = bubbleRef.current;
    const h = heatRef.current;
    if (m === "heat") {
      if (b && map.hasLayer(b)) map.removeLayer(b);
      if (h && !map.hasLayer(h)) h.addTo(map);
    } else {
      if (h && map.hasLayer(h)) map.removeLayer(h);
      if (b && !map.hasLayer(b)) b.addTo(map);
    }
  };

  return (
    <div
      ref={elRef}
      style={{ width: "100%", height, background: "#e8e6dd" }}
      aria-label="Live map of 78K+ shipper accounts across the US"
    />
  );
}
