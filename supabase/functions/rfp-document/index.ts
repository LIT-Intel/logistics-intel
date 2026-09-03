import { createLogger, requestId } from "../_shared/logger.ts";
import { handlePreflight, json, requireUser, resolveUserOrg } from "../_shared/auth.ts";
import { assertOrgRfp, cleanText, isUuid } from "../_shared/rfp_helpers.ts";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function decodeBase64(value: string): Uint8Array {
  const raw = atob(value.replace(/^data:[^;]+;base64,/, ""));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 140);
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("rfp-document", { request_id: requestId() });
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { orgId } = await resolveUserOrg(auth.admin, auth.user.id);
  if (!orgId) return json({ ok: false, code: "NO_ORG", error: "No active workspace" }, 403);
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body.rfp_id)) return json({ ok: false, code: "INVALID_INPUT", error: "rfp_id required" }, 400);
  const rfp = await assertOrgRfp(auth.admin, orgId, body.rfp_id);
  if (!rfp) return json({ ok: false, code: "NOT_FOUND", error: "RFP not found" }, 404);

  if (body.action === "signed_url") {
    if (!isUuid(body.document_id)) return json({ ok: false, code: "INVALID_INPUT", error: "document_id required" }, 400);
    const { data: document } = await auth.admin.from("lit_rfp_documents")
      .select("storage_path").eq("id", body.document_id).eq("rfp_id", rfp.id).eq("org_id", orgId).maybeSingle();
    if (!document) return json({ ok: false, code: "NOT_FOUND", error: "Document not found" }, 404);
    const { data, error } = await auth.admin.storage.from("rfp-documents").createSignedUrl(document.storage_path, 900);
    if (error) return json({ ok: false, code: "SIGN_FAILED", error: "Unable to open document" }, 500);
    return json({ ok: true, data: { signed_url: data.signedUrl } });
  }

  const fileName = safeName(cleanText(body.file_name, 180));
  const mimeType = cleanText(body.mime_type, 120).toLowerCase();
  if (!fileName || !ALLOWED.has(mimeType) || typeof body.content_base64 !== "string") {
    return json({ ok: false, code: "INVALID_FILE", error: "Use PDF, XLS/XLSX, CSV, DOC, or DOCX" }, 400);
  }
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(body.content_base64);
  } catch {
    return json({ ok: false, code: "INVALID_FILE", error: "The file could not be read" }, 400);
  }
  if (bytes.byteLength > MAX_BYTES) return json({ ok: false, code: "FILE_TOO_LARGE", error: "Maximum file size is 10 MB" }, 413);

  const storagePath = `${orgId}/${rfp.id}/${crypto.randomUUID()}-${fileName}`;
  const { error: uploadError } = await auth.admin.storage.from("rfp-documents")
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) {
    log.error("upload_failed", { err: uploadError.message, user_id: auth.user.id, org_id: orgId });
    return json({ ok: false, code: "UPLOAD_FAILED", error: "Unable to upload document" }, 500);
  }
  const { data: document, error: insertError } = await auth.admin.from("lit_rfp_documents").insert({
    rfp_id: rfp.id,
    org_id: orgId,
    uploaded_by: auth.user.id,
    file_name: fileName,
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: bytes.byteLength,
    document_type: cleanText(body.document_type, 40) || "supporting",
  }).select("id,file_name,mime_type,size_bytes,document_type,created_at").single();
  if (insertError) {
    await auth.admin.storage.from("rfp-documents").remove([storagePath]);
    log.error("document_insert_failed", { err: insertError.message, user_id: auth.user.id, org_id: orgId });
    return json({ ok: false, code: "UPLOAD_FAILED", error: "Unable to register document" }, 500);
  }
  await auth.admin.from("lit_rfp_events").insert({
    rfp_id: rfp.id,
    org_id: orgId,
    event_type: "document_uploaded",
    event_payload: { file_name: fileName },
    created_by: auth.user.id,
  });
  return json({ ok: true, data: { document } });
});
