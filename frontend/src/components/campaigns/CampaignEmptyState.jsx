import React from "react";
import { Send, ArrowRight } from "lucide-react";

/**
 * Honest empty state when the user has no campaigns yet.
 * No fake numbers. Primary CTA routes to /app/campaigns/new.
 */
export default function CampaignEmptyState({ onNewCampaign }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 ring-1 ring-indigo-100">
        <Send className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">
        No campaigns yet
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Start your first outbound sequence. Pull target companies from
        Command Center, write your steps, and launch when you&rsquo;re ready.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onNewCampaign}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700"
        >
          New campaign
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}