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
import {
  getSampleCommandCenterRecords,
  getSampleProfile,
  getSampleRouteKpis,
  isSampleCompany,
} from "@/lib/mockData";
import { Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  const [showingSamples, setShowingSamples] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setSavedLoading(true);
    setSavedError(null);
    getSavedCompanies(controller.signal)
      .then((response) => {
        const rows = Array.isArray(response?.rows) ? response.rows : [];

        if (rows.length === 0) {
          const samples = getSampleCommandCenterRecords();
          setSavedCompanies(samples);
          setShowingSamples(true);
          setSelectedKey(samples.length ? recordKey(samples[0]) : null);
        } else {
          setSavedCompanies(rows as CommandCenterRecord[]);
          setShowingSamples(false);
          setSelectedKey((prev) => {
            if (prev && rows.some((row: CommandCenterRecord) => recordKey(row) === prev)) {
              return prev;
            }
            return rows.length ? recordKey(rows[0] as CommandCenterRecord) : null;
          });
        }
      })
      .catch((error: any) => {
        setSavedError(error?.message ?? "Failed to load saved companies");
        const samples = getSampleCommandCenterRecords();
        setSavedCompanies(samples);
        setShowingSamples(true);
        setSelectedKey(samples.length ? recordKey(samples[0]) : null);
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

    if (isSampleCompany(companyKey)) {
      const sampleProfile = getSampleProfile(companyKey);
      const sampleRouteKpis = getSampleRouteKpis(companyKey);

      if (sampleProfile) {
        setProfile(sampleProfile);
      }
      if (sampleRouteKpis) {
        setRouteKpis(sampleRouteKpis);
      }
      setDetailLoading(false);
      setDetailError(null);
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

  const handleDismissSamples = () => {
    setSavedCompanies([]);
    setShowingSamples(false);
    setSelectedKey(null);
  };

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

        <AnimatePresence>
          {showingSamples && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="relative rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-blue-900">
                    Viewing Sample Data
                  </h3>
                  <p className="mt-1 text-xs text-blue-700">
                    These are example Fortune 500 companies. Save companies from Search to see your own data here.
                  </p>
                </div>
                <button
                  onClick={handleDismissSamples}
                  className="flex-shrink-0 rounded-lg p-1 text-blue-600 hover:bg-blue-100 transition-colors"
                  aria-label="Dismiss sample data"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
