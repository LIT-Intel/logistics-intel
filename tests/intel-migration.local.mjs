// Run with: node tests/intel-migration.local.mjs
// Isolated PostgreSQL WASM runtime; no production connection or credentials.
import { PGlite } from '../.audit-runtime/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create role supabase_auth_admin;
 create schema auth;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,onboarding_completed_at timestamptz,updated_at timestamptz,plan text);
 create function public.lit_is_blocked_email(text) returns boolean language sql as $$select $1 like '%@disposable.test'$$;
 create function public.lit_is_gibberish_name(text) returns boolean language sql as $$select false$$;
 insert into auth.users values ('00000000-0000-0000-0000-000000000001','existing@gmail.com');
 insert into public.profiles(id,plan) values ('00000000-0000-0000-0000-000000000001','enterprise'),('00000000-0000-0000-0000-000000000002','free');
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261019172039_intel_accuracy_signup_onboarding.sql',import.meta.url),'utf8'));
for (const email of ['a@gmail.com','a@GMAIL.COM','a@sub.gmail.com','a@outlook.co.uk','a@disposable.test','a@invalid','a@@corp.com']) {
  const r = await db.query('select private.work_email_allowed($1) as allowed',[email]);
  assert.equal(r.rows[0].allowed,false,email);
}
assert.equal((await db.query("select private.work_email_allowed('sales@acme-logistics.com') as allowed")).rows[0].allowed,true);
await assert.rejects(db.exec("insert into auth.users values ('00000000-0000-0000-0000-000000000003','new@gmail.com')"),/company email/);
await db.exec("update auth.users set email='existing@gmail.com' where id='00000000-0000-0000-0000-000000000001'");
await db.exec("insert into private.signup_domain_allowlist values ('gmail.com','verified exception','test operator',now()+interval '1 day')");
assert.equal((await db.query("select private.work_email_allowed('a@gmail.com') as allowed")).rows[0].allowed,true);
assert.equal((await db.query("select private.work_email_allowed('a@sub.gmail.com') as allowed")).rows[0].allowed,false);
await db.exec("update private.signup_domain_allowlist set expires_at=now()-interval '1 day'");
assert.equal((await db.query("select private.work_email_allowed('a@gmail.com') as allowed")).rows[0].allowed,false);
await db.exec("set role supabase_auth_admin");
assert.equal((await db.query(`select public.hook_restrict_signup('{"user":{"email":"new@gmail.com"}}') as result`)).rows[0].result.error.http_code,400);
await db.exec("reset role; set role authenticated");
await assert.rejects(db.query('select * from private.signup_domain_allowlist'),/permission denied/);
assert.equal((await db.query("select public.lit_complete_onboarding_v2('Sales','Manager',array['Ocean FCL']) as result")).rows[0].result.reason,'unauthenticated');
await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)");
assert.equal((await db.query("select public.lit_complete_onboarding_v2('Sales','Manager',array['Invented']) as result")).rows[0].result.ok,false);
const first=(await db.query("select public.lit_complete_onboarding_v2('Sales','Manager',array['Ocean FCL','Ocean LCL'],array['United States']) as result")).rows[0].result;
assert.equal(first.ok,true);
const second=(await db.query("select public.lit_complete_onboarding_v2('Sales','Director',array['Ocean FCL']) as result")).rows[0].result;
assert.equal(second.onboarding_completed_at,first.onboarding_completed_at);
await db.exec('reset role');
const profiles=(await db.query('select * from public.profiles order by id')).rows;
assert.equal(profiles[0].plan,'enterprise');
assert.equal(profiles[1].onboarding_completed_at,null);
assert.deepEqual(profiles[0].onboarding_preferences.sales_geographies,[]);
console.log('PASS: domain rules, exact/expired exceptions, insert enforcement, existing account preservation, hook permissions, onboarding validation/isolation/idempotency, billing preservation');
await db.close();
