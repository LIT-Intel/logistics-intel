"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  getSavedCompanies,
  getIyCompanyProfile,
  getIyRouteKpisForCompany,
  type IyCompanyProfile,
  type IyRouteKpis,
} from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import { useAuth } from "@/auth/AuthProvider";
import CommandCenterHeader from "@/components/command-center/CommandCenterHeader";
import SavedCompaniesPanel from "@/components/command-center/SavedCompaniesPanel";
import CompanyDetailPanel from "@/components/command-center/CompanyDetailPanel";
import QuickActionsButton from "@/components/dashboard/QuickActionsButton";

function recordKey(record: CommandCenterRecord) {
  return (
    record.company?.company_id ||
    record.company?.name ||
    (record as any)?.company?.company_name ||
    ""
  );
}

export default function CommandCenter() {
  const { user } = useAuth();
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

  return (
    <>
      <div className="space-y-6">
        <CommandCenterHeader
          userName={user?.email || user?.displayName || 'User'}
          companiesCount={savedCompanies.length}
          onGenerateBrief={() => {
            // TODO: Implement brief generation
            console.log('Generate brief');
          }}
          onExportPDF={() => {
            // TODO: Implement PDF export
            console.log('Export PDF');
          }}
          onAddCompany={() => {
            // TODO: Implement add company modal
            console.log('Add company');
          }}
        />

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
      </div>

      <QuickActionsButton />
    </>
  );
}
