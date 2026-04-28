import React from "react";
import {
  CheckCircle2,
  Circle,
  Users,
  ListOrdered,
  Mail,
  Send,
  ArrowRight,
} from "lucide-react";

/**
 * 4-step guided setup card for the Outbound Engine. Each step is
 * marked "done" against real data (saved-company count, campaign
 * count, connected inbox presence, first launched campaign). Honest
 * about what's still pending.
 */
export default function CampaignReadinessCard({
  savedCompaniesCount = 0,
  campaignsCount = 0,
  activeCampaignsCount = 0,
  primaryInboxEmail = null,
  inboxStatusKnown = false,
  onOpenCommandCenter,
  onNewCampaign,
  onConnectInbox,
}) {
  const steps = [
    {
      key: "companies",
      icon: Users,
      title: "Add companies from Command Center",
      description:
        savedCompaniesCount > 0
          ? `${savedCompaniesCount} saved compan${
              savedCompaniesCount === 1 ? "y" : "ies"
            } ready to target`
          : "Save shippers you want to reach",
      done: savedCompaniesCount > 0,
      cta: savedCompaniesCount > 0 ? "Review" : "Open",
      onClick: onOpenCommandCenter,
    },
    {
      key: "sequence",
      icon: ListOrdered,
      title: "Build a sequence",
      description:
        campaignsCount > 0
          ? `${campaignsCount} sequence${
              campaignsCount === 1 ? "" : "s"
            } started`
          : "Draft your first outreach sequence",
      done: campaignsCount > 0,
      cta: "New campaign",
      onClick: onNewCampaign,
    },
    {
      key: "inbox",
      icon: Mail,
      title: "Connect Gmail",
      description: !inboxStatusKnown
        ? "Email accounts not yet available in your workspace"
        : primaryInboxEmail
        ? `Connected as ${primaryInboxEmail}`
        : "Email not connected yet",
      done: Boolean(primaryInboxEmail),
      cta: primaryInboxEmail ? "Manage" : "Connect",
      onClick: onConnectInbox,
      disabled: !inboxStatusKnown,
    },
    {
      key: "launch",
      icon: Send,
      title: "Launch campaign",
      description:
        activeCampaignsCount > 0
          ? `${activeCampaignsCount} campaign${
              activeCampaignsCount === 1 ? "" : "s"
            } live`
          : "Schedule or start when you're ready",
      done: activeCampaignsCount > 0,
      cta: campaignsCount > 0 ? "Review" : "Start",
      onClick: onNewCampaign,
      disabled: campaignsCount === 0,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-black/[0.02]">
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-600">
            Setup · Outbound
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            Launch readiness
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Four steps to get your first outbound campaign out the door.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Progress
          </div>
          <div
            className="text-2xl font-semibold text-slate-900"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {completed}/{steps.length}
          </div>
        </div>
      </div>

      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.key}
              className={`flex items-start gap-3 rounded-2xl border p-4 transition ${
                step.done
                  ? "border-emerald-100 bg-emerald-50/40"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${
                  step.done
                    ? "bg-emerald-100 text-emerald-600 ring-emerald-200"
                    : "bg-slate-50 text-slate-500 ring-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {step.done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-slate-300" />
                  )}
                  <p className="text-sm font-semibold text-slate-900">
                    {step.title}
                  </p>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {step.description}
                </p>
              </div>
              <button
                type="button"
                onClick={step.onClick}
                disabled={step.disabled || !step.onClick}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {step.cta}
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
