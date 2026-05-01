import { useCallback, useEffect, useState } from "react";
import { getPrimaryEmailAccount, listEmailAccounts } from "@/lib/api";

export interface InboxStatus {
  primaryEmail: string | null;
  // false when the lit_email_accounts table is unavailable (RLS / migration
  // not yet applied). Surfaces an honest "not connected yet" message instead
  // of a hard error.
  known: boolean;
  loading: boolean;
}

export function useInboxStatus(): InboxStatus & { refresh: () => Promise<void> } {
  const [primaryEmail, setPrimaryEmail] = useState<string | null>(null);
  const [known, setKnown] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const primary = await getPrimaryEmailAccount();
      if (primary?.email) {
        setPrimaryEmail(primary.email);
        setKnown(true);
      } else {
        const list = await listEmailAccounts();
        const connected = (list || []).find((a) => a.status === "connected");
        setPrimaryEmail(connected?.email ?? null);
        setKnown(true);
      }
    } catch {
      setPrimaryEmail(null);
      setKnown(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { primaryEmail, known, loading, refresh };
}