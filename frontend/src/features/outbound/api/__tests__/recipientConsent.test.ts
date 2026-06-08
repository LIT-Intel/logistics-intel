import { describe, it, expect, vi, beforeEach } from "vitest";

const { insertSpy, fromSpy } = vi.hoisted(() => {
  const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const fromSpy = vi.fn(() => ({ insert: insertSpy, upsert: insertSpy }));
  return { insertSpy, fromSpy };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from: fromSpy },
}));

import { upsertConsents } from "../recipientConsent";

describe("upsertConsents", () => {
  beforeEach(() => { insertSpy.mockClear(); fromSpy.mockClear(); });

  it("upserts one row per email with the given source + attester", async () => {
    await upsertConsents({
      emails: ["a@example.com", "b@example.com"],
      orgId: "org-1", attestedByUserId: "user-1", source: "manual_email_tab", campaignId: "camp-1",
    });
    expect(fromSpy).toHaveBeenCalledWith("lit_recipient_consent");
    const rows = insertSpy.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      recipient_email: "a@example.com", org_id: "org-1",
      attested_by_user_id: "user-1", source: "manual_email_tab", campaign_id: "camp-1",
    });
  });

  it("lowercases recipient_email on upsert", async () => {
    await upsertConsents({
      emails: ["ALICE@EXAMPLE.COM"], orgId: "org-1", attestedByUserId: "user-1", source: "manual_email_tab",
    });
    expect(insertSpy.mock.calls[0][0][0].recipient_email).toBe("alice@example.com");
  });

  it("returns early when emails array is empty (no query fired)", async () => {
    await upsertConsents({ emails: [], orgId: "org-1", attestedByUserId: "user-1", source: "manual_email_tab" });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("dedupes emails (case-insensitive) before upsert", async () => {
    await upsertConsents({
      emails: ["a@x.com", "A@X.COM", "b@x.com"],
      orgId: "org-1", attestedByUserId: "user-1", source: "manual_email_tab",
    });
    const rows = insertSpy.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.map((r: any) => r.recipient_email)).toEqual(["a@x.com", "b@x.com"]);
  });
});
