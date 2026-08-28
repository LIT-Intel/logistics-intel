import { NextRequest } from "next/server";
import { createClient } from "@sanity/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PUBLISH_KEY = "typhon-2026-08-28-9f4c7d2b";

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "w0whm6ow",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-10-15",
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
});

let n = 0;
const k = (p = "k") => `${p}${++n}`;
const p = (text: string, style = "normal") => ({
  _type: "block",
  _key: k("b"),
  style,
  markDefs: [],
  children: [{ _type: "span", _key: k("s"), text, marks: [] }],
});
const bullet = (text: string) => ({ ...p(text), listItem: "bullet", level: 1 });
const source = (label: string, href: string) => {
  const markKey = k("link");
  return {
    _type: "block",
    _key: k("b"),
    style: "normal",
    markDefs: [{ _type: "link", _key: markKey, href, openInNewTab: true }],
    children: [{ _type: "span", _key: k("s"), text: label, marks: [markKey] }],
  };
};
const table = (caption: string, headers: string[], rows: string[][]) => ({
  _type: "dataTable",
  _key: k("t"),
  caption,
  headers,
  rows: rows.map((cells) => ({ _type: "row", _key: k("r"), cells })),
});

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== PUBLISH_KEY) {
    return Response.json({ ok: false }, { status: 404 });
  }
  if (!process.env.SANITY_API_WRITE_TOKEN) {
    return Response.json({ ok: false, error: "SANITY_API_WRITE_TOKEN missing" }, { status: 500 });
  }

  n = 0;
  const body = [
    p("Executive thesis", "h2"),
    p("The Typhon missile story has moved beyond a temporary exercise headline. In 2026, the U.S. fired a Tomahawk from a Typhon Mid-Range Capability launcher in the Philippines for the first time and deployed the system to southwestern Japan for major exercises. China has responded with direct warnings that these deployments could raise the risk of confrontation and an arms race."),
    p("For supply-chain leaders, this is not a prediction that conflict is imminent. The commercial risk is that more military capability, exercises and points of friction are now concentrated along the first island chain, around the same western Pacific corridors that connect China, Taiwan, Japan, Korea, Southeast Asia and the trans-Pacific market."),
    { _type: "callout", _key: k("c"), tone: "warning", title: "The freight takeaway", body: "No major container line has publicly issued a Typhon-specific customer advisory as of August 28, 2026. Treat Typhon as an escalation indicator inside a broader regional-risk dashboard, not as proof of an active shipping disruption." },

    p("What changed in 2026", "h2"),
    p("During Balikatan 2026, the U.S. Army fired a Tomahawk land-attack missile from Typhon on May 5. Reporting placed the launch in Tacloban, Leyte, with the missile striking a target in Nueva Ecija on Luzon roughly 600 to 630 kilometers away. It was the first Typhon live fire in the Philippines since the system arrived in 2024."),
    p("The system also moved into Japan. The U.S. Army deployed Typhon to the Japan Maritime Self-Defense Force base at Kanoya in Kagoshima Prefecture for Valiant Shield, with follow-on participation expected in Orient Shield. Public reporting and Japanese defense notifications indicated that the equipment would be moved to a U.S. military base in Japan for storage after the exercise cycle."),
    p("China formally objected on May 22. Foreign Ministry spokesperson Guo Jiakun described Typhon as a strategic offensive weapon and said deployment in Asian countries would threaten regional strategic security while increasing the risk of military confrontation and an arms race. Beijing has made similar objections to the system's presence in the Philippines."),
    p("The wider regional backdrop remains active. In August, Taiwan trained for anti-blockade operations that included escorting a merchant vessel. China and Indonesia conducted a naval navigation exercise east of Taiwan, while China said it tracked and warned Philippine aircraft near Scarborough Shoal. None of these developments automatically disrupts freight, but together they increase the importance of monitoring the region as one connected operating environment."),

    p("Why this matters to supply chains", "h2"),
    p("The geography is the issue. The Taiwan Strait, Luzon Strait and South China Sea sit between North Asian manufacturing, Southeast Asian transshipment hubs and the trans-Pacific trade. CSIS estimated that more than $2.4 trillion of goods transited the Taiwan Strait in 2024, about 21% of global maritime trade. UN Trade and Development continues to note that maritime transport carries more than 80% of goods traded worldwide by volume."),
    p("A serious military restriction, temporary exclusion zone, blockade rehearsal, insurance reclassification or carrier safety decision in these waters could transmit rapidly into commercial schedules. The first signals would likely be route adjustments, missed port windows, transshipment pressure, war-risk insurance questions and reduced effective capacity. Rate and inventory effects would follow."),

    p("Lane-by-lane exposure", "h2"),
    table("Western Pacific freight exposure under a rising-tension scenario", ["Lane / corridor", "Primary exposure", "Likely first signal", "LIT risk view"], [
      ["China / Taiwan / Korea -> U.S. West Coast", "Taiwan Strait, East China Sea and trans-Pacific schedules", "Port omissions, route adjustments, tighter space", "High sensitivity"],
      ["China / Taiwan / Korea -> U.S. East Coast", "Asia origin disruption plus downstream Panama/Cape rotations", "Longer lead times and cascading schedule changes", "High sensitivity"],
      ["China <-> Philippines", "South China Sea, Luzon Strait and feeder networks", "Feeder changes, Manila congestion, booking restrictions", "High sensitivity"],
      ["China <-> Vietnam / Thailand / Malaysia", "Regional South China Sea loops and transshipment hubs", "Feeder delays, Singapore/Port Klang pressure", "Medium-high"],
      ["Japan / Korea -> U.S.", "East China Sea and waters east of Taiwan depending routing", "Schedule padding and alternate navigation tracks", "Medium-high"],
      ["Taiwan -> U.S. / Europe", "Direct Taiwan Strait and east-coast Taiwan exposure", "Insurance notices, diversions, airfreight substitution", "Very high"],
      ["Southeast Asia -> U.S.", "Shared vessel strings, hubs and equipment pools", "Capacity spillover and transshipment congestion", "Medium"],
      ["China -> Europe", "Less direct Taiwan/Luzon exposure on many westbound routes, but global network spillover", "Equipment and capacity reallocation", "Medium"],
    ]),

    p("What the steamship lines are actually saying", "h2"),
    p("The most important finding is what carriers are not saying. Our review found no Typhon-specific public customer advisory from Maersk, MSC, CMA CGM, COSCO, Hapag-Lloyd, ONE, Evergreen, Yang Ming, ZIM or OOCL as of August 28. Normal summer omissions, weather delays or rate actions should not be attributed to Typhon without evidence."),
    p("Current carrier communications do show the operating tools that would be used if geopolitical risk starts affecting navigation. Hapag-Lloyd's Asia and Oceania Week 35 update lists continued waits in South China, Shanghai and Ningbo omissions on several loops, and schedule-recovery measures on Taiwan Express. Those notices are operational rather than Typhon-related, but they illustrate the likely response pattern: omissions, transshipment recovery, phasing, inducement calls and schedule resets."),
    p("Maersk has separately said that global hostilities, vessel diversions, network disruption, equipment imbalances and selective capacity management are reducing effective capacity. July peak-season surcharge notices for Far East trades cited those factors and upward pressure on Asia-North America rates. Maersk did not connect the action to Typhon. The lesson is that a western-Pacific disruption would arrive on top of existing geopolitical, weather and network friction rather than into a perfectly balanced market."),

    p("Three scenarios supply-chain teams should model", "h2"),
    table("Scenario matrix", ["Scenario", "What it looks like", "Likely freight impact", "Management response"], [
      ["1. Elevated tension", "More exercises, deployments, coast-guard activity and diplomatic warnings", "Mostly normal sailings, modest padding, more insurance questions", "Monitor, map exposure, pre-approve alternatives"],
      ["2. Limited regional disruption", "Temporary exclusion zone, localized incident, short closure or carrier avoidance", "Port omissions, feeder disruption, airfreight spike, 3-10 day volatility", "Split bookings, use alternate ports, raise critical-stock buffers"],
      ["3. Major Taiwan / South China Sea disruption", "Sustained blockade/quarantine conditions or military conflict affecting navigation", "Large rerouting, war-risk premiums, capacity shock, widespread blank sailings", "Executive war room, prioritize essential cargo, supplier substitution, contract review"],
    ]),

    p("What companies should do now", "h2"),
    bullet("Map every critical supplier and customer lane touching Taiwan, the Luzon Strait, the South China Sea, southern Japan, Hong Kong, Shanghai/Ningbo, Shenzhen/Yantian, Kaohsiung, Manila, Busan and major Southeast Asian transshipment hubs."),
    bullet("Separate direct exposure from network exposure. A Vietnam-U.S. shipment can still be affected if it relies on a vessel string, transshipment hub, equipment pool or feeder rotation shared with China or Taiwan services."),
    bullet("Pre-negotiate routing alternatives before disruption. Identify alternate origin ports and hubs for ocean freight, and pre-qualify air gateways in Japan, Korea and Southeast Asia for time-critical cargo."),
    bullet("Set SKU-level inventory triggers. Semiconductors, electronics, automotive parts, machinery, medical goods and other production-critical items should not use the same buffer policy as low-value replenishment cargo."),
    bullet("Ask carriers and forwarders for contingency logic, not predictions: what triggers a port omission, which alternate hubs are planned, how rolled bookings are prioritized, and how emergency or war-risk surcharges would be communicated."),
    bullet("Review marine cargo insurance, war-risk clauses, geographic exclusions, notice periods and force-majeure language before an event forces the discussion."),

    p("The triggers that should move you from monitoring to action", "h2"),
    p("Escalate contingency plans when multiple signals move together. The strongest triggers would be a formal navigation warning covering commercial routes, carrier-issued booking or port restrictions tied to security, war-risk insurance changes, sustained military exclusion zones near the Taiwan or Luzon straits, repeated merchant-vessel interference, major port closure notices, or several top carriers simultaneously altering rotations."),
    { _type: "callout", _key: k("c"), tone: "tip", title: "What LIT users should monitor", body: "Watch origin-port changes, carrier-mix shifts, sailing frequency, port omissions, lead-time drift, new transshipment patterns and sudden supplier diversification. A geopolitical headline becomes commercially meaningful when those freight signals begin moving together." },

    p("The bottom line", "h2"),
    p("Typhon does not mean the trans-Pacific supply chain is about to shut down. But 2026 has materially changed the military operating environment around the first island chain. The Philippines has hosted a Typhon Tomahawk live fire, Japan has accepted another deployment, and China is publicly warning that these moves raise confrontation risk while military and coast-guard activity around Taiwan and the South China Sea remains elevated."),
    p("For logistics leaders, the correct posture is neither panic nor complacency. Build the routing map, define the triggers, protect the critical SKUs and monitor what carriers actually do. Companies that prepare early will have options. Companies that wait for a blank-sailing notice will be buying those options at market price."),

    p("Selected sources", "h2"),
    source("China Ministry of Foreign Affairs - May 22, 2026 response on Typhon deployment in Japan", "https://www.fmprc.gov.cn/mfa_eng/xw/fyrbt/202605/t20260522_11916315.html"),
    source("U.S. Army / U.S. Forces - Typhon deployment at Kanoya during Valiant Shield 2026", "https://www.7atc.army.mil/Media-News/Video/dvpTag/USFJ/dvpmoduleid/4969/videoid/1016636/"),
    source("Stars and Stripes - U.S. Army sending Typhon systems to southern Japan, June 16, 2026", "https://www.stripes.com/branches/army/2026-06-16/army-typhon-missile-system-japan-21980599.html"),
    source("Janes - U.S. Army fires Typhon for first time in the Philippines", "https://www.janes.com/defence-intelligence-insights/defence-news/defence/us-army-fires-typhon-for-the-first-time-in-the-philippines"),
    source("U.S. Army - Balikatan 2026 counter-landing exercise", "https://www.army.mil/article/292301/balikatan_2026_u_s_army_philippine_forces_lead_joint_fires_during_balikatan_2026_counter_landing_exercise"),
    source("Reuters - Taiwan anti-blockade merchant-ship escort drill, August 13, 2026", "https://theprint.in/world/taiwan-holds-naval-drill-during-war-games-as-china-steps-up-maritime-pressure/3013324/"),
    source("Reuters - China-Indonesia naval exercise east of Taiwan, August 11, 2026", "https://www.internazionale.it/ultime-notizie-reuters/2026/08/11/china-indonesia-navies-to-hold-drills-in-sensitive-waters-to-east-of-taiwan"),
    source("CSIS - Troubled Straits: Analyzing Trade Chokepoints in the South China Sea", "https://www.csis.org/analysis/south-china-sea-trade-chokepoints"),
    source("UN Trade and Development - 2026 maritime trade data insights", "https://unctadstat.unctad.org/insights/theme/244"),
    source("Hapag-Lloyd - Asia & Oceania Operational Update, Week 35", "https://www.hapag-lloyd.com/en/services-information/operational-updates/updates/2026/08/ops-updates-asia-week35.html"),
    source("Maersk - July 2026 Far East peak-season surcharge notice", "https://www.maersk.com/news/articles/2026/07/09/pss-far-east-asia-south-east-india-nepal"),
  ];

  const doc = {
    _id: "blog-typhon-china-supply-chain-risk-2026",
    _type: "blogPost",
    title: "Typhon, China and the Supply Chain: What Shippers Should Watch in the Western Pacific",
    slug: { _type: "slug", current: "typhon-china-supply-chain-risk-2026" },
    excerpt: "Typhon deployments in the Philippines and Japan are raising western Pacific tensions. Here is where freight is exposed, what ocean carriers are actually saying, and how shippers should prepare.",
    body,
    author: { _type: "reference", _ref: "author-mira-chen" },
    categories: [
      { _type: "reference", _key: "cat1", _ref: "category-trade-intelligence" },
      { _type: "reference", _key: "cat2", _ref: "category-market-signals" },
    ],
    publishedAt: "2026-08-28T18:55:00.000Z",
    readingTime: 11,
    featured: false,
    seo: {
      _type: "seoFields",
      title: "Typhon, China & Supply Chain Risk in 2026 | LIT",
      description: "How U.S. Typhon deployments in Japan and the Philippines could affect China, Taiwan and trans-Pacific freight, plus a shipper contingency plan.",
      noIndex: false,
      keywords: ["Typhon missile China", "China supply chain risk 2026", "Taiwan Strait shipping", "South China Sea freight", "trans-Pacific supply chain", "ocean freight geopolitical risk"],
    },
    cta: {
      headline: "Monitor the freight signals before disruption hits your lane",
      body: "Use LIT to track company shipment activity, trade lanes, carrier changes and market signals from one freight-intelligence workspace.",
      primaryCtaLabel: "Start 7-day trial",
      primaryCtaUrl: "https://app.logisticintel.com/signup",
      secondaryCtaLabel: "Book a demo",
      secondaryCtaUrl: "https://logisticintel.com/demo",
      variant: "trial",
    },
    agentMetadata: {
      draftedBy: "OpenAI research + LIT editorial workflow",
      draftedAt: "2026-08-28T18:55:00.000Z",
      modelVersion: "GPT-5.6 Sol",
      sourcePrompt: "Deep research on Typhon, China, western Pacific supply-chain exposure and steamship-line response, current through August 28, 2026.",
    },
  };

  await client.createOrReplace(doc);
  return Response.json({ ok: true, slug: doc.slug.current });
}
