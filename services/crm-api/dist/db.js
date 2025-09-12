import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import pg from 'pg';
const { INSTANCE_CONNECTION_NAME, // e.g. logistics-intel:us-central1:lit-sql
DB_USER = 'litapp', DB_NAME = 'litcrm', DB_PASS, // optional if using IAM auth
USE_IAM = 'false' } = process.env;
let pool;
export async function getPool() {
    if (pool)
        return pool;
    if (!INSTANCE_CONNECTION_NAME)
        throw new Error('INSTANCE_CONNECTION_NAME is required');
    const connector = new Connector();
    const clientOpts = await connector.getOptions({
        instanceConnectionName: INSTANCE_CONNECTION_NAME,
        ipType: IpAddressTypes.PRIVATE
    });
    const config = {
        ...clientOpts,
        user: DB_USER,
        database: DB_NAME,
        // host, port, ssl are injected by connector clientOpts
        max: 10,
    };
    if (USE_IAM !== 'true') {
        if (!DB_PASS)
            throw new Error('DB_PASS is required when USE_IAM!=true');
        config.password = DB_PASS;
    }
    pool = new pg.Pool(config);
    return pool;
}
export async function initSchema() {
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
  `);
}
