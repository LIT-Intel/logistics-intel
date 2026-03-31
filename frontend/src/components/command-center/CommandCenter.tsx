"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  listSavedCompanies,
  getIyCompanyProfile,
  getIyRouteKpisForCompany,
  type IyCompanyProfile,
  type IyRouteKpis,
} from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import CommandCenterHeader from "@/components/command-center/CommandCenterHeader";
import SavedCompaniesPanel from "@/components/command-center/SavedCompaniesPanel";
import CompanyDetailPanel from "@/components/command-center/CompanyDetailPanel";
import QuickActionsButton from "@/components/dashboard/QuickActionsButton";
import { motion, AnimatePresence } from "framer-motion";

function recordKey(record: CommandCenterRecord) {
  return (
    record.company?.company_id ||
    record.company?.name ||
    (record as any)?.company?.company_name ||
    ""
  );
}

function normalizeSavedCompanyRow(item: any): CommandCenterRecord {
  const company = item?.company || item?.lit_companies || item || {};

  return {
    ...item,
    company: {
      ...company,
      company_id:
        company.company_id ||
        company.source_company_key ||
        company.id ||
        item?.company_id ||
        "",
      name:
        company.name ||
        company.title ||
        company.company_name ||
        item?.company_name ||
        "Unknown Company",
      address: company.address || item?.address || "",
      country_code:
        company.country_code ||
        company.countryCode ||
        item?.country_code ||
        item?.countryCode ||
        "",
      domain: company.domain || item?.domain || null,
      website: company.website || item?.website || null,
      total_shipments:
        company.total_shipments ||
        company.totalShipments ||
        item?.total_shipments ||
        item?.totalShipments ||
        0,
      last_shipment_date:
        company.last_shipment_date ||
        company.mostRecentShipment ||
        company.lastShipment ||
        item?.last_shipment_date ||
        item?.mostRecentShipment ||
        item?.lastShipment ||
        null,
    },
  } as CommandCenterRecord;
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

  const loadSavedCompanies = async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      const response: any = await listSavedCompanies("prospect");

      const rows = Array.isArray(response?.rows)
        ? response.rows
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : [];

      const normalizedRows = rows.map(normalizeSavedCompanyRow);

      setSavedCompanies(normalizedRows);
      setSelectedKey((prev) => {
        if (
          prev &&
          normalizedRows.some((row: CommandCenterRecord) => recordKey(row) === prev)
        ) {
          return prev;
        }
        return normalizedRows.length
          ? recordKey(normalizedRows[0] as CommandCenterRecord)
          : null;
      });
    } catch (error: any) {
      setSavedError(error?.message ?? "Failed to load saved companies");
      setSavedCompanies([]);
      setSelectedKey(null);
    } finally {
      setSavedLoading(false);
    }
  };

  useEffect(() => {
    loadSavedCompanies();

    const onFocus = () => {
      loadSavedCompanies();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        loadSavedCompanies();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
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

  const handleGenerateBrief = async () => {
    if (!selectedRecord || !user) {
      toast({
        title: "No company selected",
        description: "Please select a company to generate a brief",
        variant: "destructive",
      });
      return;
    }

    setGeneratingBrief(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-brief`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            company_id: selectedRecord.company?.company_id,
            company_name: selectedRecord.company?.name,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate brief");
      }

      const result = await response.json();

      toast({
        title: "Brief generated",
        description: "Pre-call briefing has been generated successfully",
      });

      console.log("Brief generated:", result);
    } catch (error: any) {
      console.error("Brief generation error:", error);
      toast({
        title: "Brief generation failed",
        description: error.message || "Could not generate brief",
        variant: "destructive",
      });
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleExportPDF = () => {
    if (!selectedRecord) {
      toast({
        title: "No company selected",
        description: "Please select a company to export",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Export coming soon",
      description: "PDF export functionality will be available in the next update",
    });
  };

  const handleAddCompany = () => {
    toast({
      title: "Feature coming soon",
      description:
        "Manual company addition will be available in the next update. For now, save companies from the Search page.",
    });
  };

  return (
    <>
      <div className="space-y-6">
        <CommandCenterHeader
          userName={user?.email || user?.displayName || "User"}
          companiesCount={savedCompanies.length}
          onGenerateBrief={handleGenerateBrief}
          onExportPDF={handleExportPDF}
          onAddCompany={handleAddCompany}
        />

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <SavedCompaniesPanel
            companies={savedCompanies}
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
                  })
                );
              }
            }}
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
