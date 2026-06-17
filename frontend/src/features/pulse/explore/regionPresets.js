export const REGION_PRESETS = {
  southeast: ['FL','GA','NC','SC','TN','AL','MS'],
  west_coast: ['CA','OR','WA'],
  northeast: ['NY','NJ','MA','CT','RI','PA','VT','NH','ME'],
  midwest: ['IL','IN','MI','OH','WI','MN','IA','MO','KS','NE','ND','SD'],
  southwest: ['TX','OK','NM','AZ'],
  mountain: ['CO','UT','WY','MT','ID','NV'],
};

export const REGION_LABELS = {
  southeast: 'Southeast',
  west_coast: 'West Coast',
  northeast: 'Northeast',
  midwest: 'Midwest',
  southwest: 'Southwest',
  mountain: 'Mountain',
};

export function expandRegion(key) {
  return REGION_PRESETS[key] ?? [];
}
