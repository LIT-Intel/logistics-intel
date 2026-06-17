// Frontend wrapper for the email-pulse-report edge fn. Takes the
// recipient + question + coach answer + base64 PDF, hands it to Resend
// via the edge fn. Returns { ok, message_id, error }.

import { supabase } from "@/lib/supabase";

export type EmailPulseReportRequest = {
  recipient: string;
  subject?: string;
  question: string;
  answerMd: string;
  pdfBase64: string;
  filename?: string;
};

export type EmailPulseReportResult = {
  ok: boolean;
  message_id?: string | null;
  error?: string;
};

export async function emailPulseReport(
  req: EmailPulseReportRequest,
): Promise<EmailPulseReportResult> {
  const { data, error } = await supabase.functions.invoke("email-pulse-report", {
    body: req,
  });
  if (error) {
    return { ok: false, error: String(error.message ?? "invoke_failed") };
  }
  return {
    ok: Boolean(data?.ok),
    message_id: data?.message_id ?? null,
    error: data?.error,
  };
}
