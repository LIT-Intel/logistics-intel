import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  OutreachTemplate,
  Persona,
  TemplatesResult,
  PersonasResult,
} from "../types";

// lit_outreach_templates / lit_personas have RLS enabled. Direct browser
// reads will succeed only if a SELECT policy exists for the current
// workspace. If the read fails or the table simply doesn't exist yet, we
// degrade gracefully — the UI shows a "configured but require a secure
// read endpoint" message rather than crashing.

const BLOCKED_REASON =
  "Templates are configured, but require a secure read endpoint.";
const BLOCKED_REASON_PERSONAS =
  "Personas are configured, but require a secure read endpoint.";

export function useTemplates(): {
  result: TemplatesResult | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [result, setResult] = useState<TemplatesResult | null>(null);
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
        setResult({ state: "blocked", reason: BLOCKED_REASON });
        return;
      }
      const rows = (data ?? []) as OutreachTemplate[];
      setResult(rows.length === 0 ? { state: "empty" } : { state: "ok", rows });
    } catch {
      setResult({ state: "blocked", reason: BLOCKED_REASON });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { result, loading, refresh };
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