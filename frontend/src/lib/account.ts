import { getGatewayBase } from "@/lib/env";

const base = getGatewayBase();
const json = (r: Response) => {
  if (!r.ok) {
    return r.text().then((text) => {
      throw new Error(text || `Request failed ${r.status}`);
    });
  }
  return r.json();
};

export const accountApi = {
  getMe: (userId: string) =>
    fetch(`${base}/public/me?user_id=${encodeURIComponent(userId)}`).then(json),
  updateMe: (userId: string, body: unknown) =>
    fetch(`${base}/public/me?user_id=${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(json),
  authStatus: (userId: string) =>
    fetch(`${base}/public/auth/status?user_id=${encodeURIComponent(userId)}`).then(json),
  mockConnect: (userId: string, provider: "google" | "microsoft") =>
    fetch(`${base}/public/auth/mockConnect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId, provider }),
    }).then(json),
  billingPortal: (userId: string) =>
    fetch(`${base}/public/billing/portal?user_id=${encodeURIComponent(userId)}`).then(json),
};
