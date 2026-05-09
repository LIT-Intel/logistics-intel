import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import type {
  OutreachTemplate,
  Persona,
  TemplatesResult,
  PersonasResult,
} from "../types";
import { STARTER_TEMPLATES, type StarterTemplate } from "../data/templates";
import {
  LIT_MARKETING_TEMPLATES,
  asOutreachTemplate as asOutreachFromLitMarketing,
} from "@/lib/campaignEmailTemplates";

// lit_outreach_templates schema (verified via Supabase introspection):
//   id uuid · org_id uuid · persona_id uuid · mode text · channel text
//   stage text · title text · subject_template text · body_template text
//   is_active boolean · created_at · updated_at
//
// RLS is enabled but currently has zero policies — until migration
// 20260501_outbound_templates_rls is applied, all browser reads/writes
// return blocked / empty. Until then, the curated starter catalog acts as
// the "Standard library". When policies do get applied, workspace rows
// will surface in a separate Workspace section above the standards.

export type TemplatesSource = "db" | "starters" | "mixed";

export interface TemplatesState {
  result: TemplatesResult; // unified rows for the existing apply path
  workspaceRows: OutreachTemplate[]; // empty when DB is blocked / no rows
  starterRows: OutreachTemplate[]; // always non-empty
  source: TemplatesSource;
  /** True when the DB is RLS-blocked or the table doesn't yet exist. */
  blocked: boolean;
  /** Reason copy for the workspace section when DB is unreadable. */
  blockedReason: string | null;
}

interface DbTemplateRow {
  id: string;
  org_id: string | null;
  persona_id: string | null;
  channel: string;
  stage: string | null;
  mode: string | null;
  title: string;
  subject_template: string | null;
  body_template: string | null;
  is_active: boolean | null;
}

const BLOCKED_REASON =
  "Workspace templates require an RLS policy on lit_outreach_templates. Apply migration 20260501_outbound_templates_rls (provided in supabase/migrations/) to enable workspace + user template reads and writes.";

const PERSONAS_BLOCKED =
  "Personas from your workspace require a SELECT policy on lit_personas.";

function dbRowToTemplate(row: DbTemplateRow): OutreachTemplate {
  return {
    id: row.id,
    name: row.title || "Untitled template",
    channel: row.channel || null,
    subject: row.subject_template,
    body: row.body_template,
    persona_id: row.persona_id,
  };
}

export function useTemplates(): {
  state: TemplatesState | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<TemplatesState | null>(null);
  const [loading, setLoading] = useState(true);
  const { isSuperAdmin } = useAuth();

  const refresh = useCallback(async () => {
    setLoading(true);
    // LIT Marketing campaigns (4-touch broker + 4-touch forwarder
    // sequences) pitch LIT itself — they are reserved for the founder
    // org's own outbound and must never be exposed to subscribers.
    // Surface them only when the viewer is a super-admin.
    const litMarketingRows: OutreachTemplate[] = isSuperAdmin
      ? LIT_MARKETING_TEMPLATES.map((t) => asOutreachFromLitMarketing(t))
      : [];
    const starterRows = [
      ...litMarketingRows,
      ...(STARTER_TEMPLATES as OutreachTemplate[]),
    ];
    try {
      const { data, error } = await supabase
        .from("lit_outreach_templates")
        .select(
          "id, org_id, persona_id, channel, stage, mode, title, subject_template, body_template, is_active",
        )
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) {
        // RLS block / missing table / etc. — fall back to starters only.
        setState({
          result: { state: "ok", rows: starterRows },
          workspaceRows: [],
          starterRows,
          source: "starters",
          blocked: true,
          blockedReason: BLOCKED_REASON,
        });
        return;
      }

      const workspaceRows = ((data ?? []) as DbTemplateRow[]).map(
        dbRowToTemplate,
      );
      const merged = [...workspaceRows, ...starterRows];
      setState({
        result: { state: "ok", rows: merged },
        workspaceRows,
        starterRows,
        source: workspaceRows.length > 0 ? "mixed" : "starters",
        blocked: false,
        blockedReason: null,
      });
    } catch {
      setState({
        result: { state: "ok", rows: starterRows },
        workspaceRows: [],
        starterRows,
        source: "starters",
        blocked: true,
        blockedReason: BLOCKED_REASON,
      });
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, loading, refresh };
}

export function usePersonas(): {
  result: PersonasResult | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [result, setResult] = useState<PersonasResult | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("lit_personas")
        .select("id, name")
        .order("name", { ascending: true })
        .limit(50);
      if (error) {
        setResult({ state: "blocked", reason: PERSONAS_BLOCKED });
        return;
      }
      const rows = (data ?? []) as Persona[];
      setResult(rows.length === 0 ? { state: "empty" } : { state: "ok", rows });
    } catch {
      setResult({ state: "blocked", reason: PERSONAS_BLOCKED });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { result, loading, refresh };
}

export function isStarterTemplate(
  t: OutreachTemplate,
): t is OutreachTemplate & StarterTemplate {
  return Object.prototype.hasOwnProperty.call(t, "industry");
}