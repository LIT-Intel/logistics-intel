"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  getSavedCompanies,
  getIyCompanyProfile,
  getIyRouteKpisForCompany,
  normalizeIyCompanyProfile,
  type IyCompanyProfile,
  type IyRouteKpis,
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
    const controller = new AbortController();
    setSavedLoading(true);
    setSavedError(null);
    getSavedCompanies(controller.signal)
      .then((response) => {
        const rows = Array.isArray(response?.rows) ? response.rows : [];
        setSavedCompanies(rows as CommandCenterRecord[]);
        setSelectedKey((prev) => {
          if (prev && rows.some((row: CommandCenterRecord) => recordKey(row) === prev)) {
            return prev;
          }
          return rows.length ? recordKey(rows[0] as CommandCenterRecord) : null;
        });
      })
      .catch((error: any) => {
        setSavedError(error?.message ?? "Failed to load saved companies");
      })
      .finally(() => setSavedLoading(false));
    return () => controller.abort();
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
      getIyCompanyProfile(companyKey),
      getIyRouteKpisForCompany({ companyKey }),
    ])
      .then(([profileData, routeData]) => {
        if (cancelled) return;
        const normalized =
          profileData?.rawProfile
            ? normalizeIyCompanyProfile(profileData.rawProfile, companyKey)
            : null;
        setProfile(normalized);
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
