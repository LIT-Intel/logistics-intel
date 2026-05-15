// Builds an MCP deploy_edge_function payload JSON from local source files.
// Usage: node scripts/deploy-payload.cjs <fn-name> > /tmp/payload.json
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const FUNCTIONS = {
  'pulse-refresh-tick': {
    entrypoint: 'index.ts',
    files: [
      { name: 'index.ts',                 path: 'supabase/functions/pulse-refresh-tick/index.ts' },
      { name: '../_shared/cron_auth.ts',  path: 'supabase/functions/_shared/cron_auth.ts' },
      { name: '../_shared/importyeti_fetch.ts', path: 'supabase/functions/_shared/importyeti_fetch.ts' },
      { name: '../_shared/alert_diff.ts', path: 'supabase/functions/_shared/alert_diff.ts' },
      { name: '../_shared/materialize_bols.ts', path: 'supabase/functions/_shared/materialize_bols.ts' },
    ],
  },
  'pulse-unified-shipments-backfill': {
    entrypoint: 'index.ts',
    files: [
      { name: 'index.ts',                 path: 'supabase/functions/pulse-unified-shipments-backfill/index.ts' },
      { name: '../_shared/cron_auth.ts',  path: 'supabase/functions/_shared/cron_auth.ts' },
      { name: '../_shared/materialize_bols.ts', path: 'supabase/functions/_shared/materialize_bols.ts' },
    ],
  },
  'pulse-bol-tracking-tick': {
    entrypoint: 'index.ts',
    files: [
      { name: 'index.ts',                 path: 'supabase/functions/pulse-bol-tracking-tick/index.ts' },
      { name: '../_shared/cron_auth.ts',  path: 'supabase/functions/_shared/cron_auth.ts' },
      { name: '../_shared/maersk_client.ts',    path: 'supabase/functions/_shared/maersk_client.ts' },
      { name: '../_shared/hapag_client.ts',     path: 'supabase/functions/_shared/hapag_client.ts' },
      { name: '../_shared/scac_router.ts',      path: 'supabase/functions/_shared/scac_router.ts' },
      { name: '../_shared/dcsa_event_map.ts',   path: 'supabase/functions/_shared/dcsa_event_map.ts' },
    ],
  },
  'pulse-arrival-alerts': {
    entrypoint: 'index.ts',
    files: [
      { name: 'index.ts',                 path: 'supabase/functions/pulse-arrival-alerts/index.ts' },
      { name: '../_shared/cron_auth.ts',  path: 'supabase/functions/_shared/cron_auth.ts' },
    ],
  },
  'pulse-drayage-recompute': {
    entrypoint: 'index.ts',
    files: [
      { name: 'index.ts',                 path: 'supabase/functions/pulse-drayage-recompute/index.ts' },
      { name: '../_shared/cron_auth.ts',  path: 'supabase/functions/_shared/cron_auth.ts' },
      { name: '../_shared/drayage_cost.ts',     path: 'supabase/functions/_shared/drayage_cost.ts' },
      { name: '../_shared/osrm_client.ts',      path: 'supabase/functions/_shared/osrm_client.ts' },
    ],
  },
};

const fn = process.argv[2];
const cfg = FUNCTIONS[fn];
if (!cfg) {
  console.error(`Unknown function: ${fn}. Known: ${Object.keys(FUNCTIONS).join(', ')}`);
  process.exit(1);
}

const files = cfg.files.map(({ name, path: relPath }) => {
  const fullPath = path.join(ROOT, relPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  return { name, content };
});

process.stdout.write(JSON.stringify(files));
