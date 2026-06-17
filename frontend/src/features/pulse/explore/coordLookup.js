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

// 2-letter USPS code helper for US state fallback.
const STATE_NAME_TO_CODE = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO',
  'connecticut':'CT','delaware':'DE','district of columbia':'DC','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY',
  'louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN',
  'mississippi':'MS','missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH',
  'new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',
  'ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA',
  'washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY','puerto rico':'PR',
};

function stateCode(state) {
  if (!state) return null;
  const s = String(state).trim();
  if (s.length === 2) return s.toUpperCase();
  return STATE_NAME_TO_CODE[s.toLowerCase()] ?? null;
}

export function lookupCoords({ latitude, longitude, city, state, country }) {
  // 0. Prefer real lat/lng from the row (V6 has 99.97% coverage).
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { lat: Number(latitude), lng: Number(longitude), source: 'row' };
  }

  // 1. Metro lookup: city|STATE → airport code → coords.
  const code2 = stateCode(state);
  const mk = code2 && city ? `${city.trim().toLowerCase()}|${code2}` : null;
  if (mk) {
    const airport = CITY_STATE_METRO[mk];
    if (airport && US_METRO_COORDS[airport]) {
      return { ...toLatLng(US_METRO_COORDS[airport]), source: 'metro' };
    }
  }

  // 2. State centroid fallback (handles "California" → "CA").
  if (code2) {
    const stateCoords = US_STATE_CENTROIDS[code2];
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
