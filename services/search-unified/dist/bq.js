import { BigQuery } from "@google-cloud/bigquery";
const PROJECT_ID = process.env.PROJECT_ID || "logistics-intel";
const DATASET = process.env.BQ_DATASET || "lit";
const DEFAULT_DAYS = Number(process.env.DEFAULT_LOOKBACK_DAYS || 180);
export const bq = new BigQuery({ projectId: PROJECT_ID });
export function table(name) {
    return `\`${PROJECT_ID}.${DATASET}.${name}\``;
}
export function lookbackWhere(column = "snapshot_date", days = DEFAULT_DAYS) {
    return `${column} >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)`;
}
export function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
