import { createClient } from '@sanity/client';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'w0whm6ow';
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2024-10-15';
const token = process.env.SANITY_API_WRITE_TOKEN;

if (!token) {
  console.log('[typhon-publish] SANITY_API_WRITE_TOKEN not present; skipping one-time publish.');
  process.exit(0);
}

const client = createClient({ projectId, dataset, apiVersion, token, useCdn: false });
let key = 0;
const nextKey = (prefix = 'k') => `${prefix}${++key}`;

function block(text, style = 'normal') {
  return {
    _type: 'block',
    _key: nextKey('b'),
    style,
    markDefs: [],
    children: [{ _type: 'span', _key: nextKey('s'), text, marks: [] }],
  };
}

function bullet(text) {
  return {
    _type: 'block',
    _key: nextKey('b'),
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    markDefs: [],
    children: [{ _type: 'span', _key: nextKey('s'), text, marks: [] }],
  };
}

function linkedSource(label, href) {
  const markKey = nextKey('link');
  return {
    _type: 'block',
    _key: nextKey('b'),
    style: 'normal',
    markDefs: [{ _type: 'link', _key: markKey, href, openInNewTab: true }],
    children: [{ _type: 'span', _key: nextKey('s'), text: label, marks: [markKey] }],
  };
}

function table(caption, headers, rows) {
  return {
    _type: 'dataTable',
    _key: nextKey('t'),
    caption,
    headers,
    rows: rows.map((cells) => ({ _type: 'row', _key: nextKey('r'), cells })),
  };
}

const body = [
  block('Executive thesis', 'h2'),
  block('The Typhon missile story has moved beyond a temporary exercise headline. In 2026, the U.S. fired a Tomahawk from a Typhon launcher in the Philippines for the first time, deployed the system to southwestern Japan for major exercises, and signaled that the Japanese-deployed equipment would be stored at a U.S. base in Japan afterward. China has responded with unusually direct warnings that these deployments raise the risk of confrontation and an arms race.'),
  block('For supply-chain leaders, this is not a prediction that conflict is imminent. It is a warning that the western Pacific now has more military capability, more exercises, and more points of friction concentrated around some of the most important maritime corridors on earth. The business risk is therefore less about Typhon itself and more about what the system represents: a more militarized first island chain stretching from Japan through Taiwan to the Philippines.'),
  {
    _type: 'callout', _key: nextKey('c'), tone: 'warning', title: 'The freight takeaway',
    body: 'No major container line has publicly issued a Typhon-specific customer advisory as of August 28, 2026. That matters. The correct response is not to declare a shipping crisis. It is to treat Typhon as one escalation indicator inside a broader regional-risk dashboard and prepare lane contingencies before carriers are forced to react.'
  },

  block('What changed in 2026', 'h2'),
  block('The first major change came in the Philippines. During Balikatan 2026, the U.S. Army fired a Tomahawk land-attack missile from the Typhon Mid-Range Capability system on May 5. The missile launched from Tacloban in Leyte and struck a target in Nueva Ecija on Luzon roughly 600 to 630 kilometers away. It was the first Typhon live fire in the Philippines since the system arrived in 2024.'),
  block('The second change is in Japan. The U.S. Army deployed Typhon to the Japan Maritime Self-Defense Force base at Kanoya in Kagoshima Prefecture for Valiant Shield and planned follow-on participation in Orient Shield. Reporting and Japanese defense notifications indicate the equipment is expected to move to a U.S. military base in Japan for storage after the exercise cycle rather than simply leaving the country immediately.'),
  block('China formally objected on May 22. Foreign Ministry spokesperson Guo Jiakun described Typhon as a strategic offensive weapon and said deployment in Asian countries would threaten regional strategic security and increase the risk of military confrontation and an arms race. Beijing has made similar arguments about the system in the Philippines.'),
  block('The regional backdrop has also become more active. In August, Taiwan trained for anti-blockade operations that included escorting a merchant vessel. China and Indonesia conducted a naval navigation exercise east of Taiwan. Separately, China said it tracked and warned Philippine aircraft over Scarborough Shoal on August 21. None of these events equals a supply-chain disruption by itself, but together they show why logistics teams should watch the region as an operating system, not as isolated headlines.'),

  block('Why this matters to supply chains', 'h2'),
  block('The geography is the issue. The Taiwan Strait, Luzon Strait and wider South China Sea connect North Asian manufacturing, Southeast Asian transshipment, and the trans-Pacific trade. CSIS estimated that more than $2.4 trillion of goods transited the Taiwan Strait in 2024, roughly 21% of global maritime trade. UN Trade and Development reports that maritime transport still carries more than 80% of goods traded worldwide by volume, while China remains the world’s largest maritime freight economy by discharge volume.'),
  block('Any serious military restriction, temporary exclusion zone, blockade rehearsal, insurance reclassification, or carrier safety decision around these waters could therefore transmit quickly into schedule reliability. The first effects would likely show up as vessel-routing changes, missed port windows, transshipment pressure, war-risk insurance questions, and tighter effective capacity. Only after that would the market see the full rate and inventory effects.'),

  block('Lane-by-lane exposure', 'h2'),
  table('Western Pacific freight exposure under a rising-tension scenario', ['Lane / corridor', 'Primary exposure', 'Likely first operational signal', 'LIT risk view'], [
    ['China / Taiwan / Korea -> U.S. West Coast', 'Taiwan Strait, East China Sea and trans-Pacific schedules', 'Route adjustments, port omissions, blank sailings, tighter space', 'High sensitivity'],
    ['China / Taiwan / Korea -> U.S. East Coast', 'Same Asia origin risk plus Panama/Cape network dependencies', 'Longer lead times and cascading vessel rotations', 'High sensitivity'],
    ['China <-> Philippines', 'South China Sea, Luzon Strait and feeder networks', 'Feeder schedule changes, Manila congestion, booking restrictions', 'High sensitivity'],
    ['China <-> Vietnam / Thailand / Malaysia', 'South China Sea regional loops and transshipment hubs', 'Feeder delays and Singapore/Port Klang transshipment pressure', 'Medium-high'],
    ['Japan / Korea -> U.S.', 'East China Sea and waters east of Taiwan depending routing', 'Schedule padding and alternate navigation tracks', 'Medium-high'],
    ['Taiwan -> U.S. / Europe', 'Direct exposure to Taiwan Strait and east-coast Taiwan approaches', 'Insurance notices, vessel diversions, airfreight substitution', 'Very high'],
    ['Southeast Asia -> U.S.', 'Less direct for some origins, but dependent on regional hubs and shared vessel strings', 'Capacity spillover, transshipment congestion, rate uplift', 'Medium'],
    ['China -> Europe', 'Less directly exposed to Taiwan/Luzon chokepoints on many westbound routings, but network effects remain', 'Equipment and capacity reallocation, transshipment changes', 'Medium'],
  ]),

  block('What the steamship lines are actually saying', 'h2'),
  block('The most important point is what carriers are not saying: our review found no Typhon-specific public customer advisory from Maersk, MSC, CMA CGM, COSCO, Hapag-Lloyd, ONE, Evergreen, Yang Ming, ZIM or OOCL as of August 28. Supply-chain teams should not attribute normal summer omissions or weather delays to the missile issue without evidence.'),
  block('Current carrier communications do, however, show how quickly the network is already being managed around disruption. Hapag-Lloyd’s Asia and Oceania Week 35 update lists continued waits in South China, multiple Shanghai and Ningbo omissions on Latin America loops, and schedule-recovery measures on Taiwan Express. Those notices are operational, not Typhon-related, but they demonstrate the tools carriers will use if geopolitical risk starts affecting navigation: omissions, transshipment recovery, phasing, inducement calls and schedule resets.'),
  block('Maersk has also been explicit that global hostilities, vessel diversions, network disruption, equipment imbalances and selective capacity management are reducing effective capacity. Its July peak-season surcharge notices for Far East trades cited those factors while also pointing to upward pressure on Asia-North America rates. Again, Maersk did not link those actions to Typhon. The practical lesson is that the market already has limited slack in parts of the network, so a new western-Pacific disruption would arrive on top of existing geopolitical and weather-related friction.'),

  block('Three scenarios supply-chain teams should model', 'h2'),
  table('Scenario matrix', ['Scenario', 'What it looks like', 'Likely freight impact', 'Management response'], [
    ['1. Elevated tension, no commercial restriction', 'More exercises, missile deployments, coast-guard activity and diplomatic warnings', 'Mostly normal sailings; modest schedule padding; insurance questions on sensitive voyages', 'Monitor, map exposure, pre-approve alternatives'],
    ['2. Limited regional disruption', 'Temporary exercise/exclusion zones, localized incident, short closure or carrier avoidance decision', 'Port omissions, feeder disruption, airfreight spike, 3-10 day schedule volatility, spot-rate pressure', 'Activate alternate ports/routes, split bookings, raise safety stock on critical SKUs'],
    ['3. Major Taiwan / South China Sea disruption', 'Sustained blockade/quarantine conditions or military conflict affecting commercial navigation', 'Large-scale rerouting, war-risk premiums, capacity shock, widespread blank sailings, severe air and ocean constraints', 'Executive war room, prioritize essential cargo, supplier substitution, inventory rationing, contractual force-majeure review'],
  ]),

  block('What companies should do now', 'h2'),
  bullet('Map every critical supplier and customer lane that touches Taiwan, the Luzon Strait, the South China Sea, southern Japan, Hong Kong, Shanghai/Ningbo, Shenzhen/Yantian, Kaohsiung, Manila, Busan and major Southeast Asian transshipment hubs.'),
  bullet('Separate direct exposure from network exposure. A Vietnam-U.S. shipment can still be affected if it relies on a vessel string, transshipment hub, equipment pool or feeder rotation shared with China/Taiwan services.'),
  bullet('Pre-negotiate routing alternatives before disruption. For ocean, identify alternative origin ports and transshipment hubs. For time-critical freight, pre-qualify air gateways in Japan, Korea and Southeast Asia instead of waiting for a capacity rush.'),
  bullet('Set SKU-level inventory triggers. Critical components, semiconductors, electronics, automotive parts, machinery and high-value medical goods should have different buffer rules than low-value replenishment cargo.'),
  bullet('Ask forwarders and ocean carriers for their contingency logic, not a prediction. The useful questions are: what triggers a port omission, what alternate hubs are planned, how bookings will be rolled, and how war-risk or emergency surcharges would be communicated.'),
  bullet('Review marine cargo insurance and war-risk language now. Know where geographic exclusions, notice periods, additional premiums and force-majeure clauses sit before an event occurs.'),

  block('The triggers that should move you from monitoring to action', 'h2'),
  block('Supply-chain teams should escalate contingency plans when multiple signals move together, not because of one headline. The strongest triggers would be a formal navigation warning covering commercial routes, carrier-issued port or booking restrictions tied to security, war-risk insurance changes, sustained military exclusion zones near the Taiwan or Luzon straits, repeated merchant-vessel interference, major port closure notices, or several top carriers simultaneously altering rotations.'),
  {
    _type: 'callout', _key: nextKey('c'), tone: 'tip', title: 'What LIT users should monitor',
    body: 'Watch origin-port changes, carrier-mix shifts, booking/sailing frequency, port omissions, lead-time drift, new transshipment patterns, and sudden supplier diversification. A geopolitical headline becomes commercially meaningful when those freight signals start moving together.'
  },

  block('The bottom line', 'h2'),
  block('Typhon does not mean the trans-Pacific supply chain is about to shut down. But 2026 has materially changed the military operating environment around the first island chain. The Philippines has now hosted a Typhon Tomahawk live fire. Japan has accepted another deployment with post-exercise storage expected at a U.S. base. China is publicly warning that these moves raise confrontation risk, while military and coast-guard activity around Taiwan and the South China Sea remains elevated.'),
  block('For logistics leaders, the correct posture is neither panic nor complacency. Build the routing map, define the triggers, protect the critical SKUs, and monitor what carriers actually do. The companies that prepare early will have options. The companies that wait for a blank-sailing notice will be buying those options at market price.'),

  block('Selected sources', 'h2'),
  linkedSource('China Ministry of Foreign Affairs - May 22, 2026 response on Typhon deployment in Japan', 'https://www.fmprc.gov.cn/mfa_eng/xw/fyrbt/202605/t20260522_11916315.html'),
  linkedSource('U.S. Army / U.S. forces - Typhon deployment at Kanoya during Valiant Shield 2026', 'https://www.7atc.army.mil/Media-News/Video/dvpTag/USFJ/dvpmoduleid/4969/videoid/1016636/'),
  linkedSource('Stars and Stripes - U.S. Army sending Typhon systems to southern Japan, June 16, 2026', 'https://www.stripes.com/branches/army/2026-06-16/army-typhon-missile-system-japan-21980599.html'),
  linkedSource('Janes - U.S. Army fires Typhon for the first time in the Philippines during Balikatan 2026', 'https://www.janes.com/defence-intelligence-insights/defence-news/defence/us-army-fires-typhon-for-the-first-time-in-the-philippines'),
  linkedSource('U.S. Army - Balikatan 2026 counter-landing exercise in northern Luzon', 'https://www.army.mil/article/292301/balikatan_2026_u_s_army_philippine_forces_lead_joint_fires_during_balikatan_2026_counter_landing_exercise'),
  linkedSource('Reuters - Taiwan anti-blockade merchant-ship escort drill, August 13, 2026', 'https://theprint.in/world/taiwan-holds-naval-drill-during-war-games-as-china-steps-up-maritime-pressure/3013324/'),
  linkedSource('Reuters - China-Indonesia naval exercise east of Taiwan, August 11, 2026', 'https://www.internazionale.it/ultime-notizie-reuters/2026/08/11/china-indonesia-navies-to-hold-drills-in-sensitive-waters-to-east-of-taiwan'),
  linkedSource('CSIS - Troubled Straits: Analyzing Trade Chokepoints in the South China Sea, July 2026', 'https://www.csis.org/analysis/south-china-sea-trade-chokepoints'),
  linkedSource('UN Trade and Development - 2026 maritime trade data insights', 'https://unctadstat.unctad.org/insights/theme/244'),
  linkedSource('Hapag-Lloyd - Asia & Oceania Operational Update, Week 35, August 2026', 'https://www.hapag-lloyd.com/en/services-information/operational-updates/updates/2026/08/ops-updates-asia-week35.html'),
  linkedSource('Maersk - July 2026 Far East Asia peak-season surcharge notice citing hostilities and network disruption', 'https://www.maersk.com/news/articles/2026/07/09/pss-far-east-asia-south-east-india-nepal'),
];

const doc = {
  _id: 'blog-typhon-china-supply-chain-risk-2026',
  _type: 'blogPost',
  title: 'Typhon, China and the Supply Chain: What Shippers Should Watch in the Western Pacific',
  slug: { _type: 'slug', current: 'typhon-china-supply-chain-risk-2026' },
  excerpt: 'Typhon deployments in the Philippines and Japan are raising western Pacific tensions. Here is where freight is exposed, what ocean carriers are actually saying, and how shippers should prepare.',
  body,
  author: { _type: 'reference', _ref: 'author-mira-chen' },
  categories: [
    { _type: 'reference', _key: 'cat1', _ref: 'category-trade-intelligence' },
    { _type: 'reference', _key: 'cat2', _ref: 'category-market-signals' },
  ],
  publishedAt: '2026-08-28T18:55:00.000Z',
  readingTime: 11,
  featured: false,
  seo: {
    _type: 'seoFields',
    title: 'Typhon, China & Supply Chain Risk in 2026 | LIT',
    description: 'How U.S. Typhon missile deployments in Japan and the Philippines could affect China, Taiwan and trans-Pacific freight - plus a shipper contingency plan.',
    noIndex: false,
    keywords: ['Typhon missile China', 'China supply chain risk 2026', 'Taiwan Strait shipping', 'South China Sea freight', 'trans-Pacific supply chain', 'ocean freight geopolitical risk'],
  },
  cta: {
    headline: 'Monitor the freight signals before disruption hits your lane',
    body: 'Use LIT to track company shipment activity, trade lanes, carrier changes and market signals from one freight-intelligence workspace.',
    primaryCtaLabel: 'Start 7-day trial',
    primaryCtaUrl: 'https://app.logisticintel.com/signup',
    secondaryCtaLabel: 'Book a demo',
    secondaryCtaUrl: 'https://logisticintel.com/demo',
    variant: 'trial',
  },
  agentMetadata: {
    draftedBy: 'OpenAI research + LIT editorial workflow',
    draftedAt: '2026-08-28T18:55:00.000Z',
    modelVersion: 'GPT-5.6 Sol',
    sourcePrompt: 'Deep research on Typhon, China, western Pacific supply-chain exposure and steamship-line response, current through August 28, 2026.',
  },
};

await client.createOrReplace(doc);
console.log(`[typhon-publish] Published ${doc.slug.current} to Sanity production.`);
