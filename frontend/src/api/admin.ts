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
