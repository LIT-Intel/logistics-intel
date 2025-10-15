// Temporary stub to disconnect the app from Base44.
// Prevents redirects/500s and lets UI render with fallback data.
export const base44 = {
  entities: {},            // not used in demo mode
  auth: {},                // not used in demo mode
  integrations: { Core: {} },
  functions: new Proxy({}, {
    get: (_, key) => {
      // Return a no-throw async function with safe defaults
      return async () => {
        // minimal fallbacks for common screens
        if (key === 'getCompanyOverview') {
          return {
            kpis: { companies: 0, shipments: 0, outreachToday: 0 },
            charts: [],
            recent: []
          };
        }
        if (key === 'searchShipments') return { items: [], total: 0 };
        if (key === 'getOutreachHistory') return [];
        return null; // unknown calls resolve to null, not throw
      };
    }
  })
};
