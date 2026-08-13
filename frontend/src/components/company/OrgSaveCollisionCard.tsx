/**
 * OrgSaveCollisionCard — collision awareness on the company profile.
 *
 * Rendered when the opened company is already saved by an ORG-MATE (visible
 * only while the workspace's "Account sharing" toggle is ON — RLS hides the
 * underlying rows entirely when it's OFF or the viewer is solo, so this
 * card simply never appears in those cases).
 *
 * Shows who saved it (name/title), when it was last worked (last activity),
 * how many contacts are already enriched, and a "Request access" action
 * that notifies the saver in-app + by email (request-company-access edge fn).
 */

import React, { useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import {
  fetchOrgSaveCollision,
  requestCompanyAccess,
  type OrgSaveCollision,
} from "@/api/orgSaves";

function formatWhen(iso: string | null): string {
  if (!iso) return "recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "recently";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function OrgSaveCollisionCard({
  companyUuid,
  companyName,
}: {
  companyUuid: string | null | undefined;
  companyName?: string | null;
}) {
  const [collision, setCollision] = useState<OrgSaveCollision | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestState, setRequestState] = useState<
    { status: "idle" } | { status: "sent"; name?: string } | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    setCollision(null);
    setRequestState({ status: "idle" });
    if (!companyUuid) return undefined;
    (async () => {
      const result = await fetchOrgSaveCollision(companyUuid);
      if (!cancelled) setCollision(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyUuid]);

  if (!companyUuid || !collision) return null;

  const handleRequest = async () => {
    if (requesting || requestState.status === "sent") return;
    setRequesting(true);
    setRequestState({ status: "idle" });
    const result = await requestCompanyAccess(companyUuid);
    setRequesting(false);
    if (result.ok) {
      setRequestState({ status: "sent", name: result.notifiedName });
    } else {
      setRequestState({ status: "error", message: result.error || "Request failed" });
    }
  };

  const initials = collision.saverName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "T";

  return (
    <div className="mx-4 mt-3 sm:mx-6 lg:mx-8">
      <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[12px] font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-display flex flex-wrap items-center gap-x-2 text-[13px] font-semibold text-slate-900">
              <Users className="h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden />
              <span className="truncate">
                Saved by {collision.saverName}
                {collision.saverTitle ? (
                  <span className="font-normal text-slate-500"> · {collision.saverTitle}</span>
                ) : null}
                {collision.otherSaverCount > 0 ? (
                  <span className="font-normal text-slate-500">
                    {" "}
                    +{collision.otherSaverCount} teammate{collision.otherSaverCount > 1 ? "s" : ""}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="font-body mt-0.5 text-[12px] text-slate-600">
              {companyName || "This company"} is already in your workspace — last activity{" "}
              {formatWhen(collision.lastActivityAt)} ·{" "}
              {collision.contactCount > 0
                ? `${collision.contactCount} contact${collision.contactCount > 1 ? "s" : ""} already enriched`
                : "no contacts enriched yet"}
              . Coordinate before reaching out.
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
          {requestState.status === "sent" ? (
            <span className="font-body text-[12px] font-medium text-emerald-700">
              Request sent{requestState.name ? ` to ${requestState.name}` : ""}
            </span>
          ) : (
            <>
              {requestState.status === "error" && (
                <span className="font-body text-[12px] text-rose-600">{requestState.message}</span>
              )}
              <button
                type="button"
                onClick={handleRequest}
                disabled={requesting}
                className="font-display inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {requesting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Request access
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
