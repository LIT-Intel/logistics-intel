import { NextRequest } from "next/server";
import { createClient } from "@sanity/client";

export const dynamic = "force-dynamic";

const KEY = "publish-data-centers-ai-economy-2026-09-01";
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "w0whm6ow";
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-10-15";

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
});

let key = 0;
const nextKey = (prefix = "k") => `${prefix}${++key}`;

function block(text: string, style = "normal") {
  return {
    _type: "block",
    _key: nextKey("b"),
    style,
    markDefs: [],
    children: [{ _type: "span", _key: nextKey("s"), text, marks: [] }],
  };
}

function bullet(text: string) {
  return {
    _type: "block",
    _key: nextKey("b"),
    style: "normal",
    listItem: "bullet",
    level: 1,
    markDefs: [],
    children: [{ _type: "span", _key: nextKey("s"), text, marks: [] }],
  };
}

function linkedSource(label: string, href: string) {
  const markKey = nextKey("link");
  return {
    _type: "block",
    _key: nextKey("b"),
    style: "normal",
    markDefs: [{ _type: "link", _key: markKey, href, openInNewTab: true }],
    children: [{ _type: "span", _key: nextKey("s"), text: label, marks: [markKey] }],
  };
}

function table(caption: string, headers: string[], rows: string[][]) {
  return {
    _type: "dataTable",
    _key: nextKey("t"),
    caption,
    headers,
    rows: rows.map((cells) => ({ _type: "row", _key: nextKey("r"), cells })),
  };
}

const body = [
  block("Executive thesis", "h2"),
  block("Data centers are no longer just real estate for the internet. They are becoming the factories of the AI economy. The raw materials are GPUs, servers, transformers, switchgear, cooling systems, copper, fiber, steel, concrete and electricity. The output is compute capacity. And like every factory buildout, this one is creating a physical supply chain that freight teams can measure."),
  block("For logistics leaders, the important shift is simple: the cloud now has a heavier footprint. Every new AI campus pulls cargo through ports, airports, rail ramps, drayage yards, heavy-haul routes, warehouses, substations and local construction supply chains before it ever powers a single customer workload."),
  {
    _type: "callout",
    _key: nextKey("c"),
    tone: "tip",
    title: "The freight takeaway",
    body: "The data-center boom is creating a new industrial lane map: East Asia to U.S. gateways for servers and electronics, global electrical-equipment lanes for transformers and switchgear, domestic heavy-haul for generators and power equipment, and regional construction flows into power-rich cities." 
  },

  block("Why this market is moving so fast", "h2"),
  block("The demand signal is coming from two directions at once. First, cloud platforms are still expanding core compute, storage and networking. Second, AI workloads are raising power density inside the building. Training and inference clusters require dense racks, higher-capacity power distribution, advanced networking and more aggressive cooling than traditional enterprise data centers."),
  block("The U.S. Department of Energy and Lawrence Berkeley National Laboratory found that U.S. data centers consumed about 176 TWh in 2023, equal to roughly 4.4% of total U.S. electricity. Their 2024 report projected 325 to 580 TWh by 2028, or roughly 6.7% to 12% of U.S. electricity. Berkeley Lab’s 2025 update pushed the 2030 estimate higher, with a central case of 11.8% and a range of 9.5% to 15.3%."),
  block("EIA’s Annual Energy Outlook 2026 makes the same point from the grid side: after more than a decade of flat U.S. electricity consumption, demand has been rising again, and data-center server energy use is a major driver of long-term electricity growth."),

  block("Who is investing", "h2"),
  table("Major data-center and AI-infrastructure investors to watch", ["Company / group", "Current signal", "Key U.S. locations or markets", "Supply-chain meaning"], [
    ["Amazon / AWS", "Continued hyperscale cloud and AI-infrastructure expansion; one of the largest buyers of servers, networking gear, power equipment and data-center construction services.", "Northern Virginia, Ohio, Oregon, Texas, Mississippi, Georgia and other established AWS regions.", "Massive recurring demand for IT equipment, electrical gear, racks, fiber and construction inputs."],
    ["Microsoft", "Announced a new Pecos, Texas campus expected to add about 2 GW of capacity over five to seven years, with more than 6,000 construction jobs at peak build-out.", "Texas, Arizona, Iowa, Virginia, Wisconsin, Georgia and other Azure regions.", "Large power-campus builds create heavy construction, electrical-equipment and project-cargo demand."],
    ["Google / Alphabet", "Alphabet guided 2026 capex to roughly $180B-$190B, with the overwhelming majority tied to technical infrastructure. Google has disclosed more than 30 data centers and more than 40 Cloud regions globally.", "Virginia, Indiana, Iowa, Oklahoma, Texas, Oregon, Nevada, Ohio and other U.S. campuses.", "Custom silicon, fiber, servers and power/cooling systems move through a global technology supply chain."],
    ["Meta", "Meta says it is committing more than $600B in U.S. infrastructure and jobs by 2028; it broke ground on a $10B, 1 GW AI-capable campus in Lebanon, Indiana.", "Indiana, Louisiana, Georgia, Ohio, Iowa, Texas, Tennessee, Alabama and other markets.", "Large campuses combine server imports, domestic construction materials, utility upgrades and community-infrastructure spending."],
    ["Oracle", "Oracle raised tens of billions to fund cloud infrastructure and reported large AI infrastructure projects underway in Texas, New Mexico, Wisconsin and Michigan; Project Jupiter in New Mexico is expected to create more than $4.7B in long-term economic impact.", "Texas, New Mexico, Wisconsin, Michigan and other OCI regions.", "Cloud demand is pulling GPU/server capacity, power equipment, construction services and local infrastructure investment into secondary markets."],
    ["Equinix / Digital Realty", "Global interconnection and colocation platforms continue to serve enterprise, cloud and network customers, with capital flowing toward higher-density power and cooling.", "Northern Virginia, Dallas, Silicon Valley, Chicago, Atlanta, New York/New Jersey and other carrier-dense markets.", "More demand for network equipment, fiber, modular infrastructure and power retrofits in established metro hubs."],
    ["QTS, Vantage, STACK, CyrusOne and other campus developers", "Private and infrastructure-backed operators are building large wholesale campuses for hyperscalers and AI tenants.", "Northern Virginia, Dallas-Fort Worth, Phoenix, Atlanta, Ohio, Pennsylvania, Nevada, Utah and the Carolinas.", "These projects behave like industrial megaprojects: long lead-time power equipment, coordinated site logistics and multi-year construction flows."],
    ["Energy, cooling and equipment partners", "Utilities, turbine providers, transformer manufacturers, UPS/battery suppliers and cooling specialists are becoming strategic bottlenecks.", "Nationwide, with concentration near power-constrained data-center markets.", "Freight opportunity shifts upstream into electrical, mechanical and thermal-management supply chains."],
  ]),

  block("Where the supply chain comes from", "h2"),
  block("A modern AI data center is assembled from several physical supply chains. The IT layer includes GPUs, accelerators, CPUs, servers, storage, switches, optics and racks. The electrical layer includes transformers, switchgear, UPS systems, batteries, power distribution units, generators, turbines, busway and cabling. The thermal layer includes chillers, cooling towers, pumps, heat exchangers, rear-door systems, direct-to-chip liquid cooling, coolant distribution units and controls. The shell still requires steel, concrete, roofing, fire suppression, security, roads and substations."),
  table("Critical equipment and likely freight channels", ["Category", "Major suppliers / examples", "Typical origin exposure", "Freight mode"], [
    ["AI servers, GPUs and accelerators", "NVIDIA ecosystem, AMD, Intel, Supermicro, Dell, HPE, Lenovo, Foxconn, Quanta, Wiwynn and ODM partners.", "Taiwan, South Korea, Malaysia, Vietnam, Mexico, China and U.S. assembly where applicable. Company-specific routes require bill-of-lading or commercial shipment data.", "Air for urgent high-value hardware; ocean containers for planned server and rack movements."],
    ["Networking, optics and fiber", "Cisco, Arista, Broadcom ecosystem, Corning and optical-transceiver suppliers.", "U.S., Mexico, Taiwan, Malaysia, Vietnam, China and other electronics hubs.", "Air for urgent electronics; ocean and truck for fiber, cabinets and bulk equipment."],
    ["Transformers and switchgear", "Hitachi Energy, Siemens Energy, Schneider Electric, Eaton, ABB, GE Vernova, Mitsubishi Electric and regional manufacturers.", "U.S., Mexico, Canada, South Korea, Japan, Germany, India and other heavy electrical-equipment origins.", "Ocean breakbulk or flat rack for large units; heavy-haul truck and rail for domestic moves."],
    ["UPS, batteries and power distribution", "Vertiv, Schneider Electric, Eaton, Delta, ABB, lithium-battery suppliers and electrical integrators.", "U.S., Mexico, China, Taiwan, South Korea, Vietnam and Southeast Asia.", "Ocean containers, hazmat-compliant battery moves, truckload and LTL."],
    ["Generators, turbines and power equipment", "Caterpillar, Cummins, Rolls-Royce mtu, GE Vernova, Siemens Energy and turbine suppliers.", "U.S., Europe, Mexico and global heavy-equipment production networks.", "Project cargo, heavy-haul, rail, truck and port-to-site engineered logistics."],
    ["Cooling and liquid-cooling systems", "Vertiv, Schneider, Carrier, Johnson Controls, Trane, Daikin, Stulz, CoolIT, Boyd, Motivair and heat-exchanger suppliers.", "U.S., Mexico, Europe, China, Japan and Southeast Asia depending product line.", "Ocean containers for components; flatbed and heavy-haul for chillers and mechanical skids."],
    ["Construction inputs", "Steel, concrete, copper, conduit, rebar, precast, roofing and substation materials.", "Mostly domestic/regional for concrete and aggregates; global and domestic exposure for steel, copper and electrical components.", "Truck, rail, flatbed, bulk and regional distribution."],
  ]),
  block("The honest limitation: public trade data can show import categories by HS code, country and gateway, but it usually cannot prove a specific hyperscaler’s supplier-origin-destination route without bill-of-lading, customs or commercial shipment records. That is exactly where freight-intelligence platforms add value."),

  block("Where the buildings are going", "h2"),
  table("U.S. markets reshaped by data-center demand", ["Market", "Why it is attractive", "Watch-outs"], [
    ["Northern Virginia", "Largest U.S. data-center market, dense fiber, cloud ecosystem and deep carrier/network connectivity. CBRE reported more than 4 GW of inventory and near-zero vacancy after record 2025 absorption.", "Power delivery, entitled land scarcity, transmission timelines, local pushback and rising costs."],
    ["Texas", "Large land parcels, ERCOT market access, gas generation, wind/solar growth and fast-growing AI campuses. Microsoft’s Pecos announcement is a key signal.", "Grid reliability, interconnection, water, ratepayer concerns and local opposition."],
    ["Phoenix / Arizona", "Land, power-market access, fiber routes, existing cloud presence and proximity to West Coast demand.", "Water stress, heat, cooling load and permitting scrutiny."],
    ["Atlanta / Georgia", "Southeast fiber hub, major logistics market, utility-scale growth and proximity to enterprise demand.", "Power planning, incentives scrutiny and community concerns."],
    ["Ohio / Indiana", "Central location, power availability, lower land costs and growing hyperscale investment, including Meta’s 1 GW Lebanon, Indiana campus.", "Transmission upgrades, construction labor and incentive debates."],
    ["Iowa / Oregon / Nevada / Utah", "Existing hyperscale clusters, renewable-power access, land and cooler climates in some markets.", "Transmission, water, rural infrastructure and limited labor pools."],
    ["Carolinas / Pennsylvania / West Virginia", "Emerging AI and cloud campuses looking for power, land and tax structures outside saturated hubs.", "Project execution risk, community opposition and generation/interconnection timelines."],
  ]),

  block("How data centers change a city", "h2"),
  block("The city-level tradeoff is not as simple as pro-growth versus anti-growth. Data centers can expand the tax base, fund roads and substations, create thousands of construction jobs, attract fiber and electrical infrastructure, and put a city on the map for technology investment. But permanent operating employment is usually much smaller than construction employment. Meta’s Indiana project, for example, points to more than 4,000 construction jobs but about 300 operational positions."),
  block("That mismatch is why incentives are becoming politically sensitive. A city may see a multibillion-dollar capital project with a small permanent workforce, large power and water demands, backup-generator noise, traffic during construction and potential ratepayer pressure if utility upgrades are not properly allocated. The better deals will include transparent infrastructure funding, ratepayer protections, water commitments, local contracting, workforce development and clawbacks when promises are missed."),

  block("Government incentives are now part of the site-selection map", "h2"),
  block("State and local governments are competing with sales-tax exemptions on data-center equipment, property-tax abatements, PILOT agreements, infrastructure grants, expedited permitting, utility tariffs and workforce programs. Federal policy is more indirect: CHIPS Act semiconductor capacity, DOE grid and energy programs, transmission modernization, advanced nuclear and geothermal initiatives, and national AI competitiveness all influence whether projects can find enough power and equipment."),
  block("The most important policy shift for 2026 is that governments are no longer only asking, 'How do we attract the campus?' They are also asking, 'Who pays for the grid, water and road upgrades?' That change will matter for freight because delayed interconnection, permitting or incentive approval can delay the equipment moves that follow."),

  block("What this means for freight and logistics", "h2"),
  bullet("Ocean freight: predictable server, rack, cooling and electrical-component programs will move in containers from Asia, Mexico and Europe into U.S. gateways tied to the final campus region."),
  bullet("Air cargo: high-value chips, accelerators, urgent replacement servers, networking components and schedule-critical parts will move by air when project timelines or customer commitments are at risk."),
  bullet("Project cargo and heavy haul: transformers, generators, turbines, chillers, switchgear and modular power skids require engineered routing, permits, escorts and careful port-to-site planning."),
  bullet("Drayage and warehousing: project staging yards near ports, inland ramps and campus markets become more valuable because data-center builds need sequenced delivery, not just one-time inbound moves."),
  bullet("Trucking and rail: steel, concrete inputs, copper, conduit, backup-power equipment and domestic electrical components create regional flows into construction corridors."),
  bullet("Customs brokerage and forwarding: classification, country-of-origin strategy, tariffs, export controls, battery rules and high-value electronics compliance all become part of the data-center logistics playbook."),

  block("The risk list: where projects get stuck", "h2"),
  table("Key constraints for 2026-2030", ["Risk", "Why it matters", "Freight signal to monitor"], [
    ["Transformers and switchgear", "Long lead times can delay energization even after the building is ready.", "Imports of large electrical equipment, supplier backlogs, substation permits and project schedule changes."],
    ["Power and interconnection", "A site without power is just a warehouse shell.", "Utility queue filings, new generation announcements, transmission upgrades and rate cases."],
    ["GPU/server supply", "Compute hardware determines revenue timing for AI campuses.", "Airfreight spikes, electronics imports, ODM shipments and supplier concentration in Taiwan/Southeast Asia."],
    ["Cooling and water", "Higher rack density requires more advanced thermal systems, and local water concerns can slow approvals.", "Chiller and liquid-cooling imports, water permits, heat-reuse plans and community hearings."],
    ["Tariffs and export controls", "Servers, chips, batteries and electrical components sit inside shifting trade-policy categories.", "HS-code import trends, country-of-origin shifts and compliance notices."],
    ["Community backlash", "Opposition can reshape zoning, incentives and project timelines.", "Moratoriums, local ordinances, planning-board agendas and permit appeals."],
    ["Overbuild / financing", "Capital is huge and demand assumptions can change.", "Canceled campuses, delayed phases, leasing softness and debt-market stress."],
  ]),

  block("2026-2030 outlook", "h2"),
  block("Base case: data-center construction remains one of the strongest U.S. industrial buildouts through 2030, but power delivery becomes the governor. The winners are markets that can deliver power, land, fiber and permitting together."),
  block("Upside case: AI usage and enterprise cloud demand keep outpacing expectations, utilities accelerate generation and transmission, and more data centers pair with dedicated power. Freight demand expands across servers, cooling, transformers, copper and construction inputs."),
  block("Downside case: power costs, community opposition, water constraints, financing stress or an AI demand reset slow new starts. In that case, logistics demand does not disappear, but it shifts from greenfield construction to equipment replacement, retrofits and higher-density upgrades in existing facilities."),
  {
    _type: "callout",
    _key: nextKey("c"),
    tone: "premium",
    title: "The LIT data angle",
    body: "Track the freight signals before they show up in earnings calls: HS-code movement for servers, accelerators, transformers, switchgear, UPS systems, batteries, generators, chillers and copper; consignee/supplier changes; port and airport shifts; utility interconnection filings; project permits; and equipment lead-time changes by region."
  },

  block("The bottom line", "h2"),
  block("Data centers are becoming the factories of the AI economy. But unlike a software launch, this buildout has to move through customs, ports, airports, substations, highways, permits and local politics. The companies that understand the physical supply chain behind compute will spot opportunity earlier than the companies watching only headlines."),
  block("For freight teams, this is not just a tech story. It is a lane story, a project-cargo story, a power-equipment story and a regional economic-development story. The cloud is becoming more physical. That is where the freight opportunity is."),

  block("Selected sources", "h2"),
  linkedSource("Berkeley Lab - United States Data Center Energy Usage Report: 2025 Update, June 2026", "https://datacenters.lbl.gov/publications/united-states-data-center-energy-2025"),
  linkedSource("U.S. Department of Energy - Data center energy demand report, December 20, 2024", "https://www.energy.gov/articles/doe-releases-new-report-evaluating-increase-electricity-demand-data-centers"),
  linkedSource("EIA - Annual Energy Outlook 2026 press release, April 8, 2026", "https://www.eia.gov/pressroom/releases/press587.php"),
  linkedSource("Microsoft - Pecos, Texas data-center campus announcement, June 22, 2026", "https://blogs.microsoft.com/blog/2026/06/22/powering-the-next-wave-of-ai-expanding-capacity-with-our-new-datacenter-in-pecos/"),
  linkedSource("Meta - Lebanon, Indiana 1 GW data-center announcement, February 11, 2026", "https://about.fb.com/news/2026/02/metas-new-data-center-lebanon-indiana-marks-milestone-ai-investment/"),
  linkedSource("Meta - U.S. infrastructure investment statement, November 7, 2025 / updated 2026", "https://about.fb.com/news/2025/11/meta-data-centers-drive-economic-growth-across-us/"),
  linkedSource("Alphabet - June 2026 investor presentation", "https://blog.google/alphabet/investor-presentation-june-2026/"),
  linkedSource("Oracle - FY2026 results and AI infrastructure funding, June 10, 2026", "https://www.oracle.com/news/announcement/q4fy26-earnings-release-2026-06-10/"),
  linkedSource("Oracle - Project Jupiter New Mexico economic impact, July 28, 2026", "https://www.oracle.com/news/announcement/project-jupiter-2026-07-28/"),
  linkedSource("CBRE - Northern Virginia data-center market report, March 18, 2026", "https://www.cbre.com/press-releases/northern-virginia-extends-lead-as-largest-u-s-data-center-market-in-2025"),
  linkedSource("CBRE - Global Data Center Trends 2026", "https://www.cbre.com/insights/reports/global-data-center-trends-2026"),
];

async function getSarahAuthorId() {
  const authors = await client.fetch(`*[_type == "author" && (name match "Sara*" || name match "Sarah*")] | order(name asc){_id,name,role}`);
  const exactSarahKim = authors.find((a: any) => String(a.name || "").trim().toLowerCase() === "sarah kim");
  if (exactSarahKim) return exactSarahKim._id;
  if (authors.length === 1) return authors[0]._id;
  throw new Error(`Could not safely resolve existing Sarah/Sara author. Candidates: ${JSON.stringify(authors)}`);
}

async function getCategoryRefs() {
  const categories = await client.fetch(`*[_type == "category"]{_id,title,slug}`);
  const preferred = ["Trade Intelligence", "Market Signals", "Supply Chain", "Freight Intelligence"];
  const refs: any[] = [];
  for (const title of preferred) {
    const hit = categories.find((c: any) => String(c.title || "").toLowerCase() === title.toLowerCase());
    if (hit && !refs.some((r) => r._ref === hit._id)) refs.push({ _type: "reference", _key: nextKey("cat"), _ref: hit._id });
    if (refs.length === 2) break;
  }
  if (refs.length === 0 && categories.length > 0) refs.push({ _type: "reference", _key: nextKey("cat"), _ref: categories[0]._id });
  if (refs.length === 0) throw new Error("No existing categories found. Refusing to create taxonomy in this maintenance route.");
  return refs;
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== KEY) return Response.json({ ok: false }, { status: 404 });
  if (!process.env.SANITY_API_WRITE_TOKEN) return Response.json({ ok: false, error: "missing write token" }, { status: 500 });

  const authorId = await getSarahAuthorId();
  const categories = await getCategoryRefs();

  const doc = {
    _id: "blog-data-centers-ai-economy-supply-chain-2026",
    _type: "blogPost",
    title: "Data Centers Are Becoming the Factories of the AI Economy",
    slug: { _type: "slug", current: "data-centers-ai-economy-supply-chain-2026" },
    excerpt: "AI data centers are reshaping U.S. cities, power markets and freight lanes. Here is where the investment is going, what equipment is moving, and what supply-chain teams should watch.",
    heroImageAlt: "A modern data center campus connected to freight, power and supply-chain infrastructure",
    body,
    author: { _type: "reference", _ref: authorId },
    categories,
    publishedAt: "2026-09-01T01:10:00.000Z",
    readingTime: 12,
    featured: false,
    seo: {
      _type: "seoFields",
      title: "Data Centers and the AI Supply Chain | LIT",
      description: "How AI data centers are reshaping U.S. cities, energy demand, imports, freight lanes and supply-chain strategy through 2030.",
      noIndex: false,
      keywords: [
        "data center supply chain",
        "AI data centers",
        "data center freight",
        "data center imports",
        "AI infrastructure logistics",
        "data center electricity demand",
        "hyperscale data centers",
      ],
    },
    cta: {
      headline: "Track the freight signals behind the AI buildout",
      body: "Use LIT to monitor import activity, company shipment patterns, trade lanes and supplier movement before the market catches up.",
      primaryCtaLabel: "Start 7-day trial",
      primaryCtaUrl: "https://app.logisticintel.com/signup",
      secondaryCtaLabel: "Book a demo",
      secondaryCtaUrl: "https://logisticintel.com/demo",
      variant: "trial",
    },
  };

  await client.createOrReplace(doc);
  const updated = await client.fetch(`*[_id == $id][0]{title,slug,publishedAt,"author":author->{name,role},"categories":categories[]->{title}}`, { id: doc._id });
  return Response.json({ ok: true, updated });
}
