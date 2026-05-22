// supabase/functions/_shared/reply-correlate.test.ts
import { correlateReplyHeaders } from "./reply-correlate.ts";

Deno.test("correlateReplyHeaders — single In-Reply-To matches", () => {
  const r = correlateReplyHeaders({
    inReplyTo: "<msg123@mail.gmail.com>",
    references: null,
  });
  if (r.length !== 1 || r[0] !== "<msg123@mail.gmail.com>") {
    throw new Error(`expected [<msg123>], got ${JSON.stringify(r)}`);
  }
});

Deno.test("correlateReplyHeaders — References returns ordered list", () => {
  const r = correlateReplyHeaders({
    inReplyTo: null,
    references: "<a@x.com> <b@x.com> <c@x.com>",
  });
  if (r.length !== 3) throw new Error(`expected 3 IDs, got ${r.length}`);
  if (r[0] !== "<a@x.com>") throw new Error(`first should be <a@x.com>`);
});

Deno.test("correlateReplyHeaders — both headers present de-dupes", () => {
  const r = correlateReplyHeaders({
    inReplyTo: "<b@x.com>",
    references: "<a@x.com> <b@x.com>",
  });
  if (r.length !== 2) throw new Error(`expected 2 IDs (deduped), got ${r.length}`);
});

Deno.test("correlateReplyHeaders — empty input returns empty", () => {
  const r = correlateReplyHeaders({ inReplyTo: null, references: null });
  if (r.length !== 0) throw new Error("expected empty");
});

Deno.test("correlateReplyHeaders — strips angle brackets in output", () => {
  const r = correlateReplyHeaders({
    inReplyTo: "<msg123@mail.gmail.com>",
    references: null,
  });
  if (!r[0].includes("msg123@mail.gmail.com")) throw new Error("should retain message-id body");
});
