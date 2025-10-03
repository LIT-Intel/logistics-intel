import {BigQuery} from "@google-cloud/bigquery";

const bq = new BigQuery();
const DATASET = process.env.BQ_DATASET || "lit";
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID;

export async function insert(table, row) {
  const dataset = bq.dataset(DATASET);
  const tbl = dataset.table(table);
  await tbl.insert([row]);
}

export async function nowTs() {
  // BigQuery TIMESTAMP compatible (UTC ISO)
  return new Date().toISOString().replace('Z','Z');
}