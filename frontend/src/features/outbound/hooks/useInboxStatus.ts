import { useCallback, useEffect, useState } from "react";
import { getPrimaryEmailAccount, listEmailAccounts } from "@/lib/api";

export interface InboxStatus {
  primaryEmail: string | null;
  // Provider of the primary/first-connected mailbox (gmail | outlook | …).
  // Null when no mailbox is connected or the table is unavailable. Used by
  // channel chips to show real Gmail/Outlook branding on email steps.
  primaryProvider: string | null;
  // false when the lit_email_accounts table is unavailable (RLS / migration
  // not yet applied). Surfaces an honest "not connected yet" message instead
  // of a hard error.
  known: boolean;
  loading: boolean;
}

export function useInboxStatus(): InboxStatus & { refresh: () => Promise<void> } {
  const [primaryEmail, setPrimaryEmail] = useState<string | null>(null);
  const [primaryProvider, setPrimaryProvider] = useState<string | null>(null);
  const [known, setKnown] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const primary = await getPrimaryEmailAccount();
      if (primary?.email) {
        setPrimaryEmail(primary.email);
        setPrimaryProvider(primary.provider ?? null);
        setKnown(true);
      } else {
        const list = await listEmailAccounts();
        const connected = (list || []).find((a) => a.status === "connected");
        setPrimaryEmail(connected?.email ?? null);
        setPrimaryProvider(connected?.provider ?? null);
        setKnown(true);
      }
    } catch {
      setPrimaryEmail(null);
      setPrimaryProvider(null);
      setKnown(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { primaryEmail, primaryProvider, known, loading, refresh };
}
