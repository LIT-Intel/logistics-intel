// Coordinate resolution for ExploreMap bubble positioning.
// Chain: metro (city+state) → state centroid → country centroid → null.
//
// PulseMap stores coords as [lng, lat] arrays. We convert to {lat, lng}
// objects so consumers can use c.lat / c.lng.

import { US_STATE_CENTROIDS, US_METRO_COORDS, COUNTRY_COORDS } from '@/features/pulse/PulseMap';
import { ENDPOINT_ALIAS_MAP } from '@/lib/laneGlobe';

// Convert [lng, lat] array → {lat, lng} object.
function toLatLng(arr) {
  if (!arr) return null;
  if (Array.isArray(arr)) return { lat: arr[1], lng: arr[0] };
  return arr; // already an object
}

// City|STATE → airport-code mapping for metro coord lookup.
// US_METRO_COORDS in PulseMap uses airport codes; this maps city names.
const CITY_STATE_METRO = {
  'los angeles|CA': 'LAX',
  'long beach|CA': 'LGB',
  'new york|NY': 'NYC',
  'newark|NJ': 'NYC',
  'atlanta|GA': 'ATL',
  'savannah|GA': 'SAV',
  'houston|TX': 'HOU',
  'seattle|WA': 'SEA',
  'miami|FL': 'MIA',
  'chicago|IL': 'CHI',
  'dallas|TX': 'DFW',
  'fort worth|TX': 'DFW',
  'san francisco|CA': 'SFO',
  'boston|MA': 'BOS',
};

// ISO alpha-3 → canonical COUNTRY_COORDS key.
// Mirrors laneGlobe.ts internal ALPHA3_CODE_MAP (not exported).
const ALPHA3_TO_CANONICAL = {
  USA: 'usa',
  CHN: 'china',
  GBR: 'united kingdom',
  MEX: 'mexico',
  CAN: 'canada',
  VNM: 'vietnam',
  IND: 'india',
  DEU: 'germany',
  NLD: 'netherlands',
  KOR: 'south korea',
  JPN: 'japan',
  TWN: 'taiwan',
  THA: 'thailand',
  MYS: 'malaysia',
  IDN: 'indonesia',
  BGD: 'bangladesh',
  PAK: 'pakistan',
  TUR: 'turkey',
  BRA: 'brazil',
};

function metroKey(city, state) {
  if (!city || !state) return null;
  return `${city.trim().toLowerCase()}|${state.trim().toUpperCase()}`;
}

// Resolve a country identifier (alpha-2, alpha-3, or common name) to a
// canonical COUNTRY_COORDS key.
function resolveCountryKey(country) {
  if (!country) return null;
  const lower = country.toLowerCase();
  const upper = country.toUpperCase();

  // Direct match in COUNTRY_COORDS (e.g. 'china', 'usa').
  if (COUNTRY_COORDS[lower]) return lower;

  // ENDPOINT_ALIAS_MAP maps lowercase alpha-2 codes → canonical name.
  if (ENDPOINT_ALIAS_MAP[lower] && COUNTRY_COORDS[ENDPOINT_ALIAS_MAP[lower]]) {
    return ENDPOINT_ALIAS_MAP[lower];
  }

  // Alpha-3 code lookup (e.g. 'CHN' → 'china').
  if (ALPHA3_TO_CANONICAL[upper] && COUNTRY_COORDS[ALPHA3_TO_CANONICAL[upper]]) {
    return ALPHA3_TO_CANONICAL[upper];
  }

  return null;
}

export function lookupCoords({ city, state, country }) {
  // 1. Metro lookup: city|STATE → airport code → coords.
  const mk = metroKey(city, state);
  if (mk) {
    const code = CITY_STATE_METRO[mk];
    if (code && US_METRO_COORDS[code]) {
      return { ...toLatLng(US_METRO_COORDS[code]), source: 'metro' };
    }
  }

  // 2. State centroid fallback.
  if (state) {
    const stateCoords = US_STATE_CENTROIDS[state.toUpperCase()];
    if (stateCoords) {
      return { ...toLatLng(stateCoords), source: 'state' };
    }
  }

  // 3. Country centroid fallback.
  if (country) {
    const key = resolveCountryKey(country);
    if (key) {
      return { ...toLatLng(COUNTRY_COORDS[key]), source: 'country' };
    }
  }

  return null;
}
