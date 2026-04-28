// AdminData.jsx — Seed data for Admin Dashboard
'use strict';

/* All data here stands in for real Supabase / platform queries.
   Keys match existing LIT backend conventions where possible:
   - lit_users / auth.users (id, email, plan, role)
   - lit_campaigns (id, status, daily_sent, errors)
   - lit_campaign_step_runs (scheduled, in_progress, failed, retry)
   - lit_outreach_history (provider, sent_at, status)
   - lit_audit_log (actor, action, target, ts)
*/

function seedSpark(n, base, vol) {
  const out = [];
  let v = base;
  for (let i=0;i<n;i++){ v += (Math.random()-0.4)*vol; v = Math.max(base*0.3, v); out.push(Math.round(v)); }
  return out;
}

const ADMIN_DATA = {
  overview: {
    totalUsers:     { v: 1842, trend:'+4.2%', spark: seedSpark(24, 1700, 80) },
    activeUsers7d:  { v: 1120, trend:'+6.8%', spark: seedSpark(24, 1000, 60) },
    companies:      { v: 284029, trend:'+0.9%', spark: seedSpark(24, 280000, 800), unit:'' },
    contacts:       { v: 1940210, trend:'+1.4%', spark: seedSpark(24, 1900000, 4000) },
    campaigns:      { v: 412, trend:'+11%', spark: seedSpark(24, 380, 20) },
    outreachSent24h:{ v: 18420, trend:'+3.1%', spark: seedSpark(24, 14000, 1400) },
    errorRate:      { v: 0.42, trend:'-0.18%', spark: seedSpark(24, 0.6, 0.25), unit:'%' },
    apiLatencyMs:   { v: 142, trend:'-9ms',  spark: seedSpark(24, 160, 20), unit:'ms' },
  },

  // Health stoplight panels
  systemHealth: [
    { svc:'API · api.logisticintel.com',      status:'ok',       uptime:'99.98%',  latency:'128ms', note:'p95 · us-west-1' },
    { svc:'Supabase · Primary DB',            status:'ok',       uptime:'99.99%',  latency:'22ms',  note:'pool 34/100' },
    { svc:'Supabase · Edge Functions',        status:'ok',       uptime:'99.94%',  latency:'88ms',  note:'8 deployed' },
    { svc:'Stripe · Billing Webhooks',        status:'ok',       uptime:'100%',    latency:'—',     note:'last event 2m ago' },
    { svc:'Gmail API · OAuth',                status:'ok',       uptime:'99.91%',  latency:'210ms', note:'' },
    { svc:'Outlook / Microsoft Graph',        status:'degraded', uptime:'98.40%',  latency:'612ms', note:'elevated errors — MS known incident' },
    { svc:'PhantomBuster · LinkedIn agents',  status:'ok',       uptime:'99.20%',  latency:'—',     note:'48 agents running' },
    { svc:'ImportYeti · Ingestion',           status:'warning',  uptime:'99.60%',  latency:'—',     note:'last refresh 11h ago (SLA 6h)' },
    { svc:'Clay / Apollo · Enrichment',       status:'ok',       uptime:'99.85%',  latency:'410ms', note:'' },
    { svc:'OpenAI · Insights engine',         status:'ok',       uptime:'99.90%',  latency:'890ms', note:'gpt-4o · fallback active' },
  ],

  // Plan / subscription distribution (counts)
  planDistribution: [
    { plan:'Free',        count: 812,  mrr: 0,     color:'#64748B' },
    { plan:'Growth',      count: 684,  mrr: 40756, color:'#3B82F6' },
    { plan:'Scale',       count: 268,  mrr: 74864, color:'#00F0FF' },
    { plan:'Enterprise',  count:  78,  mrr: 39910, color:'#8B5CF6' },
  ],

  // Users table
  users: [
    { id:'u_1a', name:'Jordan Davis',    email:'jordan@logisticintel.com',   role:'superadmin', plan:'Enterprise', seats:12, last:'active now',     org:'Logistic Intel',       status:'active',    mrr:1498, joined:'Jan 12, 2025', flagged:false },
    { id:'u_2b', name:'Mika Harrison',   email:'mika@logisticintel.com',     role:'admin',      plan:'Enterprise', seats:12, last:'2h ago',         org:'Logistic Intel',       status:'active',    mrr:0,    joined:'Jan 18, 2025', flagged:false },
    { id:'u_3c', name:'Tomás Reyes',     email:'tomas@harborlogistics.group',role:'admin',      plan:'Scale',      seats:6,  last:'14m ago',        org:'Harbor Logistics',     status:'active',    mrr:894,  joined:'Feb 14, 2026', flagged:false },
    { id:'u_4d', name:'Priya Narang',    email:'priya@coastalfreight.com',   role:'user',       plan:'Growth',     seats:4,  last:'yesterday',      org:'Coastal Freight Co.',  status:'active',    mrr:596,  joined:'Mar 2, 2026',  flagged:false },
    { id:'u_5e', name:'Alex Chen',       email:'alex@atlasglobal.co',        role:'user',       plan:'Growth',     seats:3,  last:'4d ago',         org:'Atlas Global',         status:'active',    mrr:447,  joined:'Mar 18, 2026', flagged:true  },
    { id:'u_6f', name:'Dana Ortiz',      email:'dana@meridiancargo.com',     role:'admin',      plan:'Growth',     seats:2,  last:'active now',     org:'Meridian Cargo',       status:'active',    mrr:298,  joined:'Apr 1, 2026',  flagged:false },
    { id:'u_7g', name:'Reva Bhatt',      email:'reva@nsfreight.com',         role:'user',       plan:'Free',       seats:1,  last:'11d ago',        org:'NorthStar Freight',    status:'inactive',  mrr:0,    joined:'Feb 3, 2026',  flagged:false },
    { id:'u_8h', name:'Luca Moretti',    email:'luca@mareloco.it',           role:'user',       plan:'Scale',      seats:4,  last:'1h ago',         org:'Mare Loco',            status:'active',    mrr:596,  joined:'Jan 9, 2026',  flagged:false },
    { id:'u_9i', name:'Kaia Johansson',  email:'kaia@nordicfreight.se',      role:'user',       plan:'Growth',     seats:2,  last:'3d ago',         org:'Nordic Freight AB',    status:'active',    mrr:298,  joined:'Apr 14, 2026', flagged:false },
    { id:'u_10', name:'Brandon Kim',     email:'bk@pacificcontainer.com',    role:'user',       plan:'Free',       seats:1,  last:'30d+',           org:'Pacific Container',    status:'suspended', mrr:0,    joined:'Oct 3, 2025',  flagged:true  },
    { id:'u_11', name:'Owen Fletcher',   email:'owen@redsealines.com',       role:'admin',      plan:'Scale',      seats:5,  last:'active now',     org:'RedSea Lines',         status:'active',    mrr:745,  joined:'Mar 22, 2026', flagged:false },
    { id:'u_12', name:'Samira Patel',    email:'samira@sskl.co',             role:'user',       plan:'Enterprise', seats:20, last:'22m ago',        org:'SSKL Global',          status:'active',    mrr:2490, joined:'Dec 1, 2025',  flagged:false },
  ],

  // Campaigns
  campaigns: [
    { id:'cmp_301', name:'Q2 · EU Importers · Ocean',    org:'Logistic Intel',     owner:'Jordan D.', status:'sending',  sentToday:218, queued:84,  errors:2, contacts:540,  provider:'Gmail',   steps:4, lastEvent:'2m ago' },
    { id:'cmp_298', name:'Atlanta Outbound Warm Lanes',  org:'Harbor Logistics',   owner:'Tomás R.',  status:'sending',  sentToday:144, queued:40,  errors:0, contacts:310,  provider:'Gmail',   steps:3, lastEvent:'30s ago' },
    { id:'cmp_295', name:'LATAM · Perishables RFP',      org:'Coastal Freight',    owner:'Priya N.',  status:'paused',   sentToday:0,   queued:120, errors:0, contacts:260,  provider:'Outlook', steps:5, lastEvent:'yesterday' },
    { id:'cmp_292', name:'LinkedIn · C-Suite Shippers',  org:'Logistic Intel',     owner:'Mika H.',   status:'sending',  sentToday:62,  queued:28,  errors:1, contacts:180,  provider:'LinkedIn',steps:3, lastEvent:'5m ago' },
    { id:'cmp_288', name:'Reengagement · Q1 No-replies', org:'Atlas Global',       owner:'Alex C.',   status:'failed',   sentToday:0,   queued:0,   errors:14,contacts:412,  provider:'Outlook', steps:4, lastEvent:'11m ago' },
    { id:'cmp_283', name:'Apparel Shippers · Spring',    org:'Mare Loco',          owner:'Luca M.',   status:'sending',  sentToday:88,  queued:54,  errors:0, contacts:210,  provider:'Gmail',   steps:3, lastEvent:'1m ago' },
    { id:'cmp_279', name:'Scandinavian Exporters',       org:'Nordic Freight AB',  owner:'Kaia J.',   status:'draft',    sentToday:0,   queued:0,   errors:0, contacts:98,   provider:'Gmail',   steps:3, lastEvent:'3d ago' },
    { id:'cmp_271', name:'Reefer RFP Follow-up',         org:'RedSea Lines',       owner:'Owen F.',   status:'sending',  sentToday:174, queued:72,  errors:0, contacts:380,  provider:'Gmail',   steps:4, lastEvent:'just now' },
    { id:'cmp_264', name:'Refrigerated Pharma · AMER',   org:'SSKL Global',        owner:'Samira P.', status:'sending',  sentToday:302, queued:148, errors:3, contacts:640,  provider:'Gmail',   steps:5, lastEvent:'3m ago' },
    { id:'cmp_260', name:'Lane Test · TPEB · Low-vol',   org:'Meridian Cargo',     owner:'Dana O.',   status:'completed',sentToday:0,   queued:0,   errors:0, contacts:42,   provider:'Outlook', steps:3, lastEvent:'2d ago' },
  ],

  // Queue snapshot (lit_campaign_step_runs)
  queue: {
    scheduled:   8420,
    inProgress:   182,
    failed:        47,
    retryPending: 124,
    completed24h: 17840,
    avgRuntime:   '842ms',
    oldestPending:'22m',
    series: seedSpark(30, 400, 80), // last 30 min throughput
  },

  queueErrors: [
    { id:'err_4821', provider:'Outlook',     code:'GRAPH_5xx',       message:'Graph API 503 · retry scheduled',           campaign:'cmp_298', ts:'3m ago',  attempts:2 },
    { id:'err_4820', provider:'Gmail',       code:'RATELIMIT',       message:'User-level rate limit, backing off 15m',    campaign:'cmp_283', ts:'7m ago',  attempts:1 },
    { id:'err_4814', provider:'PhantomBuster',code:'AGENT_AUTH',     message:'LinkedIn session cookie expired · notify',  campaign:'cmp_292', ts:'12m ago', attempts:3 },
    { id:'err_4805', provider:'Outlook',     code:'INVALID_RECIP',   message:'Recipient rejected · moved to suppression', campaign:'cmp_288', ts:'20m ago', attempts:1 },
    { id:'err_4799', provider:'Webhook',     code:'TIMEOUT',         message:'Customer webhook 30s timeout · requeued',   campaign:'cmp_264', ts:'28m ago', attempts:2 },
    { id:'err_4786', provider:'Stripe',      code:'WEBHOOK_VERIFY',  message:'Signature mismatch on 1 event · escalated', campaign:'—',       ts:'41m ago', attempts:1 },
  ],

  // Data ingestion pipeline
  ingestion: [
    { name:'ImportYeti · BOL feed',          last:'11h ago',  status:'warning', records:'1.42M rows',  deltaPct:-3.1, next:'in 12m',  note:'SLA 6h · investigating upstream' },
    { name:'US Customs · 30d rolling',       last:'42m ago',  status:'ok',      records:'402k rows',   deltaPct:+0.9, next:'in 18m',  note:'CBP feed healthy' },
    { name:'Clay enrichment · companies',    last:'5m ago',   status:'ok',      records:'284k entities',deltaPct:+0.4,next:'streaming',note:'' },
    { name:'Apollo enrichment · contacts',   last:'12m ago',  status:'ok',      records:'1.94M people',deltaPct:+1.1, next:'streaming',note:'' },
    { name:'Shipment snapshots · weekly',    last:'2d ago',   status:'ok',      records:'18.2M events',deltaPct:+4.2, next:'in 5d',   note:'' },
    { name:'Carrier lane index',             last:'6h ago',   status:'ok',      records:'48k lanes',   deltaPct:+0.2, next:'in 18h',  note:'' },
    { name:'OpenCorporates · entity link',   last:'3d ago',   status:'stale',   records:'96k updates', deltaPct:0,    next:'manual',  note:'cron disabled · rerun needed' },
  ],

  // Feature flags (per-plan + global)
  flags: [
    { key:'ai_insights_v2',      label:'AI Insights v2',            desc:'Second-gen company brief with LLM summary',        scope:'per-plan', free:false, growth:false, scale:true,  enterprise:true,  globalKill:false, rollout:82, owner:'eng-insights', updated:'2d ago' },
    { key:'predictive_score',    label:'Predictive buyer score',    desc:'Shipment-based propensity model (beta)',           scope:'per-plan', free:false, growth:false, scale:false, enterprise:true,  globalKill:false, rollout:25, owner:'ml-platform', updated:'5h ago' },
    { key:'multi_inbox',         label:'Multi-inbox sending',       desc:'Multiple connected sender inboxes per campaign',   scope:'per-plan', free:false, growth:true,  scale:true,  enterprise:true,  globalKill:false, rollout:100,owner:'outreach',    updated:'1w ago' },
    { key:'webhook_v2',          label:'Webhook v2 API',            desc:'Signed delivery + DLQ support',                    scope:'per-plan', free:false, growth:false, scale:true,  enterprise:true,  globalKill:false, rollout:60, owner:'platform',    updated:'3d ago' },
    { key:'deal_builder_exports',label:'Deal Builder · CSV exports',desc:'Export quote/RFP benchmarks to CSV',               scope:'per-plan', free:false, growth:true,  scale:true,  enterprise:true,  globalKill:false, rollout:100,owner:'deals',       updated:'2w ago' },
    { key:'new_dashboard',       label:'Dashboard redesign',        desc:'New KPI layout · rollout',                         scope:'per-plan', free:true,  growth:true,  scale:true,  enterprise:true,  globalKill:false, rollout:100,owner:'design',      updated:'1mo ago' },
    { key:'li_scraper_v2',       label:'LinkedIn scraper v2',       desc:'New PhantomBuster agent pipeline',                 scope:'global',   free:null,  growth:null,  scale:null,  enterprise:null,  globalKill:false, rollout:40, owner:'outreach',    updated:'12h ago' },
    { key:'maintenance_read_only',label:'Read-only mode',           desc:'Kill-switch for write endpoints during incident',  scope:'global',   free:null,  growth:null,  scale:null,  enterprise:null,  globalKill:false, rollout:0,  owner:'sre',         updated:'—' },
  ],

  // Audit log — last 50 events combined
  audit: [
    { id:'a_9102', ts:'just now',  actor:'Jordan Davis',       actorRole:'superadmin',  action:'flag.toggle',        target:'ai_insights_v2 · Growth→true',          severity:'info',   source:'admin' },
    { id:'a_9101', ts:'1m ago',    actor:'Mika Harrison',      actorRole:'admin',       action:'campaign.pause',     target:'cmp_295 · LATAM · Perishables RFP',     severity:'warn',   source:'admin' },
    { id:'a_9098', ts:'4m ago',    actor:'system',             actorRole:'system',      action:'webhook.retry',      target:'stripe.invoice.payment_failed · 1×',    severity:'info',   source:'job'   },
    { id:'a_9094', ts:'11m ago',   actor:'Jordan Davis',       actorRole:'superadmin',  action:'user.role_change',   target:'tomas@harborlogistics.group → admin',   severity:'warn',   source:'admin' },
    { id:'a_9089', ts:'18m ago',   actor:'Alex Chen',          actorRole:'user',        action:'oauth.revoked',      target:'Outlook · Microsoft Graph',             severity:'info',   source:'app'   },
    { id:'a_9081', ts:'32m ago',   actor:'system',             actorRole:'system',      action:'ingest.fail',        target:'ImportYeti · BOL feed (SLA miss)',      severity:'error',  source:'job'   },
    { id:'a_9076', ts:'48m ago',   actor:'Jordan Davis',       actorRole:'superadmin',  action:'user.suspend',       target:'bk@pacificcontainer.com',               severity:'warn',   source:'admin' },
    { id:'a_9068', ts:'1h ago',    actor:'system',             actorRole:'system',      action:'stripe.subscription',target:'owen@redsealines.com · Scale · updated',severity:'info',   source:'webhook'},
    { id:'a_9061', ts:'2h ago',    actor:'Mika Harrison',      actorRole:'admin',       action:'flag.toggle',        target:'predictive_score · rollout 25%',        severity:'info',   source:'admin' },
    { id:'a_9055', ts:'3h ago',    actor:'Jordan Davis',       actorRole:'superadmin',  action:'campaign.force_stop',target:'cmp_288 · error rate 3.4%',             severity:'warn',   source:'admin' },
    { id:'a_9049', ts:'5h ago',    actor:'system',             actorRole:'system',      action:'auth.bruteforce',    target:'login attempts from 203.0.113.* · blocked',severity:'error',source:'sec'   },
    { id:'a_9040', ts:'7h ago',    actor:'Tomás Reyes',        actorRole:'admin',       action:'invite.send',        target:'3 teammates · Harbor Logistics',        severity:'info',   source:'app'   },
    { id:'a_9032', ts:'11h ago',   actor:'system',             actorRole:'system',      action:'quota.breach',       target:'Gmail daily send · user u_5e · 98%',    severity:'warn',   source:'job'   },
    { id:'a_9028', ts:'Yesterday', actor:'Jordan Davis',       actorRole:'superadmin',  action:'apikey.revoke',      target:'lit_live_****8c41 · read',              severity:'warn',   source:'admin' },
    { id:'a_9019', ts:'Yesterday', actor:'system',             actorRole:'system',      action:'stripe.webhook',     target:'invoice.paid · INV-20260401',           severity:'info',   source:'webhook'},
    { id:'a_9011', ts:'Yesterday', actor:'Priya Narang',       actorRole:'user',        action:'oauth.connect',      target:'Gmail · priya@coastalfreight.com',      severity:'info',   source:'app'   },
  ],
};

window.ADMIN_DATA = ADMIN_DATA;
