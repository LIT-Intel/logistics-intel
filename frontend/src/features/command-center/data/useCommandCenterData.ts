/**
 * useCommandCenterData — real feeds for the Command Center rebuild.
 *
 * Accounts reuse the dashboard dataset (getWorkspaceSavedCompanies +
 * lit_company_time_series_monthly + lane months) via useDashboardData —
 * one pipeline, one source of truth for series/YoY/health across pages.
 *
 * Contacts: lit_contacts scoped to the saved companies' uuids, joined
 * client-side to lit_campaign_contacts (enrollment) + lit_outreach_history
 * (Opened/Replied + last touch) + lit_campaigns (names). All chunked .in()
 * queries; RLS scopes visibility.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useDashboardData } from "@/features/dashboard/data/useDashboardData";
import {
  deriveAccounts,
  normalizeContact,
  type AccountDerived,
  type CCActions,
  type CCContact,
  type CCState,
  type HealthId,
  type SenId,
} from "./computeCommandCenter";

const FIVE_MIN = 5 * 60 * 1000;

async function chunkedIn<T>(
  table: string,
  select: string,
  col: string,
  ids: string[],
  chunk = 200,
): Promise<T[]> {
  // PostgREST caps responses at 1,000 rows — page each chunk with .range()
  // until exhausted (same truncation bug class as fetchBulkMonthly).
  const PAGE = 1000;
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunk) {
    const idChunk = ids.slice(i, i + chunk);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .in(col, idChunk)
        .order(col, { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error(`[command-center] ${table} query failed:`, error.message);
        break;
      }
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

export interface CommandCenterData {
  loading: boolean;
  accounts: AccountDerived[];
  contacts: CCContact[];
  owners: { id: string; name: string; key: string; color: string }[];
}

export function useCommandCenterData(): CommandCenterData {
  const dash = useDashboardData();
  const uuids = useMemo(
    () => (dash.ds?.companies ?? []).map((c) => c.uuid).filter(Boolean) as string[],
    [dash.ds],
  );

  const contactsQ = useQuery({
    queryKey: ["cc-contacts", uuids.join("|")],
    enabled: uuids.length > 0,
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const raw = await chunkedIn<any>(
        "lit_contacts",
        "id,company_id,full_name,first_name,last_name,title,department,seniority,email,phone,linkedin_url,email_verified,email_verification_status,created_at",
        "company_id",
        uuids,
      );
      const contactIds = raw.map((r) => String(r.id));

      const [enroll, history] = await Promise.all([
        chunkedIn<any>(
          "lit_campaign_contacts",
          "contact_id,campaign_id,status,last_sent_at,created_at",
          "contact_id",
          contactIds,
        ),
        chunkedIn<any>(
          "lit_outreach_history",
          "contact_id,occurred_at,opened_at,replied_at",
          "contact_id",
          contactIds,
        ),
      ]);

      const campaignIds = Array.from(new Set(enroll.map((e) => String(e.campaign_id)).filter(Boolean)));
      const campNames = new Map<string, string>();
      (await chunkedIn<any>("lit_campaigns", "id,name", "id", campaignIds)).forEach((c) =>
        campNames.set(String(c.id), String(c.name ?? "Campaign")),
      );

      // Per-contact rollups: enrollment (newest), opened/replied, last touch.
      const enrollBy = new Map<string, any>();
      enroll.forEach((e) => {
        const k = String(e.contact_id);
        const cur = enrollBy.get(k);
        if (!cur || String(e.created_at ?? "") > String(cur.created_at ?? "")) enrollBy.set(k, e);
      });
      const touch = new Map<string, { last: number; opened: boolean; replied: boolean }>();
      const bump = (k: string, ts: string | null, opened: boolean, replied: boolean) => {
        const t = ts ? Date.parse(ts) : NaN;
        const cur = touch.get(k) ?? { last: 0, opened: false, replied: false };
        touch.set(k, {
          last: Number.isFinite(t) ? Math.max(cur.last, t) : cur.last,
          opened: cur.opened || opened,
          replied: cur.replied || replied,
        });
      };
      history.forEach((h) => {
        const k = String(h.contact_id);
        bump(k, h.occurred_at, !!h.opened_at, !!h.replied_at);
      });
      enroll.forEach((e) => bump(String(e.contact_id), e.last_sent_at, false, false));

      return { raw, enrollBy, touch, campNames };
    },
  });

  const contacts: CCContact[] = useMemo(() => {
    const d = contactsQ.data;
    if (!d || !dash.ds) return [];
    const today = dash.ds.todayTs;
    return d.raw.map((r: any) => {
      const k = String(r.id);
      const e = d.enrollBy.get(k);
      const t = d.touch.get(k);
      const camp = e
        ? {
            name: d.campNames.get(String(e.campaign_id)) ?? "Campaign",
            status: (t?.replied ? "Replied" : t?.opened ? "Opened" : "Sent") as "Sent" | "Opened" | "Replied",
          }
        : null;
      return normalizeContact(r, camp, t?.last ? t.last : null, today);
    });
  }, [contactsQ.data, dash.ds]);

  const accounts = useMemo(() => {
    if (!dash.ds) return [];
    const counts = new Map<string, number>();
    contacts.forEach((c) => counts.set(c.companyUuid, (counts.get(c.companyUuid) ?? 0) + 1));
    return deriveAccounts(dash.ds, counts);
  }, [dash.ds, contacts]);

  const owners = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; key: string; color: string }>();
    (dash.ds?.companies ?? []).forEach((c) => {
      if (c.ownerId && !seen.has(c.ownerId)) {
        seen.set(c.ownerId, { id: c.ownerId, name: c.ownerName ?? "Teammate", key: c.ownerKey, color: c.ownerColor });
      }
    });
    return [...seen.values()];
  }, [dash.ds]);

  return { loading: dash.loading || (uuids.length > 0 && contactsQ.isLoading), accounts, contacts, owners };
}

// ---------------------------------------------------------------- state

const DEFAULTS: CCState = {
  tab: "companies",
  q: "",
  health: null,
  stages: [],
  owner: null,
  sort: "spend",
  sel: [],
  drawer: null,
  sen: [],
  chan: "all",
  group: false,
  page: 0,
};

/** README §3.4 — tab/q/health/stages/owner/sort/sen/chan/group/page in the URL. */
export function useCCState(): { st: CCState; A: CCActions } {
  const [params, setParams] = useSearchParams();

  const [st, setSt] = useState<CCState>(() => ({
    ...DEFAULTS,
    tab: params.get("tab") === "contacts" ? "contacts" : "companies",
    q: params.get("q") ?? "",
    health: (params.get("health") as HealthId) || null,
    stages: params.getAll("stage"),
    owner: params.get("owner"),
    sort: (["spend", "volume", "recent", "saved"].includes(params.get("sort") ?? "") ? params.get("sort") : "spend") as CCState["sort"],
    sen: params.getAll("sen") as SenId[],
    chan: (["all", "email", "phone", "fresh"].includes(params.get("chan") ?? "") ? params.get("chan") : "all") as CCState["chan"],
    group: params.get("group") === "1",
    page: Math.max(0, Number(params.get("page") ?? 0) || 0),
  }));

  // URL sync (filters only — sel/drawer stay in memory).
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        ["tab", "q", "health", "stage", "owner", "sort", "sen", "chan", "group", "page"].forEach((k) => next.delete(k));
        if (st.tab !== "companies") next.set("tab", st.tab);
        if (st.q) next.set("q", st.q);
        if (st.health) next.set("health", st.health);
        st.stages.forEach((s) => next.append("stage", s));
        if (st.owner) next.set("owner", st.owner);
        if (st.sort !== "spend") next.set("sort", st.sort);
        st.sen.forEach((s) => next.append("sen", s));
        if (st.chan !== "all") next.set("chan", st.chan);
        if (st.group) next.set("group", "1");
        if (st.page > 0) next.set("page", String(st.page));
        return next;
      },
      { replace: true },
    );
  }, [st.tab, st.q, st.health, st.stages, st.owner, st.sort, st.sen, st.chan, st.group, st.page, setParams]);

  // Esc closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSt((s) => (s.drawer ? { ...s, drawer: null } : s));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const set = useCallback((patch: Partial<CCState>) => {
    setSt((s) => {
      const next = { ...s, ...patch };
      // Tab switch clears q, selection and drawer (§3.4).
      if (patch.tab && patch.tab !== s.tab) {
        next.q = "";
        next.sel = [];
        next.drawer = null;
        next.page = 0;
      }
      // Any filter change resets pagination.
      if (patch.q != null || patch.health !== undefined || patch.stages || patch.owner !== undefined || patch.sen || patch.chan) {
        next.page = patch.page ?? 0;
      }
      return next;
    });
  }, []);

  const tog = useCallback((k: "stages" | "sen" | "sel", v: string) => {
    setSt((s) => {
      const arr = s[k] as string[];
      const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
      return { ...s, [k]: next, ...(k !== "sel" ? { page: 0 } : {}) };
    });
  }, []);

  return { st, A: { set, tog } };
}
