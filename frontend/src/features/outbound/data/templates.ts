import type { OutreachTemplate } from "../types";

// Starter outreach templates for the LIT Outbound Engine.
//
// Curated for use by Logistic Intel's three in-house AI agents. Each template
// is a freight-intelligence outreach to an importer / shipper decision-maker
// in a specific industry. Tone is human, professional, relaxed, confident,
// creative — the opposite of a hard pitch. Hooks lean on real shipment-data
// signals (lane shift, cadence change, regulatory event, peak season, etc.)
// so the recipient feels seen, not solicited.
//
// Variables resolved at send time:
//   {{first_name}}    → recipient's first name
//   {{company_name}}  → recipient company
//   {{top_lane}}      → their top trade lane (e.g. "VN→LAX")
//   {{port}}          → the port from their lane signal
//   {{quarter}}       → quarter the signal occurred (e.g. "Q1")
//   {{competitor}}    → carrier or forwarder they shifted from
//   {{tariff_event}}  → named regulatory event (template-specific)
//   {{industry}}      → recipient's industry vertical
//   {{sender_name}}   → sender's first name
//
// Templates that don't use a given variable simply don't reference it; the
// merge engine leaves unresolved tokens visible (no crash, no silent blanks)
// per CLAUDE.md spec.

export interface StarterTemplate extends OutreachTemplate {
  industry:
    | "automotive"
    | "electronics"
    | "solar"
    | "data_centers"
    | "manufacturing"
    | "apparel"
    | "pharma"
    | "food_beverage"
    | "chemicals"
    | "cpg"
    | "any";
  /** "opener" = first-touch · "bump" = step 2/3 follow-up · "breakup" = exit step */
  intent: "opener" | "bump" | "breakup";
  /** Step kind this template is shaped for. Email is the default. */
  channel: "email" | "linkedin_invite" | "linkedin_message" | "call";
  /** Short reason a campaign builder should pick this. */
  hook: string;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "tpl-auto-tier1",
    name: "Automotive · Tier-1 lane shift",
    industry: "automotive",
    intent: "opener",
    channel: "email",
    persona_id: null,
    hook: "Tier-1 supplier whose trans-Pacific cadence rebalanced after a competitor consolidation",
    subject:
      "{{first_name}} — Q1 trans-Pacific cadence vs your Tier-1 peers",
    body: `Hi {{first_name}},

I was looking through Q1 trans-Pacific data for tier-1 auto suppliers and noticed {{company_name}}'s cadence on {{top_lane}} rebalanced after the {{competitor}} consolidation.

Curious whether that was a planned move or you got pushed into it — I work with a few automotive supply teams on lane benchmarking and there's a pattern emerging on which carriers handled the consolidation gracefully and which didn't.

If it's useful I'm happy to share what we're seeing across the cohort. No deck, just notes.

— {{sender_name}}`,
  },
  {
    id: "tpl-electronics-jit",
    name: "Electronics · JIT cadence anomaly",
    industry: "electronics",
    intent: "opener",
    channel: "email",
    persona_id: null,
    hook: "Electronics importer running JIT whose monthly cadence jumped sharply",
    subject:
      "Re: {{top_lane}} container mix for {{company_name}}",
    body: `Hi {{first_name}},

Your shipment cadence on {{top_lane}} jumped meaningfully in {{quarter}} — uncommon for electronics importers running JIT, where the typical pattern is steady-state with sharp seasonal pulls.

A few possibilities I see in the data:
- carrier-driven (rate window or capacity opening)
- inventory rebalance ahead of a product launch
- rerouting around a slow lane

Is one of those right? I work with a few {{industry}} teams on lane diversification and was curious about the story behind the move.

— {{sender_name}}`,
  },
  {
    id: "tpl-solar-tariff",
    name: "Solar · Tariff reroute",
    industry: "solar",
    intent: "opener",
    channel: "email",
    persona_id: null,
    hook: "Solar panel importer rerouting volume after a tariff event (AD/CVD, UFLPA, Section 201, etc.)",
    subject:
      "{{company_name}} — VN vs KH panel routing post-{{tariff_event}}",
    body: `Hi {{first_name}},

Watching what's happening with {{tariff_event}} on solar imports — a few of the panel importers we benchmark have rerouted {{top_lane}}-bound volume to alternate origins this past month, and the cohort numbers are starting to diverge.

{{company_name}}'s pattern looks like you've already made a call. Curious whether you locked alternate-origin capacity early or you're still feeling out where the reliable bookings are.

Happy to share what's working and what isn't across the panel cohort — straight numbers, no pitch.

— {{sender_name}}`,
  },
  {
    id: "tpl-datacenter-server",
    name: "Data centers · Server hardware lane",
    industry: "data_centers",
    intent: "opener",
    channel: "email",
    persona_id: null,
    hook: "Data-center / hyperscaler operator importing server hardware where transit variance affects deployment SLAs",
    subject:
      "Server hardware lanes — what we're seeing on {{top_lane}}",
    body: `Hi {{first_name}},

Build-out timelines for hyperscalers have made server-component freight one of the more interesting lanes to watch right now — equipment delays cascade straight into deployment windows.

{{company_name}}'s {{top_lane}} pattern looks tighter than the cohort average. Whether that's discipline or you've just been lucky, I'd be curious which it is, because we've been compiling a transit-time variance benchmark for {{industry}} that's starting to show real spread between operators.

15 minutes if it's useful?

— {{sender_name}}`,
  },
  {
    id: "tpl-mfg-china1",
    name: "Manufacturing · China+1 reality check",
    industry: "manufacturing",
    intent: "opener",
    channel: "email",
    persona_id: null,
    hook: "Manufacturer whose origin mix actually reflects diversification (most still don't)",
    subject:
      "{{company_name}} — China+1 vs full diversification, real lane data",
    body: `Hi {{first_name}},

The China+1 conversation is everywhere, but the lane data tells a different story for manufacturers your size — most still show >70% of volume on legacy origins and the diversification claims don't survive a look at actual booking patterns.

{{company_name}}'s mix looks more balanced than the cohort. If you have 15 minutes I'd love to compare notes on what actually moved the needle for you — vendor base, freight terms, INCO renegotiation. We're seeing a pretty wide range of "this worked" / "this didn't".

— {{sender_name}}`,
  },
  {
    id: "tpl-apparel-peak",
    name: "Apparel · Pre-peak capacity",
    industry: "apparel",
    intent: "opener",
    channel: "email",
    persona_id: null,
    hook: "Apparel/retail importer who locks Q4 capacity earlier than the cohort",
    subject:
      "Pre-peak {{top_lane}} capacity — {{company_name}} vs cohort",
    body: `Hi {{first_name}},

Booking for peak is starting earlier this year. Across the apparel cohort moving on {{top_lane}}, lead times tightened ~3 weeks ahead of last year, and {{company_name}}'s pattern is more buttoned-up than most — which suggests you've either already locked Q4 contracts or you're running tight forecasts I'd love to learn from.

If you're still in negotiations, I'd be happy to share what the cohort is seeing on rates, GRI calendars, and which carriers are honoring named-account commitments versus opening it up.

— {{sender_name}}`,
  },
  {
    id: "tpl-pharma-coldchain",
    name: "Pharma · Cold-chain integrity",
    industry: "pharma",
    intent: "opener",
    channel: "email",
    persona_id: null,
    hook: "Pharma / cold-chain shipper whose lane stayed clean while peers had incidents",
    subject:
      "Cold-chain integrity on {{top_lane}} — recent variance",
    body: `Hi {{first_name}},

Pharma cold-chain on {{top_lane}} had a noticeable variance event last month — three excursion incidents we tracked across the cohort, two of them at handoff rather than in transit.

{{company_name}} doesn't appear in the affected set, which is a good story. Curious whether your QA team flagged anything internally we'd find useful to compare notes on, or whether your carrier mix simply skewed away from the affected route.

I'm not selling cold-chain logistics — I'm tracking it. But if there's a benchmarking conversation that's useful, happy to set it up.

— {{sender_name}}`,
  },
  {
    id: "tpl-food-port",
    name: "Food & Bev · Port congestion",
    industry: "food_beverage",
    intent: "opener",
    channel: "email",
    persona_id: null,
    hook: "Food / beverage importer whose chilled freight dwell time is beating the cohort",
    subject:
      "{{port}} chilled freight dwell — {{company_name}} pattern",
    body: `Hi {{first_name}},

{{port}} chilled-freight dwell times have stretched ~18% the past 30 days across the cohort we track. {{company_name}}'s average is holding well below that — interested whether that's planning, carrier mix, or you've quietly started routing around the bottleneck.

Cold-chain food importers are pulling some interesting moves right now and the spread between best and worst is wide. If you've found something that works, comparing notes seems useful for both of us.

— {{sender_name}}`,
  },
  {
    id: "tpl-chem-imo",
    name: "Industrial chemicals · IMO compliance",
    industry: "chemicals",
    intent: "opener",
    channel: "email",
    persona_id: null,
    hook: "Chemicals importer who sailed through an IMO classification update that disrupted peers",
    subject:
      "IMO compliance on {{top_lane}} — what's changed for chem importers",
    body: `Hi {{first_name}},

The IMO classification updates that hit chemical importers in {{quarter}} created some genuine scramble for the cohort — bookings shifted, several lanes saw a temporary cadence dip, and carriers got selective on hazmat acceptance.

{{company_name}}'s shipment pattern didn't show the same disruption — guessing your team got ahead of the reclassification. Worth 15 minutes comparing what worked and where you're seeing risk for the next regulatory wave?

— {{sender_name}}`,
  },
  {
    id: "tpl-cpg-glass",
    name: "CPG · Packaging / glass freight",
    industry: "cpg",
    intent: "opener",
    channel: "email",
    persona_id: null,
    hook: "CPG / beverage brand importing glass + packaging on a volatile lane",
    subject:
      "Glass + packaging freight from {{top_lane}} — {{company_name}}",
    body: `Hi {{first_name}},

Glass and packaging freight from {{top_lane}} has been one of the more volatile categories this year — fragility surcharges, container weight thresholds, and a handful of insurance loss events that changed how a few carriers price the lane.

{{company_name}}'s cadence and route mix look like you've found a working pattern. I work with a few {{industry}} brands on this lane specifically — happy to share what's going right and wrong across the cohort if that's useful framing for your next negotiation cycle.

— {{sender_name}}`,
  },
  {
    id: "tpl-any-bump",
    name: "Cross-industry · Soft bump (step 2)",
    industry: "any",
    intent: "bump",
    channel: "email",
    persona_id: null,
    hook: "Generic step-2 follow-up — references the original signal, adds a new datapoint, low-pressure",
    subject:
      "Re: {{top_lane}} — one more datapoint",
    body: `Hi {{first_name}},

Following up on my note about {{top_lane}} — I've since pulled a fresh slice of the cohort data and {{company_name}}'s position is even more interesting in context. Won't repeat the whole thing here.

If a benchmarking call doesn't fit your week, I can also just send you the slice as a one-pager. Happy to. Just let me know which is easier.

— {{sender_name}}`,
  },
  {
    id: "tpl-any-breakup",
    name: "Cross-industry · Breakup (final step)",
    industry: "any",
    intent: "breakup",
    channel: "email",
    persona_id: null,
    hook: "Final step — gives the recipient a graceful exit, drops value, doesn't beg",
    subject:
      "One last note before I move on",
    body: `Hi {{first_name}},

This is my last note — I don't want to be that person who keeps writing. If the timing isn't right or this isn't your area, just ignore this and I'll close the loop on my end.

Either way, I appreciate the read. The benchmark report on {{top_lane}} that I referenced is here in case it's ever useful: https://logisticintel.com/intel/{{top_lane}}.

Wishing you a clean Q ahead.

— {{sender_name}}`,
  },
  {
    id: "tpl-any-li-invite",
    name: "Cross-industry · LinkedIn invite",
    industry: "any",
    intent: "opener",
    channel: "linkedin_invite",
    persona_id: null,
    hook: "LinkedIn connect with a referrer / lane angle — short, specific, no link",
    subject: "Connect · {{top_lane}} cohort",
    body: `Hi {{first_name}}, came across {{company_name}}'s pattern on {{top_lane}} while putting together a benchmark for {{industry}} importers. Would value comparing notes on what's actually working on that lane — happy to share what I'm seeing if it's useful. — {{sender_name}}`,
  },
];

export function applyVariables(
  text: string | null | undefined,
  vars: Record<string, string | undefined | null>,
): string {
  if (!text) return "";
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") return match;
    return String(v);
  });
}
