import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Loads the current user's saved email signature from
// lit_user_preferences. Used by the campaign builder for the live
// "Preview as contact" render and to mirror the dispatcher's
// signature-append behavior on test sends.
//
// Returns sanitized HTML (server-side sanitization happens at save-time
// via the save-signature edge function), so callers can pass it directly
// into dangerouslySetInnerHTML without re-cleaning.

export interface UserSignature {
  html: string | null;
  text: string | null;
  loading: boolean;
}

export function useUserSignature(): UserSignature {
  const [state, setState] = useState<UserSignature>({ html: null, text: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) {
          if (!cancelled) setState({ html: null, text: null, loading: false });
          return;
        }
        const { data } = await supabase
          .from("lit_user_preferences")
          .select("signature_html, signature_text")
          .eq("user_id", uid)
          .maybeSingle();
        if (cancelled) return;
        setState({
          html: data?.signature_html ?? null,
          text: data?.signature_text ?? null,
          loading: false,
        });
      } catch {
        if (!cancelled) setState({ html: null, text: null, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
