import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import pg from 'pg';

const {
  INSTANCE_CONNECTION_NAME,   // e.g. logistics-intel:us-central1:lit-sql
  DB_USER = 'litapp',
  DB_NAME = 'litcrm',
  DB_PASS,                    // optional if using IAM auth
  USE_IAM = 'false'
} = process.env;

let pool: pg.Pool | undefined;

export async function getPool(): Promise<pg.Pool> {
  if (pool) return pool;
  if (!INSTANCE_CONNECTION_NAME) throw new Error('INSTANCE_CONNECTION_NAME is required');
  const connector = new Connector();
  const clientOpts = await connector.getOptions({
    instanceConnectionName: INSTANCE_CONNECTION_NAME,
    ipType: IpAddressTypes.PRIVATE
  });

  const config: pg.PoolConfig = {
    ...clientOpts,
    user: DB_USER,
    database: DB_NAME,
    // host, port, ssl are injected by connector clientOpts
    max: 10,
  };

  if (USE_IAM !== 'true') {
    if (!DB_PASS) throw new Error('DB_PASS is required when USE_IAM!=true');
    config.password = DB_PASS;
  }

  pool = new pg.Pool(config);
  return pool;
}

export async function initSchema(): Promise<void> {
  const p = await getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id BIGSERIAL PRIMARY KEY,
      external_ref TEXT,
      name TEXT NOT NULL,
      website TEXT,
      plan TEXT DEFAULT 'Free',
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id BIGSERIAL PRIMARY KEY,
      company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
      full_name TEXT,
      title TEXT,
      email TEXT,
      linkedin TEXT,
      phone TEXT,
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS outreach_history (
      id BIGSERIAL PRIMARY KEY,
      company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
      contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
      channel TEXT CHECK (channel IN ('email','linkedin')),
      subject TEXT,
      snippet TEXT,
      status TEXT,
      meta JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS feature_flags (
      id BIGSERIAL PRIMARY KEY,
      key TEXT UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT true,
      plan TEXT DEFAULT 'All'
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor TEXT,
      action TEXT,
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS saved_companies (
      id BIGSERIAL PRIMARY KEY,
      company_id TEXT NOT NULL UNIQUE,
      stage TEXT DEFAULT 'prospect',
      provider TEXT DEFAULT 'importyeti',
      payload JSONB NOT NULL,
      user_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_saved_companies_stage ON saved_companies(stage);
    CREATE INDEX IF NOT EXISTS idx_saved_companies_user_id ON saved_companies(user_id);
    CREATE TABLE IF NOT EXISTS campaigns (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      sequence JSONB,
      settings JSONB,
      user_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS campaign_companies (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT REFERENCES campaigns(id) ON DELETE CASCADE,
      company_id TEXT NOT NULL,
      contact_ids JSONB,
      status TEXT DEFAULT 'pending',
      added_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(campaign_id, company_id)
    );
    CREATE INDEX IF NOT EXISTS idx_campaign_companies_campaign_id ON campaign_companies(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_companies_company_id ON campaign_companies(company_id);
    CREATE TABLE IF NOT EXISTS rfps (
      id BIGSERIAL PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT,
      lanes JSONB,
      status TEXT DEFAULT 'draft',
      files JSONB,
      user_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_rfps_company_id ON rfps(company_id);
    CREATE TABLE IF NOT EXISTS user_settings (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      settings JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

export async function audit(actor: string | null, action: string, details: any) {
  const p = await getPool();
  await p.query(`INSERT INTO audit_logs(actor, action, details) VALUES($1,$2,$3)` , [actor, action, details ?? null]);
}
