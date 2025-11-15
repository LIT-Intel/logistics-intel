import type { BigQuery } from "@google-cloud/bigquery";
import { bq } from "../bq.js";

let client: BigQuery | null = null;

export async function getClient(): Promise<BigQuery> {
  if (!client) {
    client = bq;
  }
  return client;
}


