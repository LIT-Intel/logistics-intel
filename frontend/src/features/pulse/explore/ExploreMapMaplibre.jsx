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

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster from 'supercluster';
import { lookupCoords } from './coordLookup';
import { industryColor, workflowColor, opportunityColor } from './bubblePalettes';

const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY ?? '';

// Use Stadia tiles when an API key is configured; fall back to
// OpenStreetMap's free public tile servers so the map never renders blank.
function makeTileSource(styleId) {
  if (STADIA_KEY) {
    return {
      type: 'raster',
      tiles: [
        `https://tiles.stadiamaps.com/tiles/${styleId}/{z}/{x}/{y}.png?api_key=${STADIA_KEY}`,
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

function makeStyleSpec(styleId) {
  return {
    version: 8,
    sources: { 'base-raster': makeTileSource(styleId) },
    layers: [
      { id: 'base-raster-layer', type: 'raster', source: 'base-raster', minzoom: 0, maxzoom: 20 },
    ],
  };
}

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

// Hex → "r,g,b" for the rgba() wrappers. Falls back to cyan-500
// (#06B6D4) if the input is malformed so a bad palette entry can't
// crash the renderer.
function hexToRgbTriplet(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return '6,182,212';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return '6,182,212';
  return `${r},${g},${b}`;
}

// Pick the highest-count key from a {key: count} map. Used to surface
// the dominant industry / workflow per cluster.
function pickDominant(counts) {
  let bestKey = null;
  let bestCount = -1;
  for (const [k, v] of Object.entries(counts || {})) {
    if (v > bestCount) { bestKey = k; bestCount = v; }
  }
  return bestKey;
}

// Resolve a cluster's bubble color from its aggregated properties +
// the current colorMode. Mirrors colorFor() for individual bubbles so
// a cluster and the points underneath it read as the same palette.
function clusterColor(clusterProps, mode) {
  if (mode === 'opportunity') {
    const sum = clusterProps.oppScoreSum ?? 0;
    const n = clusterProps.oppScoreCount ?? 0;
    const avg = n > 0 ? sum / n : 0;
    return opportunityColor(avg);
  }
  if (mode === 'workflow') {
    return workflowColor(pickDominant(clusterProps.workflowCounts) ?? 'unsaved');
  }
  return industryColor(pickDominant(clusterProps.industryCounts) ?? 'Other');
}

function makeClusterEl(count, color = '#06B6D4') {
  const size = 28 + Math.min(28, Math.log10(count) * 12);
  const rgb = hexToRgbTriplet(color);
  const el = document.createElement('div');
  el.className = 'pulse-cluster';
  el.style.cssText = `
    width:${size}px;height:${size}px;border-radius:50%;
    background:rgba(${rgb},0.85);color:#fff;
    display:flex;align-items:center;justify-content:center;
    font-weight:600;font-size:12px;cursor:pointer;
    box-shadow:0 0 0 4px rgba(${rgb},0.2);
  `;
  el.textContent = String(count);
  return el;
}

const ExploreMapMaplibre = forwardRef(function ExploreMapMaplibre({
  rows, colorMode, sizeMode, selection, onBubbleClick, mapMode = 'bubbles',
  onBboxChange,
  lassoActive = false,
  onLassoSelect,
  mapStyle = 'alidade_smooth',
  // Optional hover callbacks — wired by the Intelligence Explorer's
  // Company Search tab to render a floating preview card on bubble
  // hover. Pulse Explorer doesn't pass these, so PulseExploreTab's
  // existing behaviour is unchanged.
  onBubbleHover,
  onBubbleLeave,
  // When true, after every points change the map re-fits its bounds
  // to span all points + a small padding. Used by Company Search so
  // a result set of 10 companies spread across CT/CO/KY zooms in to
  // show separate bubbles instead of one cluster at country-center.
  fitBoundsToPoints = false,
}, ref) {
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

  // Imperative API so the parent can read the LIVE viewport at click
  // time, regardless of whether React state has caught up — the v1
  // "select in view" handler was reading stale state and silently
  // matching nothing.
  useImperativeHandle(ref, () => ({
    getCurrentBbox() {
      const m = mapRef.current;
      if (!m) return null;
      const b = m.getBounds();
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    },
  }), []);

  // Bump on every map.setStyle() so the heatmap / marker effects below
  // know to re-attach their sources & layers (setStyle wipes everything).
  const [styleEpoch, setStyleEpoch] = useState(0);

  // React to mapStyle prop changes by swapping the entire style.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    map.setStyle(makeStyleSpec(mapStyle));
    const onLoad = () => setStyleEpoch((e) => e + 1);
    map.once('styledata', onLoad);
    return () => { map.off('styledata', onLoad); };
  }, [mapStyle, ready]);

  // 1. Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeStyleSpec(mapStyle),
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

  // Fit bounds to the current point set (opt-in via fitBoundsToPoints).
  // Used by Company Search so a 10-row result spread across CT/CO/KY
  // zooms in until every bubble is individually visible, instead of
  // bundling them into a single cluster at country-level zoom.
  useEffect(() => {
    if (!fitBoundsToPoints || !ready || !mapRef.current) return;
    const validPoints = (rows ?? [])
      .map((r) => {
        const c = lookupCoords({
          latitude: r.latitude, longitude: r.longitude,
          city: r.city, state: r.state, country: r.country,
        });
        return c ? [c.lng, c.lat] : null;
      })
      .filter(Boolean);
    if (validPoints.length === 0) return;
    if (validPoints.length === 1) {
      // A single point — center on it with a comfortable zoom rather
      // than fitBounds, which would zoom in too aggressively.
      mapRef.current.flyTo({ center: validPoints[0], zoom: 8, duration: 800 });
      return;
    }
    let west = validPoints[0][0], east = validPoints[0][0];
    let south = validPoints[0][1], north = validPoints[0][1];
    for (const [lng, lat] of validPoints) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
    mapRef.current.fitBounds([[west, south], [east, north]], {
      padding: { top: 60, bottom: 60, left: 60, right: 60 },
      maxZoom: 9,
      duration: 800,
    });
  }, [fitBoundsToPoints, ready, rows]);

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

  // Map mode controls cluster aggressiveness:
  // - "bubbles" (Map):   moderate radius, clusters only at far zoom (maxZoom 8)
  // - "clusters" (Region): wider radius, always-on aggregation (maxZoom 20)
  const clusterRadius = mapMode === 'clusters' ? 90 : 60;
  const clusterMaxZoom = mapMode === 'clusters' ? 20 : 8;
  // Supercluster map/reduce aggregates so each cluster carries the
  // industry mix, workflow mix, and opportunity-score sum of the
  // points underneath. Used by clusterColor() at render time so the
  // cluster's color reflects the underlying data instead of a single
  // hardcoded cyan. Aggregation runs once per cluster regardless of
  // colorMode — the consumer picks the right slice.
  const cluster = useMemo(() => {
    const s = new Supercluster({
      radius: clusterRadius,
      maxZoom: clusterMaxZoom,
      map: (props) => {
        const row = props.row ?? {};
        const ind = row.industry || 'Other';
        const wf = row._workflow_state || 'unsaved';
        const op = Number.isFinite(row.opportunity_composite_score)
          ? row.opportunity_composite_score
          : null;
        return {
          industryCounts: { [ind]: 1 },
          workflowCounts: { [wf]: 1 },
          oppScoreSum: op ?? 0,
          oppScoreCount: op != null ? 1 : 0,
        };
      },
      reduce: (acc, props) => {
        for (const [k, v] of Object.entries(props.industryCounts || {})) {
          acc.industryCounts[k] = (acc.industryCounts[k] || 0) + v;
        }
        for (const [k, v] of Object.entries(props.workflowCounts || {})) {
          acc.workflowCounts[k] = (acc.workflowCounts[k] || 0) + v;
        }
        acc.oppScoreSum += props.oppScoreSum || 0;
        acc.oppScoreCount += props.oppScoreCount || 0;
      },
    });
    s.load(points);
    return s;
  }, [points, clusterRadius, clusterMaxZoom]);

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
  }, [ready, mapMode, points, sizeMode, styleEpoch]);

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
        const color = clusterColor(it.properties, colorMode);
        el = makeClusterEl(it.properties.point_count, color);
        el.addEventListener('click', () => {
          const expansionZoom = cluster.getClusterExpansionZoom(it.properties.cluster_id);
          map.flyTo({ center: [lng, lat], zoom: expansionZoom + 0.1 });
        });
      } else {
        const row = it.properties.row;
        el = makeBubbleEl(row, colorMode, sizeMode, maxValue, selSet.has(row.id));
        el.addEventListener('click', (e) => { e.stopPropagation(); onBubbleClick?.(row); });
        // Hover-preview hooks (opt-in). The screen-coords payload lets
        // the parent position a floating card next to the bubble
        // without a re-query. Throttled to RAF so panning the cursor
        // across many bubbles doesn't spam React renders.
        if (onBubbleHover || onBubbleLeave) {
          let raf = 0;
          el.addEventListener('mouseenter', (e) => {
            if (raf) cancelAnimationFrame(raf);
            const target = e.currentTarget;
            raf = requestAnimationFrame(() => {
              const rect = target.getBoundingClientRect();
              onBubbleHover?.(row, {
                x: rect.left + rect.width / 2,
                y: rect.top,
                bubbleRect: rect,
              });
            });
          });
          el.addEventListener('mouseleave', () => {
            if (raf) cancelAnimationFrame(raf);
            onBubbleLeave?.(row);
          });
        }
      }
      // While lasso is active, markers MUST NOT capture the
      // mousedown — otherwise MapLibre's map.on('mousedown') listener
      // (which drives the lasso rectangle) never fires when the user
      // starts the drag on top of a bubble. Setting pointerEvents
      // 'none' here covers freshly-created markers; the separate
      // effect below updates existing markers when lassoActive toggles.
      if (lassoActive) el.style.pointerEvents = 'none';
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [ready, cluster, bbox, zoom, colorMode, sizeMode, maxValue, selSet, onBubbleClick, onBubbleHover, onBubbleLeave, mapMode, styleEpoch, lassoActive]);

  // Toggle pointerEvents on all existing markers when lasso flips.
  useEffect(() => {
    for (const m of markersRef.current) {
      const el = m.getElement();
      el.style.pointerEvents = lassoActive ? 'none' : '';
    }
  }, [lassoActive]);

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
});

export default ExploreMapMaplibre;
