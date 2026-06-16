// ExploreMap — Leaflet bubble map with supercluster for low-zoom aggregation.
// Renders one Marker per visible feature; clusters collapse below the
// supercluster maxZoom (8).

import { useMemo, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import Supercluster from 'supercluster';
import { lookupCoords } from './coordLookup';
import { industryColor, workflowColor, opportunityColor } from './bubblePalettes';
import 'leaflet/dist/leaflet.css';

const US_CENTER = [39.5, -98.35];
const DEFAULT_ZOOM = 4;

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

function bubbleIcon(row, mode, sizeMode, maxValue, isSelected) {
  const size = sizeFor(row, sizeMode, maxValue);
  const color = colorFor(row, mode);
  return L.divIcon({
    className: 'pulse-bubble',
    iconSize: [size, size],
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:${borderFor(row)};
      box-shadow:${isSelected ? '0 0 0 2px #06B6D4' : 'none'};
      opacity:0.85;
    "></div>`,
  });
}

function clusterIcon(count) {
  const size = 28 + Math.min(28, Math.log10(count) * 12);
  return L.divIcon({
    className: 'pulse-cluster',
    iconSize: [size, size],
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:rgba(6,182,212,0.85);color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-weight:600;font-size:12px;
      box-shadow:0 0 0 4px rgba(6,182,212,0.2);
    ">${count}</div>`,
  });
}

function ZoomListener({ onZoom }) {
  useMapEvents({ zoomend: (e) => onZoom(e.target.getZoom()) });
  return null;
}

function BboxTracker({ onBbox }) {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      const b = map.getBounds();
      onBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    update();
    map.on('moveend', update);
    return () => { map.off('moveend', update); };
  }, [map, onBbox]);
  return null;
}

function HeatLayer({ rows, sizeMode, on }) {
  const map = useMap();
  useEffect(() => {
    if (!on) return undefined;
    const points = rows
      .map((r) => {
        const c = lookupCoords({ city: r.city, state: r.state, country: r.country });
        if (!c) return null;
        const v = sizeMode === 'teu' ? r.teu
          : sizeMode === 'shipments' ? r.shipments
          : sizeMode === 'spend' ? r.value_usd
          : r.opportunity_composite_score;
        if (!v) return null;
        return [c.lat, c.lng, Math.log10(v + 1)];
      })
      .filter(Boolean);
    if (!points.length) return undefined;
    const layer = L.heatLayer(points, { radius: 25, blur: 18, maxZoom: 8 });
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, rows, sizeMode, on]);
  return null;
}

export default function ExploreMap({ rows, colorMode, sizeMode, selection, onBubbleClick, mapMode = 'bubbles' }) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const heatOn = mapMode === 'heat';
  const bubblesOn = mapMode !== 'heat';
  const [bbox, setBbox] = useState([-130, 20, -65, 50]);

  const points = useMemo(() => {
    return rows
      .map((r) => {
        const c = lookupCoords({ city: r.city, state: r.state, country: r.country });
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

  const items = useMemo(() => cluster.getClusters(bbox, zoom), [cluster, bbox, zoom]);

  return (
    <MapContainer center={US_CENTER} zoom={DEFAULT_ZOOM} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />
      <ZoomListener onZoom={setZoom} />
      <BboxTracker onBbox={setBbox} />
      <HeatLayer rows={rows} sizeMode={sizeMode} on={heatOn} />
      {bubblesOn && items.map((it) => {
        const [lng, lat] = it.geometry.coordinates;
        if (it.properties.cluster) {
          return (
            <Marker
              key={`c-${it.properties.cluster_id}`}
              position={[lat, lng]}
              icon={clusterIcon(it.properties.point_count)}
            />
          );
        }
        const row = it.properties.row;
        return (
          <Marker
            key={row.id}
            position={[lat, lng]}
            icon={bubbleIcon(row, colorMode, sizeMode, maxValue, selSet.has(row.id))}
            eventHandlers={{ click: () => onBubbleClick?.(row) }}
          />
        );
      })}
    </MapContainer>
  );
}
