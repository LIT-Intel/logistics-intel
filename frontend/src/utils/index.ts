


const APP_PAGES = new Set([
  'dashboard','search','companies','campaigns','emailcenter','rfpstudio','settings','billing','affiliate','admindashboard','leadprospecting','cmsmanager','diagnostic','adminagent','searchpanel','transactions','widgets'
]);

export function createPageUrl(pageName: string) {
  const normalized = (pageName || '').toString().trim();
  const [nameOnly, query = ''] = normalized.split('?');
  const slug = nameOnly.replace(/\//g,'').toLowerCase().replace(/\s+/g,'-');
  const isApp = APP_PAGES.has(slug.replace(/-/g,''));
  const base = isApp ? `/app/${slug}` : `/${slug}`;
  return query ? `${base}?${query}` : base;
}