/**
 * Command Center selector invariants (handoff README §6.2 + QA §7):
 *  - §3.2 per-account derivations (health, sig, yoy, series)
 *  - KPI/narrative numbers reconcile with the row set on the same filters
 *  - crossfilter: stage counts ignore stage filter, health ignores health
 *  - contacts: seniority bucketing, DM coverage gaps, channel filters
 *  - deltas never render NaN/Infinity; empty history is a state, not zeros
 */
import { describe, expect, it } from "vitest";
import type { CoMonthRow, DashCompany, DashDataset, LaneMonthRow } from "@/features/dashboard/data/computeDash";
import {
  computeAccountsView,
  computeContactsView,
  computeDrawer,
  deriveAccounts,
  isDM,
  normalizeContact,
  senBucket,
  type CCContact,
  type CCState,
} from "../computeCommandCenter";

const NOW = new Date(2026, 8, 27);
const FY = 2024;
const LAST = (2026 - FY) * 12 + 8; // Sep 2026

function co(key: string, name: string, stage: string, opts: Partial<DashCompany> = {}): DashCompany {
  return {
    key,
    uuid: "u-" + key,
    savedId: "s-" + key,
    name,
    city: "Atlanta, GA",
    stage,
    stageRaw: stage.toLowerCase(),
    topRouteFallback: null,
    lastActivityTs: +NOW - 10 * 864e5,
    initials: name.slice(0, 2).toUpperCase(),
    logoDomain: null,
    savedAtTs: +NOW - 20 * 864e5,
    ownerId: "own-1",
    ownerName: "Valesco Raymond",
    ownerKey: "VR",
    ownerColor: "#3b82f6",
    ...opts,
  };
}

const companies: DashCompany[] = [
  co("alpha", "Alpha Imports", "Prospect"), // steady
  co("bravo", "Bravo Freight", "Quoting", { savedAtTs: +NOW - 5 * 864e5 }), // growing
  co("charlie", "Charlie Goods", "Engaged", { lastActivityTs: +NOW - 120 * 864e5 }), // dormant
  co("nohist", "Ghost Trading", "Contacted", { lastActivityTs: null, savedAtTs: +NOW - 400 * 864e5 }), // no history
];

const coRows: CoMonthRow[] = [];
for (let mi = 0; mi <= LAST; mi++) {
  coRows.push({ c: "alpha", mi, shipments: 10, teu: 20, spend: 60000 });
  // bravo: prior-12M 5/mo, last-12M 8/mo → yoy +60% (growing)
  coRows.push({ c: "bravo", mi, shipments: mi >= LAST - 11 ? 8 : 5, teu: 16, spend: 48000 });
  if (mi <= LAST - 4) coRows.push({ c: "charlie", mi, shipments: 6, teu: 12, spend: 36000 });
}

const laneRows: LaneMonthRow[] = [];
for (let mi = LAST - 11; mi <= LAST; mi++) {
  laneRows.push({ c: "alpha", lane: "china::united states", fromLabel: "China", toLabel: "United States", mi, shipments: 7, teu: 14, spend: 42000 });
  laneRows.push({ c: "alpha", lane: "vietnam::united states", fromLabel: "Vietnam", toLabel: "United States", mi, shipments: 3, teu: 6, spend: 18000 });
}

const ds: DashDataset = { companies, coRows, laneRows, firstYear: FY, lastMi: LAST, todayTs: +NOW };

const mkContact = (id: string, uuid: string, over: Partial<CCContact> = {}): CCContact => ({
  id,
  companyUuid: uuid,
  name: "Person " + id,
  initials: "P" + id[0].toUpperCase(),
  title: "Logistics Manager",
  dept: "Logistics",
  sen: "Manager",
  email: "verified",
  emailAddr: `p${id}@example.com`,
  phone: false,
  linkedin: true,
  camp: null,
  touchDays: null,
  addedDays: 10,
  ...over,
});

const contacts: CCContact[] = [
  mkContact("1", "u-alpha", { sen: "VP", phone: true, camp: { name: "Q4 Peak", status: "Replied" }, touchDays: 3 }),
  mkContact("2", "u-alpha", { sen: "Staff", email: "none", emailAddr: null }),
  mkContact("3", "u-bravo", { sen: "Manager", email: "unverified", camp: { name: "Q4 Peak", status: "Sent" }, touchDays: 8 }),
  mkContact("4", "u-charlie", { sen: "C-level" }),
  // nohist has no contacts at all → coverage gap
];

const st = (over: Partial<CCState> = {}): CCState => ({
  tab: "companies", q: "", health: null, stages: [], owner: null, sort: "spend",
  sel: [], drawer: null, sen: [], chan: "all", group: false, page: 0, ...over,
});

const A = { set() {}, tog() {} };
const counts = new Map(contacts.map((c) => [c.companyUuid, contacts.filter((x) => x.companyUuid === c.companyUuid).length]));
const accounts = deriveAccounts(ds, counts);
const byKey = Object.fromEntries(accounts.map((a) => [a.co.key, a]));

describe("deriveAccounts (§3.2)", () => {
  it("classifies health from the monthly rows", () => {
    expect(byKey.alpha.health).toBe("steady");
    expect(byKey.bravo.health).toBe("growing");
    expect(byKey.charlie.health).toBe("dormant");
    expect(byKey.nohist.health).toBe("none");
  });

  it("yoy = ship/shipPrev − 1; null when no prior", () => {
    expect(byKey.bravo.yoy).toBeCloseTo(8 / 5 - 1, 6);
    expect(byKey.nohist.yoy).toBeNull();
  });

  it("series spans 24 months and sums to the row totals", () => {
    expect(byKey.alpha.series.length).toBe(24);
    expect(byKey.alpha.series.reduce((a, b) => a + b, 0)).toBe(
      coRows.filter((r) => r.c === "alpha" && r.mi >= LAST - 23).reduce((s, r) => s + r.shipments, 0),
    );
  });

  it("lanes carry shares of last-12M shipments", () => {
    expect(byKey.alpha.lanes[0].label).toBe("China → United States");
    expect(byKey.alpha.lanes[0].share).toBeCloseTo((7 * 12) / byKey.alpha.ship, 6);
  });

  it("sig follows first-match-wins", () => {
    expect(byKey.nohist.sig.t).toBe("No import history");
    expect(byKey.charlie.sig.t).toMatch(/^Quiet for \d+ days$/);
    expect(byKey.bravo.sig.t).toBe("Quote in progress"); // Quoting beats growing? No — growing check is after Quoting per mock order
  });
});

describe("computeAccountsView", () => {
  it("KPIs reconcile with the filtered list", () => {
    const v = computeAccountsView(accounts, st(), A, []);
    const ship = accounts.reduce((s, a) => s + a.ship, 0);
    expect(v.kpis.find((k) => k.id === "ship")!.value).toBe(ship.toLocaleString("en-US"));
    for (const k of v.kpis) expect(String(k.delta)).not.toMatch(/NaN|Infinity/);
    expect(v.sum.dormant).toBe(1);
  });

  it("crossfilter: health counts ignore the health filter; stage chips ignore stage filter", () => {
    const v = computeAccountsView(accounts, st({ health: "dormant" }), A, []);
    expect(v.rows.length).toBe(1);
    const steadySeg = v.healthSegs.find((h) => h.id === "steady")!;
    expect(steadySeg.count).toBe(1); // still counted while dormant filter active
    const v2 = computeAccountsView(accounts, st({ stages: ["Quoting"] }), A, []);
    expect(v2.stageChips.find((c) => c.label === "Prospect")!.count).toBe(1);
  });

  it("no-history rows render the empty state, never zeros", () => {
    const v = computeAccountsView(accounts, st({ sort: "saved" }), A, []);
    const ghost = v.rows.find((r) => r.name === "Ghost Trading")!;
    expect(ghost.none).toBe(true);
    expect(ghost.has).toBe(false);
  });

  it("sorts: volume ranks alpha first; saved ranks bravo first", () => {
    expect(computeAccountsView(accounts, st({ sort: "volume" }), A, []).rows[0].name).toBe("Alpha Imports");
    expect(computeAccountsView(accounts, st({ sort: "saved" }), A, []).rows[0].name).toBe("Bravo Freight");
  });
});

describe("contacts", () => {
  it("senBucket maps DB values and falls back to titles", () => {
    expect(senBucket("c_suite", null)).toBe("C-level");
    expect(senBucket("founder", null)).toBe("C-level");
    expect(senBucket("vp", null)).toBe("VP");
    expect(senBucket("director", null)).toBe("Director");
    expect(senBucket("entry", null)).toBe("Staff");
    expect(senBucket(null, "Chief Operating Officer")).toBe("C-level");
    expect(senBucket(null, "Director of Logistics")).toBe("Director");
    expect(senBucket(null, "Transportation Coordinator")).toBe("Staff");
  });

  it("normalizeContact derives email state from verification status", () => {
    const today = +NOW;
    const v = normalizeContact({ id: 9, company_id: "u-alpha", full_name: "A B", email: "a@b.co", email_verification_status: "verified", created_at: new Date(+NOW - 5 * 864e5).toISOString() }, null, null, today);
    expect(v.email).toBe("verified");
    expect(v.addedDays).toBe(5);
    const u = normalizeContact({ id: 10, company_id: "u-alpha", full_name: "C D", email: "c@d.co", email_verification_status: "unavailable" }, null, null, today);
    expect(u.email).toBe("unverified");
    const n = normalizeContact({ id: 11, company_id: "u-alpha", full_name: "E F", email: null }, null, null, today);
    expect(n.email).toBe("none");
  });

  it("KPIs + coverage gaps reconcile", () => {
    const v = computeContactsView(contacts, accounts, st({ tab: "contacts" }), A);
    expect(v.kpis.find((k) => k.id === "dm")!.value).toBe("2"); // VP + C-level
    expect(v.kpis.find((k) => k.id === "ver")!.value).toBe("2");
    expect(v.csum.gap).toBe(2); // bravo (only Manager) + nohist (no contacts)
    expect(v.gaps.map((g) => g.name)).toContain("Ghost Trading");
    expect(isDM({ sen: "Director" })).toBe(true);
  });

  it("channel filters scope the list", () => {
    expect(computeContactsView(contacts, accounts, st({ chan: "phone" }), A).groups[0].rows.length).toBe(1);
    expect(computeContactsView(contacts, accounts, st({ chan: "fresh" }), A).groups[0].rows.length).toBe(2);
    expect(computeContactsView(contacts, accounts, st({ chan: "email" }), A).groups[0].rows.length).toBe(2);
  });

  it("group mode emits a head per company sorted by spend", () => {
    const v = computeContactsView(contacts, accounts, st({ group: true }), A);
    expect(v.groups.every((g) => g.showHead)).toBe(true);
    expect(v.groups[0].head.name).toBe("Alpha Imports"); // highest spend
    expect(v.groups.find((g) => g.head.name === "Bravo Freight")!.head.dmWarn).toBe(true);
  });
});

describe("computeDrawer", () => {
  it("company mode carries §4.6 fields", () => {
    const d = computeDrawer(st({ drawer: { t: "co", id: "s-alpha" } }), accounts, contacts, A);
    expect(d.dCo).toBe(true);
    expect(d.pc!.bars.length).toBe(24);
    expect(d.pc!.contactCount).toBe(2);
    expect(d.pc!.people[0].sen).toBe("VP"); // sorted by seniority rank
  });

  it("contact mode links back to the company and lists peers", () => {
    const d = computeDrawer(st({ drawer: { t: "ct", id: "1" } }), accounts, contacts, A);
    expect(d.dCt).toBe(true);
    expect(d.pp!.co).toBe("Alpha Imports");
    expect(d.pp!.peers.length).toBe(1);
    expect(d.pp!.campTitle).toBe("Replied · Q4 Peak");
  });
});
