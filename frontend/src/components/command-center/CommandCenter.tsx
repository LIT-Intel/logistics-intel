"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  getSavedCompanies,
  getIyCompanyProfile,
  getIyRouteKpisForCompany,
  type IyCompanyProfile,
  type IyRouteKpis,
  type SavedCompanySummary,
} from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import CommandCenterLayout from "@/components/command-center/CommandCenterLayout";
import SavedCompaniesPanel from "@/components/command-center/SavedCompaniesPanel";
import CompanyDetailPanel from "@/components/command-center/CompanyDetailPanel";

function recordKey(record: CommandCenterRecord) {
  return (
    record.company?.company_id ||
    record.company?.name ||
    (record as any)?.company?.company_name ||
    ""
  );
}

function summaryToCommandCenterRecord(
  summary: SavedCompanySummary,
): CommandCenterRecord {
  const shipments = Array.isArray(summary.raw?.payload?.shipments)
    ? summary.raw?.payload?.shipments
    : [];
  const address =
    summary.raw?.payload?.profile?.address ??
    summary.raw?.payload?.shipper?.address ??
    null;
  const country =
    summary.raw?.payload?.profile?.country_code ??
    summary.raw?.payload?.shipper?.country_code ??
    null;
  const lastActivity =
    summary.raw?.payload?.last_activity ??
    summary.raw?.payload?.shipper?.last_activity ??
    null;
  return {
    company: {
      company_id: summary.id,
      name: summary.name || summary.id,
      source: "importyeti",
      address,
      country_code: country,
      kpis: {
        shipments_12m: summary.shipments12m,
        last_activity: lastActivity,
      },
    },
    shipments,
    created_at: summary.raw?.saved_at ?? new Date().toISOString(),
  };
}

export default function CommandCenter() {
  const [savedCompanies, setSavedCompanies] = useState<CommandCenterRecord[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<IyCompanyProfile | null>(null);
  const [routeKpis, setRouteKpis] = useState<IyRouteKpis | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setSavedLoading(true);
      setSavedError(null);
      try {
        const res = await getSavedCompanies();
        if (cancelled) return;
        if (!res.ok) {
          setSavedCompanies([]);
          setSelectedKey(null);
          setSavedError("Failed to load saved companies");
          return;
        }
        const summaries = Array.isArray(res.records) ? res.records : [];
        const records = summaries.map(summaryToCommandCenterRecord);
        setSavedCompanies(records);
        setSelectedKey((prev) => {
          if (prev && records.some((record) => recordKey(record) === prev)) {
            return prev;
          }
          return records.length ? recordKey(records[0]) : null;
        });
      } catch (error: any) {
        if (cancelled) return;
        console.error("CommandCenter getSavedCompanies failed", error);
        setSavedCompanies([]);
        setSelectedKey(null);
        setSavedError(error?.message ?? "Failed to load saved companies");
      } finally {
        if (!cancelled) {
          setSavedLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRecord = useMemo(() => {
    if (!selectedKey) return null;
    return (
      savedCompanies.find((record) => recordKey(record) === selectedKey) ?? null
    );
  }, [savedCompanies, selectedKey]);

  useEffect(() => {
    const companyKey = selectedRecord?.company?.company_id;
    if (!companyKey) {
      setProfile(null);
      setRouteKpis(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    Promise.all([
      getIyCompanyProfile({ companyKey }),
      getIyRouteKpisForCompany({ companyKey }),
    ])
      .then(([profileResult, routeData]) => {
        if (cancelled) return;
        setProfile(profileResult.companyProfile);
        setRouteKpis(routeData);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setDetailError(error?.message ?? "Failed to load company profile");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRecord?.company?.company_id]);

  const actions = (
    <>
      <button className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
        Export PDF
      </button>
      <button className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
        Generate brief
      </button>
    </>
  );

  return (
    <CommandCenterLayout
      title="Command Center"
      subtitle="Saved shippers, shipment KPIs, and pre-call prep in one view."
      actions={actions}
    >
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SavedCompaniesPanel
          companies={savedCompanies}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          loading={savedLoading}
          error={savedError}
        />
        <CompanyDetailPanel
          record={selectedRecord}
          profile={profile}
          routeKpis={routeKpis}
          loading={detailLoading}
          error={detailError}
        />
      </div>
    </CommandCenterLayout>
  );
}
