import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  OutreachTemplate,
  Persona,
  TemplatesResult,
  PersonasResult,
} from "../types";
import { STARTER_TEMPLATES } from "../data/templates";

// lit_outreach_templates / lit_personas have RLS enabled. Direct browser
// reads will succeed only if a SELECT policy exists for the current
// workspace. If the read fails or the table simply doesn't exist yet, we
// fall back to a curated static catalog (STARTER_TEMPLATES) so users always
// have something useful to apply. The result also surfaces the source
// (db | starters) so the UI can label appropriately.

export type TemplatesSource = "db" | "starters";

export interface TemplatesState {
  result: TemplatesResult;
  source: TemplatesSource;
  /** True when the DB read either failed or returned 0 rows. */
  fellBack: boolean;
  /** Reason copy when the DB was blocked (RLS / missing table). */
  blockedReason: string | null;
}

const BLOCKED_REASON =
  "Templates from your workspace require a secure read endpoint or SELECT policy on lit_outreach_templates. Showing curated starter templates below.";
const BLOCKED_REASON_PERSONAS =
  "Personas from your workspace require a secure read endpoint or SELECT policy on lit_personas.";

export function useTemplates(): {
  state: TemplatesState | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<TemplatesState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("lit_outreach_templates")
        .select("id, name, channel, subject, body, persona_id")
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error) {
        // Fall back to curated starters with a clear "blocked" notice.
        setState({
          result: { state: "ok", rows: STARTER_TEMPLATES as OutreachTemplate[] },
          source: "starters",
          fellBack: true,
          blockedReason: BLOCKED_REASON,
        });
        return;
      }
      const rows = (data ?? []) as OutreachTemplate[];
      if (rows.length === 0) {
        setState({
          result: { state: "ok", rows: STARTER_TEMPLATES as OutreachTemplate[] },
          source: "starters",
          fellBack: true,
          blockedReason: null,
        });
      } else {
        setState({
          result: { state: "ok", rows },
          source: "db",
          fellBack: false,
          blockedReason: null,
        });
      }
    } catch {
      setState({
        result: { state: "ok", rows: STARTER_TEMPLATES as OutreachTemplate[] },
        source: "starters",
        fellBack: true,
        blockedReason: BLOCKED_REASON,
      });
    } finally {
      setLoading(false);
    }
  }, []);

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
        .select("id, name, description")
        .order("name", { ascending: true })
        .limit(50);
      if (error) {
        setResult({ state: "blocked", reason: BLOCKED_REASON_PERSONAS });
        return;
      }
      const rows = (data ?? []) as Persona[];
      setResult(rows.length === 0 ? { state: "empty" } : { state: "ok", rows });
    } catch {
      setResult({ state: "blocked", reason: BLOCKED_REASON_PERSONAS });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { result, loading, refresh };
}