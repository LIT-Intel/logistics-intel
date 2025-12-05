import React, { useCallback, useEffect, useMemo, useState } from "react";
import Workspace from "@/components/company/Workspace";
import {
  getIyCompanyProfile,
  getSavedCompanies,
  saveCompanyToCrm,
  type IyCompanyProfile,
  type CrmSavedCompany,
  type CrmSaveRequest,
} from "@/lib/api";

export default function Companies() {
  const [savedCompanies, setSavedCompanies] = useState<CrmSavedCompany[]>([]);
  const [savedCompaniesLoading, setSavedCompaniesLoading] = useState(false);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<IyCompanyProfile | null>(null);
  const [companyEnrichment, setCompanyEnrichment] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadSavedCompanies = useCallback(async () => {
    setSavedCompaniesLoading(true);
    try {
      const response = await getSavedCompanies();
      if (!response.ok) {
        setSavedCompanies([]);
        return;
      }
      const normalized = response.records.map((record) => {
        const payload = {
          ...(record.raw?.payload ?? {}),
          name: record.name,
          shipments_12m: record.shipments12m,
          teus_12m: record.teus12m,
        };
        return {
          company_id: record.id,
          stage: record.raw?.stage ?? "prospect",
          provider: record.raw?.provider ?? "crm",
          payload,
          saved_at: record.raw?.saved_at,
        } satisfies CrmSavedCompany;
      });
      setSavedCompanies(normalized);
    } catch (error) {
      console.error("Failed to load saved companies", error);
      setSavedCompanies([]);
    } finally {
      setSavedCompaniesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedCompanies();
  }, [loadSavedCompanies]);

  useEffect(() => {
    if (!savedCompanies.length) {
      setActiveCompanyId(null);
      return;
    }
    setActiveCompanyId((prev) => {
      if (prev && savedCompanies.some((company) => company.company_id === prev)) {
        return prev;
      }
      return savedCompanies[0]?.company_id ?? null;
    });
  }, [savedCompanies]);

  useEffect(() => {
    if (!activeCompanyId) {
      setCompanyProfile(null);
      setCompanyEnrichment(null);
      return;
    }
    let isActive = true;
    async function loadProfile() {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const response = await getIyCompanyProfile({
          companyKey: activeCompanyId,
          userGoal:
            "Populate LIT Command Center for this company with KPIs, spend analysis and pre-call brief",
        });
        if (!isActive) return;
        setCompanyProfile(response.companyProfile ?? null);
        setCompanyEnrichment(response.enrichment ?? null);
      } catch (error: any) {
        if (!isActive) return;
        console.error("Command Center company load failed", error);
        setProfileError(error?.message || "Failed to load company profile");
      } finally {
        if (isActive) setProfileLoading(false);
      }
    }
    void loadProfile();
    return () => {
      isActive = false;
    };
  }, [activeCompanyId]);

  const crmPayload = useMemo<CrmSaveRequest | null>(() => {
    if (!activeCompanyId) return null;
    const normalizedCompany = companyEnrichment?.normalized_company ?? null;
    const logisticsKpis = companyEnrichment?.logistics_kpis ?? null;
    const ccEnrichment = companyEnrichment?.command_center_enrichment ?? null;
    const predictiveInsights = companyEnrichment?.predictive_insights ?? null;

    if (companyEnrichment?.crm_save_payload) {
      const enriched = companyEnrichment.crm_save_payload as CrmSaveRequest;
      return {
        company_id: enriched.company_id ?? activeCompanyId,
        stage: enriched.stage ?? "prospect",
        provider: enriched.provider ?? "importyeti+gemini",
        payload: enriched.payload ?? {},
      };
    }

    return {
      company_id: activeCompanyId,
      stage: "prospect",
      provider: "importyeti+gemini",
      payload: {
        name:
          normalizedCompany?.name ?? companyProfile?.title ?? companyProfile?.name ?? activeCompanyId,
        website:
          normalizedCompany?.website ?? companyProfile?.website ?? companyProfile?.rawWebsite ?? null,
        domain: normalizedCompany?.domain ?? companyProfile?.domain ?? null,
        phone: normalizedCompany?.phone ?? companyProfile?.phoneNumber ?? null,
        country: normalizedCompany?.country ?? companyProfile?.country ?? companyProfile?.countryCode ?? null,
        city: normalizedCompany?.city ?? null,
        state: normalizedCompany?.state ?? null,
        total_shipments: companyProfile?.totalShipments ?? null,
        shipments_12m:
          logisticsKpis?.shipments_12m ?? companyProfile?.routeKpis?.shipmentsLast12m ?? companyProfile?.totalShipments ?? null,
        teus_12m: logisticsKpis?.teus_12m ?? companyProfile?.routeKpis?.teuLast12m ?? null,
        primary_trade_lanes: logisticsKpis?.top_lanes ?? [],
        tags: normalizedCompany?.tags ?? [],
        opportunity_score: predictiveInsights?.opportunity_score ?? null,
        rfp_likelihood_score: predictiveInsights?.rfp_likelihood_score ?? null,
        recommended_priority: ccEnrichment?.recommended_priority ?? null,
      },
    } satisfies CrmSaveRequest;
  }, [activeCompanyId, companyEnrichment, companyProfile]);

  const handleSaveToCommandCenter = useCallback(
    async (_?: CrmSavedCompany | IyCompanyProfile) => {
    if (!crmPayload) return;
    const response = await saveCompanyToCrm(crmPayload);
    if (!response.ok) {
      console.error("Save to Command Center failed", response.message);
      return;
    }
    const newRecord: CrmSavedCompany = {
      company_id: crmPayload.company_id,
      stage: crmPayload.stage ?? "prospect",
      provider: crmPayload.provider ?? "importyeti+gemini",
      payload: crmPayload.payload ?? {},
      saved_at: new Date().toISOString(),
    };
      setSavedCompanies((prev) => {
        if (prev.some((record) => record.company_id === newRecord.company_id)) {
          return prev;
        }
        return [...prev, newRecord];
      });
    },
    [crmPayload],
  );

  return (
    <Workspace
      companies={savedCompanies}
      activeCompanyId={activeCompanyId}
      onSelectCompany={setActiveCompanyId}
      iyProfile={companyProfile}
      enrichment={companyEnrichment}
      isLoadingProfile={profileLoading || savedCompaniesLoading}
      errorProfile={profileError}
      onSaveCompany={handleSaveToCommandCenter}
    />
  );
}
