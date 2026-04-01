"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  listSavedCompanies,
  getSavedCompanyDetail,
  getFclShipments12m,
  getLclShipments12m,
  buildYearScopedProfile,
  type IyCompanyProfile,
  type IyRouteKpis,
} from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { generateCompanyBrief } from "@/lib/openaiApi";
import { useToast } from "@/components/ui/use-toast";
import CommandCenterHeader from "@/components/command-center/CommandCenterHeader";
import SavedCompaniesPanel from "@/components/command-center/SavedCompaniesPanel";
import CompanyDetailPanel from "@/components/command-center/CompanyDetailPanel";
import { AnimatePresence, motion } from "framer-motion";

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
  const { toast } = useToast();

  const [savedCompanies, setSavedCompanies] = useState<CommandCenterRecord[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<IyCompanyProfile | null>(null);
  const [routeKpis, setRouteKpis] = useState<IyRouteKpis | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // state for collapsible saved panel and search
  const [showSavedPanel, setShowSavedPanel] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    const controller = new AbortController();
    setSavedLoading(true);
    setSavedError(null);
    Promise.resolve()
      .then(() => listSavedCompanies("prospect"))
      .then((rows) => ({ rows }))
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
        setSavedCompanies([]);
        setSelectedKey(null);
      })
      .finally(() => setSavedLoading(false));
    return () => controller.abort();
  }, []);

  const filteredCompanies = useMemo(() => {
    if (!searchTerm.trim()) return savedCompanies;
    const lower = searchTerm.trim().toLowerCase();
    return savedCompanies.filter((record) => {
      const name = record.company?.name || "";
      const domain = (record.company as any)?.domain || "";
      const combined = `${name} ${domain}`.toLowerCase();
      return combined.includes(lower);
    });
  }, [savedCompanies, searchTerm]);

  const selectedRecord = useMemo(() => {
    if (!selectedKey) return null;
    return savedCompanies.find((record) => recordKey(record) === selectedKey) ?? null;
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

    getSavedCompanyDetail(companyKey)
      .then(({ profile: nextProfile, routeKpis: nextRouteKpis }) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setRouteKpis(nextRouteKpis);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setDetailError(error?.message ?? "Failed to load company profile");
        setProfile(null);
        setRouteKpis(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRecord?.company?.company_id]);

  const hydratedSelectedRecord = useMemo(() => {
    if (!selectedRecord) return null;
    if (!profile) return selectedRecord;

    const fallbackKpis = (selectedRecord as any)?.company?.kpis ?? {};
    const mergedCompany = {
      ...selectedRecord.company,
      name: profile.title || profile.name || selectedRecord.company?.name,
      domain: profile.domain ?? selectedRecord.company?.domain ?? null,
      website: profile.website ?? (selectedRecord.company as any)?.website ?? null,
      address: profile.address ?? selectedRecord.company?.address ?? null,
      country_code: profile.countryCode ?? selectedRecord.company?.country_code ?? null,
      kpis: {
        ...fallbackKpis,
        shipments_12m:
          profile.routeKpis?.shipmentsLast12m ?? fallbackKpis?.shipments_12m ?? 0,
        teu_12m:
          profile.routeKpis?.teuLast12m ?? fallbackKpis?.teu_12m ?? null,
        est_spend_12m:
          profile.routeKpis?.estSpendUsd12m ?? profile.estSpendUsd12m ?? fallbackKpis?.est_spend_12m ?? null,
        fcl_shipments_12m:
          getFclShipments12m(profile) ?? fallbackKpis?.fcl_shipments_12m ?? null,
        lcl_shipments_12m:
          getLclShipments12m(profile) ?? fallbackKpis?.lcl_shipments_12m ?? null,
        last_activity:
          profile.lastShipmentDate ?? fallbackKpis?.last_activity ?? null,
        top_route_12m:
          profile.routeKpis?.topRouteLast12m ?? fallbackKpis?.top_route_12m ?? null,
        recent_route:
          profile.routeKpis?.mostRecentRoute ?? fallbackKpis?.recent_route ?? null,
      },
    };

    return {
      ...selectedRecord,
      company: mergedCompany,
    } as CommandCenterRecord;
  }, [selectedRecord, profile]);

  const yearScopedProfile = useMemo(() => buildYearScopedProfile(profile, selectedYear), [profile, selectedYear]);

  const yearHydratedSelectedRecord = useMemo(() => {
    if (!hydratedSelectedRecord) return null;
    if (!yearScopedProfile) return hydratedSelectedRecord;

    const fallbackKpis = (hydratedSelectedRecord as any)?.company?.kpis ?? {};
    return {
      ...hydratedSelectedRecord,
      company: {
        ...hydratedSelectedRecord.company,
        kpis: {
          ...fallbackKpis,
          shipments_12m:
            yearScopedProfile.routeKpis?.shipmentsLast12m ?? fallbackKpis?.shipments_12m ?? 0,
          teu_12m:
            yearScopedProfile.routeKpis?.teuLast12m ?? fallbackKpis?.teu_12m ?? null,
          est_spend_12m:
            yearScopedProfile.routeKpis?.estSpendUsd12m ?? fallbackKpis?.est_spend_12m ?? null,
          fcl_shipments_12m:
            getFclShipments12m(yearScopedProfile) ?? fallbackKpis?.fcl_shipments_12m ?? null,
          lcl_shipments_12m:
            getLclShipments12m(yearScopedProfile) ?? fallbackKpis?.lcl_shipments_12m ?? null,
          last_activity:
            yearScopedProfile.lastShipmentDate ?? fallbackKpis?.last_activity ?? null,
        },
      },
    } as CommandCenterRecord;
  }, [hydratedSelectedRecord, yearScopedProfile]);

  const handleGenerateBrief = async () => {
    if (!yearHydratedSelectedRecord) {
      toast({
        title: "No company selected",
        description: "Please select a company to generate a brief",
        variant: "destructive",
      });
      return;
    }

    setGeneratingBrief(true);
    try {
      // Build a concise summary of the company to pass into OpenAI. Use
      // available metrics from the scoped profile when present.
      const name = yearHydratedSelectedRecord.company?.name ?? "";
      const shipments =
        yearScopedProfile?.routeKpis?.shipmentsLast12m ?? profile?.routeKpis?.shipmentsLast12m ?? 0;
      const teu =
        yearScopedProfile?.routeKpis?.teuLast12m ?? profile?.routeKpis?.teuLast12m ?? 0;
      const estSpend =
        yearScopedProfile?.routeKpis?.estSpendUsd12m ?? profile?.routeKpis?.estSpendUsd12m ?? profile?.estSpendUsd12m ?? 0;
      const topRoute =
        yearScopedProfile?.routeKpis?.topRouteLast12m ?? profile?.routeKpis?.topRouteLast12m ?? "unknown";
      const recentRoute =
        yearScopedProfile?.routeKpis?.mostRecentRoute ?? profile?.routeKpis?.mostRecentRoute ?? "unknown";
      const summary = `Company Name: ${name}. Shipments last 12 months: ${shipments}. TEUs last 12 months: ${teu}. Estimated spend: ${estSpend}. Top route: ${topRoute}. Most recent route: ${recentRoute}.`;
      const brief = await generateCompanyBrief(summary);
      if (brief) {
        toast({
          title: "Brief generated",
          description: "AI brief generated successfully. Check the console for details.",
        });
        console.log("AI brief:\n", brief);
      } else {
        toast({
          title: "Brief generated",
          description: "No content returned from OpenAI.",
        });
      }
    } catch (error: any) {
      console.error("Brief generation error:", error);
      toast({
        title: "Brief generation failed",
        description: error?.message || "Could not generate brief",
        variant: "destructive",
      });
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleExportPDF = () => {
    if (!yearHydratedSelectedRecord) {
      toast({
        title: "No company selected",
        description: "Please select a company to export",
        variant: "destructive",
      });
      return;
    }

    // Trigger browser print dialog to allow PDF export
    try {
      window.print();
    } catch (err) {
      toast({
        title: "Export failed",
        description: "PDF export encountered an error",
        variant: "destructive",
      });
    }
  };

  // The Add Company feature has been removed since companies are saved from the search page

  return (
    <>
      <div className="space-y-6">
        <CommandCenterHeader
          userName={user?.email || user?.displayName || "User"}
          companiesCount={savedCompanies.length}
          onGenerateBrief={handleGenerateBrief}
          onExportPDF={handleExportPDF}
        />

        {/* Layout grid with dynamic columns based on saved panel visibility */}
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: showSavedPanel ? "320px minmax(0, 1fr)" : "minmax(0, 1fr)" }}
        >
          {showSavedPanel && (
            <div className="space-y-3">
              {/* Collapse and search controls */}
              <div className="flex items-center justify-between">
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search saved companies"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                {/* Hide button */}
                <button
                  onClick={() => setShowSavedPanel(false)}
                  className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                >
                  Hide
                </button>
              </div>
              <SavedCompaniesPanel
                companies={filteredCompanies}
                selectedKey={selectedKey}
                onSelect={(key) => {
                  setSelectedKey(key);
                  const record = savedCompanies.find((r) => recordKey(r) === key);
                  if (record) {
                    localStorage.setItem(
                      "lit:selectedCompany",
                      JSON.stringify({
                        company_id: record.company?.company_id,
                        source_company_key: record.company?.company_id,
                        name: record.company?.name,
                      }),
                    );
                  }
                }}
                loading={savedLoading}
                error={savedError}
              />
            </div>
          )}
          <div className="space-y-3">
            {/* Show button when panel is collapsed */}
            {!showSavedPanel && (
              <div className="flex items-center justify-start">
                <button
                  onClick={() => setShowSavedPanel(true)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  Show companies
                </button>
              </div>
            )}

            {/* Year selector and company detail */}
            <div className="flex items-center justify-end">
              <label className="mr-2 text-sm text-slate-500">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {Array.from(
                  new Set(
                    (profile?.timeSeries ?? [])
                      .map((point) => Number(point?.year))
                      .filter((year) => Number.isFinite(year) && year > 2000),
                  ),
                )
                  .sort((a, b) => b - a)
                  .map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
              </select>
            </div>
            <CompanyDetailPanel
              record={yearHydratedSelectedRecord}
              profile={yearScopedProfile ?? profile}
              routeKpis={(yearScopedProfile?.routeKpis ?? routeKpis) as IyRouteKpis | null}
              loading={detailLoading}
              error={detailError}
              onGenerateBrief={handleGenerateBrief}
              onExportPDF={handleExportPDF}
            />
          </div>
        </div>
      </div>
    </>
  );
}
