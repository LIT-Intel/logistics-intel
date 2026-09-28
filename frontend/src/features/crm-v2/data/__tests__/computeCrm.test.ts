import { describe, it, expect } from "vitest";
import {
  isStale,
  hasNoStep,
  stageProbability,
  weightedValue,
  selectPipelineColumns,
  selectForecastGroups,
  selectTaskSections,
  selectHarveyNBA,
  selectAgingMatrix,
  selectSourceCards,
  selectServiceWinRates,
  selectStageConversion,
  dueDayDiff,
} from "../computeCrm";
import type { DealCardV2, TaskV2 } from "../../api";
import type { DealStage } from "@/api/crm";

const NOW = new Date("2026-09-28T12:00:00Z").getTime();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();
const dateStr = (daysFromNow: number) => {
  const d = new Date(NOW + daysFromNow * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const stages: DealStage[] = [
  { id: "s1", org_id: "o", name: "New", position: 1, is_won: false, is_lost: false, color: "#94a3b8" },
  { id: "s2", org_id: "o", name: "Qualified", position: 2, is_won: false, is_lost: false, color: "#60a5fa" },
  { id: "s3", org_id: "o", name: "Quoted", position: 3, is_won: false, is_lost: false, color: "#8b5cf6" },
  { id: "s4", org_id: "o", name: "Negotiation", position: 4, is_won: false, is_lost: false, color: "#f59e0b" },
  { id: "s5", org_id: "o", name: "Won", position: 5, is_won: true, is_lost: false, color: "#10b981" },
  { id: "s6", org_id: "o", name: "Lost", position: 6, is_won: false, is_lost: true, color: "#f43f5e" },
];

function deal(over: Partial<DealCardV2>): DealCardV2 {
  return {
    id: Math.random().toString(36).slice(2),
    org_id: "o",
    saved_company_id: null,
    company_id: null,
    title: "Deal",
    value_amount: 100_000,
    currency: "USD",
    stage_id: "s1",
    status: "open",
    expected_close_date: null,
    primary_contact_id: null,
    owner_user_id: "u1",
    notes: null,
    service_type: null,
    origin: null,
    destination: null,
    created_by: "u1",
    created_at: iso(30),
    updated_at: iso(1),
    closed_at: null,
    next_step_text: "Follow up",
    next_step_due: null,
    lost_reason: null,
    source: "manual",
    source_campaign_id: null,
    stage_entered_at: iso(5),
    is_stale: null,
    last_activity_at: iso(1),
    ...over,
  } as DealCardV2;
}

function task(over: Partial<TaskV2>): TaskV2 {
  return {
    id: Math.random().toString(36).slice(2),
    org_id: "o",
    deal_id: null,
    saved_company_id: null,
    contact_id: null,
    title: "Task",
    due_date: dateStr(0),
    status: "open",
    assignee_user_id: "u1",
    created_by: "u1",
    created_at: iso(2),
    completed_at: null,
    task_type: "call",
    source: "manual",
    trigger_label: null,
    snoozed_until: null,
    outcome: null,
    ...over,
  } as TaskV2;
}

describe("stale / no-step flags", () => {
  it("stale = open deal with last activity > 14 days; closed deals never stale", () => {
    expect(isStale(deal({ last_activity_at: iso(15) }), NOW)).toBe(true);
    expect(isStale(deal({ last_activity_at: iso(14) }), NOW)).toBe(false);
    expect(isStale(deal({ last_activity_at: iso(40), status: "won", stage_id: "s5" }), NOW)).toBe(false);
  });
  it("noStep = open && !next_step_text", () => {
    expect(hasNoStep(deal({ next_step_text: null }))).toBe(true);
    expect(hasNoStep(deal({ next_step_text: "Call" }))).toBe(false);
    expect(hasNoStep(deal({ next_step_text: null, status: "lost", stage_id: "s6" }))).toBe(false);
  });
});

describe("weighted values", () => {
  it("maps canonical stage names to spec probabilities and weights value", () => {
    expect(stageProbability(stages[0], stages)).toBe(0.1);
    expect(stageProbability(stages[2], stages)).toBe(0.5);
    expect(stageProbability(stages[4], stages)).toBe(1);
    expect(stageProbability(stages[5], stages)).toBe(0);
    expect(weightedValue(deal({ stage_id: "s3", value_amount: 200_000 }), stages)).toBe(100_000);
  });
  it("position-interpolates unknown stage names without NaN", () => {
    const custom: DealStage[] = [
      { id: "a", org_id: "o", name: "Intake", position: 1, is_won: false, is_lost: false, color: "#000" },
      { id: "b", org_id: "o", name: "Working", position: 2, is_won: false, is_lost: false, color: "#000" },
      { id: "c", org_id: "o", name: "Closing", position: 3, is_won: false, is_lost: false, color: "#000" },
    ];
    const ps = custom.map((s) => stageProbability(s, custom));
    for (const p of ps) {
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0.1);
      expect(p).toBeLessThanOrEqual(0.75);
    }
    expect(ps[0]).toBeLessThan(ps[1]);
    expect(ps[1]).toBeLessThan(ps[2]);
  });
});

describe("selectPipelineColumns", () => {
  it("buckets deals per stage with count/total/weighted", () => {
    const deals = [
      deal({ stage_id: "s1", value_amount: 100_000 }),
      deal({ stage_id: "s1", value_amount: 50_000 }),
      deal({ stage_id: "s4", value_amount: 200_000 }),
    ];
    const cols = selectPipelineColumns(deals, stages, NOW);
    expect(cols).toHaveLength(6);
    expect(cols[0].count).toBe(2);
    expect(cols[0].total).toBe(150_000);
    expect(cols[0].weighted).toBeCloseTo(15_000);
    expect(cols[3].weighted).toBeCloseTo(150_000);
    expect(cols[4].isClosedCol).toBe(true);
  });
});

describe("selectForecastGroups", () => {
  it("groups open deals by close month, no-close-date last, sorted by weighted desc", () => {
    const deals = [
      deal({ expected_close_date: "2026-10-15", stage_id: "s2", value_amount: 100_000 }),
      deal({ expected_close_date: "2026-10-02", stage_id: "s4", value_amount: 100_000 }),
      deal({ expected_close_date: null }),
      deal({ expected_close_date: "2026-11-01" }),
      deal({ status: "won", stage_id: "s5", expected_close_date: "2026-10-20" }),
    ];
    const groups = selectForecastGroups(deals, stages);
    expect(groups.map((g) => g.key)).toEqual(["2026-10", "2026-11", "none"]);
    expect(groups[0].deals).toHaveLength(2);
    // Negotiation-weighted deal sorts above Qualified
    expect(groups[0].deals[0].stage_id).toBe("s4");
    expect(groups[2].label).toBe("No close date");
  });
});

describe("selectTaskSections", () => {
  it("splits overdue/today/upcoming with snoozed_until overriding due_date", () => {
    const tasks = [
      task({ due_date: dateStr(-3) }), // overdue
      task({ due_date: dateStr(0) }), // today
      task({ due_date: dateStr(2) }), // upcoming
      task({ due_date: dateStr(-2), snoozed_until: dateStr(1) }), // snoozed → upcoming
      task({ due_date: dateStr(-1), status: "done" }), // done → excluded
      task({ due_date: null }), // no due → upcoming (last)
    ];
    const s = selectTaskSections(tasks, NOW);
    expect(s.overdue).toHaveLength(1);
    expect(s.today).toHaveLength(1);
    expect(s.upcoming).toHaveLength(3);
    expect(dueDayDiff(s.upcoming[0], NOW)).toBe(1);
    expect(s.upcoming[s.upcoming.length - 1].due_date).toBeNull();
  });
});

describe("selectHarveyNBA rule order", () => {
  it("won → lost → no-step → stale → default, first match wins", () => {
    expect(selectHarveyNBA(deal({ status: "won", stage_id: "s5", next_step_text: null }), stages, NOW).rule).toBe("won");
    expect(selectHarveyNBA(deal({ status: "lost", stage_id: "s6", lost_reason: "Price", next_step_text: null }), stages, NOW).rule).toBe("lost");
    // no-step beats stale even when the deal is also stale
    expect(selectHarveyNBA(deal({ next_step_text: null, last_activity_at: iso(30) }), stages, NOW).rule).toBe("no-step");
    expect(selectHarveyNBA(deal({ next_step_text: "Call", last_activity_at: iso(30) }), stages, NOW).rule).toBe("stale");
    expect(selectHarveyNBA(deal({ next_step_text: "Call", last_activity_at: iso(2) }), stages, NOW).rule).toBe("default");
  });
  it("health-dependent rules only apply when a health map entry is present", () => {
    const d = deal({ next_step_text: "Call", last_activity_at: iso(2), company_id: "co1" });
    expect(selectHarveyNBA(d, stages, NOW).rule).toBe("default");
    expect(selectHarveyNBA(d, stages, NOW, { co1: { health: "slowing", yoyPct: -0.18 } }).rule).toBe("slowing");
    expect(selectHarveyNBA(d, stages, NOW, { co1: { newLaneOrigin: "India" } }).rule).toBe("new-lane");
  });
});

describe("selectAgingMatrix", () => {
  it("buckets open deals by days since last touch, open stages only", () => {
    const deals = [
      deal({ stage_id: "s1", last_activity_at: iso(2) }), // 0–7
      deal({ stage_id: "s1", last_activity_at: iso(10) }), // 8–14
      deal({ stage_id: "s1", last_activity_at: iso(20) }), // 15–30
      deal({ stage_id: "s1", last_activity_at: iso(45) }), // 30+
      deal({ stage_id: "s5", status: "won", last_activity_at: iso(45) }), // excluded
    ];
    const rows = selectAgingMatrix(deals, stages, NOW);
    expect(rows).toHaveLength(4); // New/Qualified/Quoted/Negotiation only
    expect(rows[0].cells).toEqual([1, 1, 1, 1]);
    expect(rows[1].cells).toEqual([0, 0, 0, 0]);
  });
});

describe("win-rate guards (no invented numbers)", () => {
  it("source cards return winRate null under 5 closed deals in 90d", () => {
    const few = [
      deal({ source: "manual", status: "won", stage_id: "s5", closed_at: iso(10) }),
      deal({ source: "manual", status: "lost", stage_id: "s6", closed_at: iso(20) }),
      deal({ source: "manual" }),
    ];
    const cards = selectSourceCards(few, NOW);
    expect(cards[0].winRate).toBeNull();
    const many = [
      ...Array.from({ length: 3 }, () => deal({ source: "signal", status: "won", stage_id: "s5", closed_at: iso(5) })),
      ...Array.from({ length: 2 }, () => deal({ source: "signal", status: "lost", stage_id: "s6", closed_at: iso(5) })),
    ];
    const c2 = selectSourceCards(many, NOW);
    expect(c2[0].winRate).toBeCloseTo(0.6);
  });
  it("service win rates apply the same guard and never emit NaN", () => {
    const rows = selectServiceWinRates(
      [deal({ service_type: "ocean" }), deal({ service_type: "drayage", status: "won", stage_id: "s5", closed_at: iso(1) })],
      NOW,
    );
    for (const r of rows) {
      expect(r.winRate).toBeNull();
      expect(Number.isNaN(r.dealCount)).toBe(false);
    }
  });
});

describe("selectStageConversion", () => {
  it("computes adjacent-stage rates from stage_change events and returns [] with none", () => {
    expect(selectStageConversion([], stages)).toEqual([]);
    const ev = (dealId: string, to: string, daysAgo: number) => ({
      deal_id: dealId,
      to_name: to,
      from_name: null,
      created_at: iso(daysAgo),
    });
    const rows = selectStageConversion(
      [ev("d1", "New", 30), ev("d1", "Qualified", 20), ev("d2", "New", 25), ev("d1", "Quoted", 10)],
      stages,
    );
    const nq = rows.find((r) => r.label === "New → Qualified")!;
    expect(nq.rate).toBeCloseTo(0.5); // d1 of {d1,d2}
    expect(nq.avgDays).toBe(10);
    const qq = rows.find((r) => r.label === "Qualified → Quoted")!;
    expect(qq.rate).toBeCloseTo(1);
  });
});
