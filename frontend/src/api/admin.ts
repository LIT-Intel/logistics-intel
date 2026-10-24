/**
 * Admin domain — org admin + platform admin operations.
 *
 * Routes through the `admin-api` edge function which gates on
 * `platform_admins` membership before exposing cross-tenant data. See
 * `docs/superpowers/plans/2026-05-28-admin-dashboard-rebuild.md`.
 */
import { invokeEdge } from "./_client";

export interface AdminApiRequest {
  action: string;
  params?: Record<string, unknown>;
}

export interface AdminApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface AdminAuditExportRequest {
  start_date?: string;
  end_date?: string;
  actor_id?: string;
  org_id?: string;
  action?: string;
  format?: "json" | "csv";
}

export interface AdminAuditExportResponse {
  ok: boolean;
  rows?: unknown[];
  url?: string;
  count?: number;
  error?: string;
}

export interface AdminNotifyRequest {
  event: string;
  subject: string;
  summary: string;
  details?: unknown;
  cta_url?: string;
  cta_label?: string;
  to?: string;
  cc?: string | string[];
}

/** Call any `admin-api` action; the function validates platform-admin role. */
export async function adminApi<T = unknown>(
  req: AdminApiRequest,
): Promise<AdminApiResponse<T>> {
  return invokeEdge<AdminApiResponse<T>>("admin-api", req as unknown as Record<string, unknown>);
}

/** Export rows from the admin audit log. */
export async function adminAuditExport(
  req: AdminAuditExportRequest = {},
): Promise<AdminAuditExportResponse> {
  return invokeEdge<AdminAuditExportResponse>("admin-audit-export", req);
}

/**
 * Trigger a platform-level admin notification (Slack/email). Requires
 * `admin_notify_secret` from `lit_internal_secrets` in the Authorization
 * header — server-side only; do not call from the browser.
 */
export async function adminNotify(req: AdminNotifyRequest): Promise<{ ok: boolean; error?: string }> {
  return invokeEdge<{ ok: boolean; error?: string }>("admin-notify", req as unknown as Record<string, unknown>);
}

export interface AdminCreateOrgRequest {
  name: string;
  plan?: string;
}

export interface AdminCreateUserRequest {
  email: string;
  full_name: string;
  password: string;
  org_id: string;
  role?: "owner" | "admin" | "member";
  title?: string;
}

/**
 * Manually create a company (organization) account — no signup required.
 * Platform-admin only (gated server-side). Used for demo accounts.
 */
export async function adminCreateOrg(
  req: AdminCreateOrgRequest,
): Promise<AdminApiResponse<{ org: { id: string; name: string } }>> {
  return adminApi({ action: "create_org", params: req as unknown as Record<string, unknown> });
}

/**
 * Manually create a user and add them to an organization — no invitation
 * required. The caller sets the password; no invite email is sent.
 * Platform-admin only (gated server-side). Used for demo accounts.
 */
export async function adminCreateUser(
  req: AdminCreateUserRequest,
): Promise<AdminApiResponse<{ user: { id: string; email: string }; org_id: string }>> {
  return adminApi({ action: "create_user", params: req as unknown as Record<string, unknown> });
}

export interface AdminDeleteOrgRequest {
  org_id: string;
}

/**
 * Permanently delete a company (organization) account and its membership
 * data. The UI enforces type-to-confirm before calling. Business data
 * (campaigns, leads, etc.) is intentionally NOT wiped — the server refuses
 * deletion while associated data exists. Platform-admin only (gated
 * server-side). Used to remove demo accounts.
 */
export async function adminDeleteOrg(
  req: AdminDeleteOrgRequest,
): Promise<AdminApiResponse<{ org: { id: string; name: string } }>> {
  return adminApi({ action: "delete_org", params: req as unknown as Record<string, unknown> });
}
