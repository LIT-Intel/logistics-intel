import { describe, expect, it } from "vitest";
import {
  classifyIntent,
  detailFunnel,
  listFunnelCells,
  pctOf,
  variantWinnerKey,
  variantsOf,
  waitLabelOf,
} from "../computeOutbound";
import type { CampaignAggregates } from "../../api";
import type { OutboundCampaign } from "@/features/outbound/types";

const campaignWith = (
  funnel: Partial<NonNullable<OutboundCampaign["funnel"]>>,
): OutboundCampaign =>
  ({
    id: "c1",
    name: "Test",
    status: "active",
    channel: "email",
    channels: ["email"],
    steps: 3,
    recipients: null,
    metrics: {},
    createdAt: null,
    updatedAt: null,
    creator: null,
    funnel: {
      enrolled: 0, sent: 0, uniqueSent: 0, opened: 0, clicked: 0, replied: 0,
      bounced: 0, suppressed: 0, meetings: 0, openRate: null, clickRate: null,
      replyRate: null, bounceRate: null, lastEventAt: null,
      ...funnel,
    },
    health: null,
    alert: null,
    spark: null,
    nextSendLabel: "—",
  }) as OutboundCampaign;

describe("funnel bases", () => {
  it("never exceeds 100% even when events out-count their base", () => {
    // opened > sent (multi-open tracking) and replied > sent — both must clamp.
    const cells = listFunnelCells(
      campaignWith({ enrolled: 10, sent: 5, opened: 12, replied: 9, meetings: 3 }),
    );
    for (const c of cells) {
      expect(c.width).toBeLessThanOrEqual(100);
      if (c.pct) expect(parseInt(c.pct, 10)).toBeLessThanOrEqual(100);
    }
    expect(pctOf(200, 50)).toBe(100);
  });

  it("detail funnel marks untracked stages '—' and clamps real ones", () => {
    const agg: CampaignAggregates = {
      enrolledTotal: 20,
      enrolledByStatus: {},
      scheduledNext: 0,
      contacted: 0,
      events: { sent: 40, opened: 90, clicked: 0, replied: 6, bounced: 0, meetings: 2 },
      perStep: null,
    };
    const { rows, note } = detailFunnel(agg);
    expect(rows[0].label).toBe("Matched audience");
    expect(rows[0].missing).toBe(true);
    expect(rows[0].value).toBe("—");
    expect(note).toBeTruthy();
    const opened = rows.find((r) => r.label === "Opened")!;
    expect(opened.width).toBeLessThanOrEqual(100);
    expect(opened.pct).toBe("100% of sends"); // 90/40 clamps to 100
  });
});

describe("variant winner guard", () => {
  it("crowns the higher reply rate only when BOTH variants have ≥20 sends", () => {
    const win = variantWinnerKey([
      { key: "A", subject: "a", sent: 25, replied: 2 },
      { key: "B", subject: "b", sent: 30, replied: 6 },
    ]);
    expect(win).toBe("B");
    const noWin = variantWinnerKey([
      { key: "A", subject: "a", sent: 25, replied: 2 },
      { key: "B", subject: "b", sent: 19, replied: 6 }, // under threshold
    ]);
    expect(noWin).toBeNull();
    expect(variantWinnerKey([{ key: "A", subject: "a", sent: 100, replied: 9 }])).toBeNull();
  });

  it("migrates legacy subject_b into an A/B variants view", () => {
    const v = variantsOf({
      subject: "Capacity on your lane",
      subject_b: "Short on space?",
      body: "Hi",
      variants: null,
    });
    expect(v.map((x) => x.key)).toEqual(["A", "B"]);
    expect(v[1].subject).toBe("Short on space?");
    // variants jsonb wins over legacy columns when present
    const v2 = variantsOf({
      subject: "legacy",
      subject_b: "legacy-b",
      body: null,
      variants: [{ key: "A", subject: "from-json" }],
    });
    expect(v2).toHaveLength(1);
    expect(v2[0].subject).toBe("from-json");
  });
});

describe("classifyIntent", () => {
  it("detects explicit intents", () => {
    expect(classifyIntent(null, "Does Thursday at 10am CT work? Please send an invite.")).toBe("meeting_request");
    expect(classifyIntent(null, "Please remove me from this list.")).toBe("unsubscribe");
    expect(classifyIntent("Automatic reply", "I'm out until October 6 with limited access to email.")).toBe("out_of_office");
    expect(classifyIntent(null, "We just renewed with our current forwarder. Try us again in Q2.")).toBe("not_now");
    expect(classifyIntent(null, "I'm not the right person for this — our Director of Logistics runs ocean procurement.")).toBe("referral");
    expect(classifyIntent(null, "Can you send 40HC rates into LA/LB? What transit times are you seeing?")).toBe("interested");
  });

  it("returns null (Unclassified) when nothing matches — never defaults to Interested", () => {
    expect(classifyIntent(null, "Thanks.")).toBeNull();
    expect(classifyIntent("", "")).toBeNull();
    expect(classifyIntent(null, null)).toBeNull();
  });
});

describe("wait labels", () => {
  it("formats enrollment, whole-day and mixed waits", () => {
    expect(waitLabelOf({ delay_days: 0, delay_hours: 0, delay_minutes: 0 })).toBe("Sends on enrollment");
    expect(waitLabelOf({ delay_days: 1, delay_hours: 0, delay_minutes: 0 })).toBe("Wait 1 day");
    expect(waitLabelOf({ delay_days: 3, delay_hours: 0, delay_minutes: 0 })).toBe("Wait 3 days");
    expect(waitLabelOf({ delay_days: 1, delay_hours: 4, delay_minutes: 0 })).toBe("Wait 1d 4h");
    expect(waitLabelOf({ delay_days: 0, delay_hours: 0, delay_minutes: 45 })).toBe("Wait 45m");
  });
});
