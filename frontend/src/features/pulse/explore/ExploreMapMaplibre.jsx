// ExploreMapMaplibre — MapLibre GL JS + Stadia Maps raster tiles.
//
// Replaces the Leaflet-based ExploreMap with a vector/raster MapLibre
// implementation that looks much closer to Google Maps (smooth zoom,
// proper labels). Uses Stadia "Alidade Smooth" tiles for the light look
// or "Alidade Smooth Dark" for dark mode.
//
// API key: VITE_STADIA_API_KEY env var (set on Vercel). For local dev
// without a key, Stadia allows unauthenticated requests from localhost.
//
// Modes: bubbles | heat | clusters — same as ExploreMap (Leaflet).
// Clustering uses supercluster (already a dep). Heat uses MapLibre's
// native `heatmap` paint type (built-in, no extra dep).

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster from 'supercluster';
import { lookupCoords } from './coordLookup';
import { industryColor, workflowColor, opportunityColor } from './bubblePalettes';

const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY ?? '';
const STADIA_STYLE = 'alidade_smooth'; // 'alidade_smooth_dark' for dark

// Use Stadia tiles when an API key is configured; fall back to
// OpenStreetMap's free public tile servers so the map never renders blank.
// MapLibre raster URL template uses {z}/{x}/{y} only — no Leaflet-style {r}.
function makeTileSource() {
  if (STADIA_KEY) {
    return {
      type: 'raster',
      tiles: [
        `https://tiles.stadiamaps.com/tiles/${STADIA_STYLE}/{z}/{x}/{y}.png?api_key=${STADIA_KEY}`,
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> ' +
        '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> ' +
        '&copy; <a href="https://www.openstreetmap.org/about" target="_blank">OpenStreetMap</a>',
    };
  }
  return {
    type: 'raster',
    tiles: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ],
    tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  };
}

const MAP_STYLE_SPEC = {
  version: 8,
  sources: { 'base-raster': makeTileSource() },
  layers: [
    { id: 'base-raster-layer', type: 'raster', source: 'base-raster', minzoom: 0, maxzoom: 20 },
  ],
};

const US_CENTER = [-98.35, 39.5]; // [lng, lat] for MapLibre
const DEFAULT_ZOOM = 3.7;

function sizeFor(row, mode, maxValue) {
  const v = mode === 'teu' ? row.teu
    : mode === 'shipments' ? row.shipments
    : mode === 'spend' ? row.value_usd
    : row.opportunity_composite_score;
  if (!v || !maxValue) return 6;
  const ratio = Math.log10(v + 1) / Math.log10(maxValue + 1);
  return Math.max(6, Math.min(28, 6 + ratio * 22));
}

function colorFor(row, mode) {
  if (mode === 'opportunity') return opportunityColor(row.opportunity_composite_score);
  if (mode === 'workflow') return workflowColor(row._workflow_state ?? 'unsaved');
  return industryColor(row.industry);
}

function borderFor(row) {
  const chip = row.freshness?.chip;
  if (chip === 'live') return 'solid 2px white';
  if (chip === 'saved') return 'dashed 2px white';
  return 'none';
}

function makeBubbleEl(row, mode, sizeMode, maxValue, isSelected) {
  const size = sizeFor(row, sizeMode, maxValue);
  const el = document.createElement('div');
  el.className = 'pulse-bubble';
  el.style.cssText = `
    width:${size}px;height:${size}px;border-radius:50%;
    background:${colorFor(row, mode)};border:${borderFor(row)};
    box-shadow:${isSelected ? '0 0 0 2px #06B6D4' : 'none'};
    opacity:0.85; cursor:pointer;
  `;
  return el;
}

function makeClusterEl(count) {
  const size = 28 + Math.min(28, Math.log10(count) * 12);
  const el = document.createElement('div');
  el.className = 'pulse-cluster';
  el.style.cssText = `
    width:${size}px;height:${size}px;border-radius:50%;
    background:rgba(6,182,212,0.85);color:#fff;
    display:flex;align-items:center;justify-content:center;
    font-weight:600;font-size:12px;cursor:pointer;
    box-shadow:0 0 0 4px rgba(6,182,212,0.2);
  `;
  el.textContent = String(count);
  return el;
}

export default function ExploreMapMaplibre({
  rows, colorMode, sizeMode, selection, onBubbleClick, mapMode = 'bubbles',
  onBboxChange,
  lassoActive = false,
  onLassoSelect,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const lassoRectRef = useRef(null);
  const lassoStartRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [bbox, setBbox] = useState([-130, 20, -65, 50]);

  // Expose bbox to parent on every move.
  useEffect(() => { onBboxChange?.(bbox); }, [bbox, onBboxChange]);

  // 1. Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_SPEC,
      center: US_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('load', () => {
      setReady(true);
      const b = map.getBounds();
      setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      setZoom(map.getZoom());
    });
    map.on('moveend', () => {
      const b = map.getBounds();
      setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      setZoom(map.getZoom());
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // 2. Cluster + bubble rendering.
  const points = useMemo(() => {
    return rows
      .map((r) => {
        const c = lookupCoords({
          latitude: r.latitude, longitude: r.longitude,
          city: r.city, state: r.state, country: r.country,
        });
        if (!c) return null;
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
          properties: { row: r },
        };
      })
      .filter(Boolean);
  }, [rows]);

  const cluster = useMemo(() => {
    const s = new Supercluster({ radius: 60, maxZoom: 8 });
    s.load(points);
    return s;
  }, [points]);

  const maxValue = useMemo(() => {
    const key = sizeMode === 'teu' ? 'teu'
      : sizeMode === 'shipments' ? 'shipments'
      : sizeMode === 'spend' ? 'value_usd'
      : 'opportunity_composite_score';
    return rows.reduce((a, r) => Math.max(a, r[key] ?? 0), 0);
  }, [rows, sizeMode]);

  const selSet = useMemo(() => new Set(selection ?? []), [selection]);

  // 3. Heat layer — managed via MapLibre's native heatmap paint.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const HEAT_SOURCE = 'pulse-heat-src';
    const HEAT_LAYER = 'pulse-heat-layer';
    // Remove existing.
    if (map.getLayer(HEAT_LAYER)) map.removeLayer(HEAT_LAYER);
    if (map.getSource(HEAT_SOURCE)) map.removeSource(HEAT_SOURCE);
    if (mapMode !== 'heat' || points.length === 0) return;
    const features = points.map((p) => {
      const r = p.properties.row;
      const v = sizeMode === 'teu' ? r.teu
        : sizeMode === 'shipments' ? r.shipments
        : sizeMode === 'spend' ? r.value_usd
        : r.opportunity_composite_score;
      return { ...p, properties: { ...p.properties, weight: Math.log10((v ?? 0) + 1) } };
    });
    map.addSource(HEAT_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features } });
    map.addLayer({
      id: HEAT_LAYER,
      type: 'heatmap',
      source: HEAT_SOURCE,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 6, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(33,102,172,0)',
          0.2, 'rgb(103,169,207)',
          0.4, 'rgb(209,229,240)',
          0.6, 'rgb(253,219,199)',
          0.8, 'rgb(239,138,98)',
          1, 'rgb(178,24,43)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 9, 24],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, 0.6],
      },
    });
    return () => {
      const m = mapRef.current; if (!m) return;
      if (m.getLayer(HEAT_LAYER)) m.removeLayer(HEAT_LAYER);
      if (m.getSource(HEAT_SOURCE)) m.removeSource(HEAT_SOURCE);
    };
  }, [ready, mapMode, points, sizeMode]);

  // 4. Bubble/cluster markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    // Clear existing markers.
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (mapMode === 'heat') return;

    const items = cluster.getClusters(bbox, Math.round(zoom));
    for (const it of items) {
      const [lng, lat] = it.geometry.coordinates;
      let el;
      if (it.properties.cluster) {
        el = makeClusterEl(it.properties.point_count);
        el.addEventListener('click', () => {
          const expansionZoom = cluster.getClusterExpansionZoom(it.properties.cluster_id);
          map.flyTo({ center: [lng, lat], zoom: expansionZoom + 0.1 });
        });
      } else {
        const row = it.properties.row;
        el = makeBubbleEl(row, colorMode, sizeMode, maxValue, selSet.has(row.id));
        el.addEventListener('click', (e) => { e.stopPropagation(); onBubbleClick?.(row); });
      }
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [ready, cluster, bbox, zoom, colorMode, sizeMode, maxValue, selSet, onBubbleClick, mapMode]);

  // 5. Lasso rectangle drag — v1 uses a screen-space rectangle for
  // simplicity. While lassoActive, the map's drag pan is disabled and
  // mousedown/move/up draw a translucent cyan box. On mouseup we resolve
  // the rect's screen corners to lng/lat and emit the IDs of every row
  // whose coords fall inside. Polygon lasso is a v1.5 follow-up.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return undefined;
    if (lassoActive) {
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'crosshair';
    } else {
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
    }
    if (!lassoActive) return undefined;

    function ensureRect() {
      if (lassoRectRef.current) return lassoRectRef.current;
      const rect = document.createElement('div');
      rect.style.cssText =
        'position:absolute;pointer-events:none;border:1.5px dashed #06B6D4;' +
        'background:rgba(6,182,212,0.12);z-index:5;display:none;';
      containerRef.current.appendChild(rect);
      lassoRectRef.current = rect;
      return rect;
    }

    function onDown(e) {
      const orig = e.originalEvent;
      lassoStartRef.current = { x: orig.clientX, y: orig.clientY };
      const rect = ensureRect();
      const containerBox = containerRef.current.getBoundingClientRect();
      Object.assign(rect.style, {
        display: 'block',
        left: `${orig.clientX - containerBox.left}px`,
        top: `${orig.clientY - containerBox.top}px`,
        width: '0px', height: '0px',
      });
    }
    function onMove(e) {
      if (!lassoStartRef.current) return;
      const start = lassoStartRef.current;
      const orig = e.originalEvent;
      const containerBox = containerRef.current.getBoundingClientRect();
      const x = Math.min(start.x, orig.clientX);
      const y = Math.min(start.y, orig.clientY);
      const w = Math.abs(orig.clientX - start.x);
      const h = Math.abs(orig.clientY - start.y);
      const rect = ensureRect();
      Object.assign(rect.style, {
        left: `${x - containerBox.left}px`, top: `${y - containerBox.top}px`,
        width: `${w}px`, height: `${h}px`,
      });
    }
    function onUp(e) {
      const start = lassoStartRef.current;
      lassoStartRef.current = null;
      if (lassoRectRef.current) lassoRectRef.current.style.display = 'none';
      if (!start) return;
      const orig = e.originalEvent;
      const containerBox = containerRef.current.getBoundingClientRect();
      const x1 = Math.min(start.x, orig.clientX) - containerBox.left;
      const y1 = Math.min(start.y, orig.clientY) - containerBox.top;
      const x2 = Math.max(start.x, orig.clientX) - containerBox.left;
      const y2 = Math.max(start.y, orig.clientY) - containerBox.top;
      // Ignore micro-drags.
      if (Math.abs(x2 - x1) < 6 || Math.abs(y2 - y1) < 6) return;
      const sw = map.unproject([x1, y2]);
      const ne = map.unproject([x2, y1]);
      const minLng = Math.min(sw.lng, ne.lng);
      const maxLng = Math.max(sw.lng, ne.lng);
      const minLat = Math.min(sw.lat, ne.lat);
      const maxLat = Math.max(sw.lat, ne.lat);
      const ids = [];
      for (const p of points) {
        const [lng, lat] = p.geometry.coordinates;
        if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
          ids.push(p.properties.row.id);
        }
      }
      onLassoSelect?.(ids);
    }

    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    return () => {
      map.off('mousedown', onDown);
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
      if (lassoRectRef.current) lassoRectRef.current.style.display = 'none';
    };
  }, [ready, lassoActive, points, onLassoSelect]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
  );
}
