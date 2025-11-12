import { bq } from "../bq.js";
let client = null;
export async function getClient() {
    if (!client) {
        client = bq;
    }
    return client;
}
