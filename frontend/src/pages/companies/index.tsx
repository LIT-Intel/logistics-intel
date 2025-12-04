import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CreateCompanyModal from '../../components/company/CreateCompanyModal';
import Workspace from '../../components/company/Workspace';
import LitPageHeader from '../../components/ui/LitPageHeader';
import {
  getIyCompanyProfile,
  getSavedCompanies,
  saveCompanyToCrm,
  type CrmSaveRequest,
  type IyCompanyProfile,
  type CrmSavedCompany,
} from '../../lib/api';

type CompanyLite = { id: string; name: string; kpis?: any; charts?: any; ai?: any };

const LS_KEY = 'lit_companies';

export default function Companies() {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyLite[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<IyCompanyProfile | null>(null);
  const [companyEnrichment, setCompanyEnrichment] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savedCompanies, setSavedCompanies] = useState<CrmSavedCompany[]>([]);
  const [savedCompaniesLoading, setSavedCompaniesLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function loadSaved() {
      setSavedCompaniesLoading(true);
      try {
        const response = await getSavedCompanies();
        if (cancelled) return;
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
          };
        });
        setSavedCompanies(normalized);
      } catch (err: any) {
        if (!cancelled) {
          setSavedCompanies([]);
        }
      } finally {
        if (!cancelled) {
          setSavedCompaniesLoading(false);
        }
      }
    }
    loadSaved();
    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    try {
      const rawA = localStorage.getItem(LS_KEY);
      const rawB = localStorage.getItem('manualCompanies');
      const a = rawA ? JSON.parse(rawA) : [];
      const b = rawB ? JSON.parse(rawB) : [];
      const map = new Map<string, any>();
      [...a, ...b].forEach((c: any) => {
        const id = String(c?.id || c?.company_id || '');
        if (!id) return;
        if (!map.has(id)) map.set(id, c);
      });
      // Migrate any RFP Studio payloads into Command Center if missing
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i) as string;
          if (!key) continue;
          if (!key.startsWith('lit_rfp_payload_')) continue;
          const cid = key.replace('lit_rfp_payload_', '');
          if (cid && !map.has(cid)) {
            const payload = JSON.parse(localStorage.getItem(key) || 'null');
            const name = (payload && payload.meta && (payload.meta.customer || payload.meta.bid_name)) || 'Company';
            map.set(cid, { id: cid, name, kpis: { shipments12m: 0, lastActivity: null, originsTop: [], destsTop: [], carriersTop: [] } });
          }
        }
      } catch {}
      const merged = Array.from(map.values());
      if (merged.length) setCompanies(merged);
    } catch {}
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY || e.key === 'manualCompanies') {
        try {
          const a = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
          const b = JSON.parse(localStorage.getItem('manualCompanies') || '[]');
          const map = new Map<string, any>();
          [...a, ...b].forEach((c: any) => { const id = String(c?.id || c?.company_id || ''); if (id && !map.has(id)) map.set(id, c); });
          setCompanies(Array.from(map.values()));
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(companies)); } catch {}
  }, [companies]);

  useEffect(() => {
    if (!companies.length) {
      setActiveCompanyId(null);
      return;
    }
    setActiveCompanyId((prev) => {
      if (prev && companies.some((company) => String(company.id) === String(prev))) {
        return prev;
      }
      const first = companies[0];
      return first ? String(first.id) : null;
    });
  }, [companies]);

  useEffect(() => {
    if (!activeCompanyId) {
      setCompanyProfile(null);
      setCompanyEnrichment(null);
      return;
    }
    let active = true;
    async function loadProfile() {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const response = await getIyCompanyProfile({
          companyKey: activeCompanyId,
          userGoal:
            "Populate LIT Command Center for this company with KPIs, spend analysis and pre-call brief",
        });
        if (!active) return;
        setCompanyProfile(response.companyProfile ?? null);
        setCompanyEnrichment(response.enrichment ?? null);
      } catch (err: any) {
        if (!active) return;
        console.error("Command Center company load failed", err);
        setProfileError(err?.message || "Failed to load company profile");
      } finally {
        if (active) setProfileLoading(false);
      }
    }
    loadProfile();
    return () => {
      active = false;
    };
  }, [activeCompanyId]);

  function onCreated(id: string, name: string) {
    const fresh: CompanyLite = {
      id,
      name,
      kpis: { shipments12m: 0, lastActivity: null, originsTop: [], destsTop: [], carriersTop: [] },
      charts: { growth: [], ecosystem: [], competition: [{ k: 'Scale', [name]: 7, Market: 7 }], sourcing: [] },
      ai: { summary: 'Pending enrichment…', bullets: ['—'] },
    } as any;
    setCompanies(prev => [fresh, ...prev]);
  }

  const normalizedCompany = companyEnrichment?.normalized_company ?? null;
  const logisticsKpis = companyEnrichment?.logistics_kpis ?? null;
  const ccEnrichment = companyEnrichment?.command_center_enrichment ?? null;
  const predictiveInsights = companyEnrichment?.predictive_insights ?? null;

  const displayName = normalizedCompany?.name ?? companyProfile?.title ?? companyProfile?.name ?? "Company";
  const displayWebsite =
    normalizedCompany?.website ?? companyProfile?.website ?? companyProfile?.rawWebsite ?? null;
  const displayDomain = normalizedCompany?.domain ?? companyProfile?.domain ?? null;
  const displayCountry =
    normalizedCompany?.country ?? companyProfile?.country ?? companyProfile?.countryCode ?? null;

  const shipments12m =
    logisticsKpis?.shipments_12m ??
    companyProfile?.routeKpis?.shipmentsLast12m ??
    companyProfile?.totalShipments ??
    null;
  const teus12m =
    logisticsKpis?.teus_12m ??
    companyProfile?.routeKpis?.teuLast12m ??
    null;

  const crmPayload = useMemo<CrmSaveRequest | null>(() => {
    if (!activeCompanyId) return null;

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
        name: displayName,
        website: displayWebsite,
        domain: displayDomain,
        phone: normalizedCompany?.phone ?? companyProfile?.phoneNumber ?? null,
        country: displayCountry,
        city: normalizedCompany?.city ?? null,
        state: normalizedCompany?.state ?? null,
        total_shipments: companyProfile?.totalShipments ?? null,
        shipments_12m: shipments12m,
        teus_12m: teus12m,
        primary_trade_lanes: logisticsKpis?.top_lanes ?? [],
        tags: normalizedCompany?.tags ?? [],
        opportunity_score: predictiveInsights?.opportunity_score ?? null,
        rfp_likelihood_score: predictiveInsights?.rfp_likelihood_score ?? null,
        recommended_priority: ccEnrichment?.recommended_priority ?? null,
      },
    };
  }, [
    activeCompanyId,
    ccEnrichment?.recommended_priority,
    companyEnrichment,
    companyProfile,
    displayDomain,
    displayName,
    displayWebsite,
    displayCountry,
    logisticsKpis,
    normalizedCompany,
    predictiveInsights,
    shipments12m,
    teus12m,
  ]);

  const handleSaveToCommandCenter = useCallback(async () => {
    if (!crmPayload) {
      console.warn("No CRM payload available for save");
      return;
    }
    const response = await saveCompanyToCrm(crmPayload);
    if (!response.ok) {
      console.error("Save to Command Center failed", response.message);
      return;
    }
    const newRecord: CrmSavedCompany = {
      company_id: crmPayload.company_id,
      stage: crmPayload.stage ?? 'prospect',
      provider: crmPayload.provider ?? 'importyeti+gemini',
      payload: crmPayload.payload ?? {},
      saved_at: new Date().toISOString(),
    };
    setSavedCompanies((prev) => {
      if (prev.some((record) => record.company_id === newRecord.company_id)) {
        return prev;
      }
      return [...prev, newRecord];
    });
  }, [crmPayload]);

  return (
    <div className='min-h-screen w-full bg-gradient-to-br from-gray-50 to-white'>
      <div className='pl-[5px] pr-[5px] pt-[5px]'>
        <LitPageHeader title="LIT Command Center" />
      </div>
      <div className='w-full pl-[5px] pr-[5px]'>
        {/* Render Workspace once (includes left rail + main) */}
        <Workspace
          companies={companies}
          onAdd={() => setOpen(true)}
          activeCompanyId={activeCompanyId}
          onActiveCompanyChange={setActiveCompanyId}
          companyProfile={companyProfile}
          enrichment={companyEnrichment}
          loading={profileLoading}
          error={profileError}
          onSaveToCommandCenter={handleSaveToCommandCenter}
          savedCompanies={savedCompanies}
          savedCompaniesLoading={savedCompaniesLoading}
          onSelectCompany={setActiveCompanyId}
        />
      </div>
      <CreateCompanyModal open={open} onClose={() => setOpen(false)} onCreated={onCreated} />
    </div>
  );
}

