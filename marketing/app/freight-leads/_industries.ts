/**
 * /freight-leads/[industry] data file. Local TS, not Sanity.
 *
 * Each entry powers a programmatic detail page that targets
 * "freight leads for [vertical]" queries with real HS-code priors,
 * lane highlights, signal examples, pain points, and FAQ.
 *
 * Do NOT name real customers, fabricate metrics, or name third-party
 * freight data vendors (Apollo, Lusha, Panjiva, ImportYeti, etc.) in
 * copy describing where LIT's data comes from on this surface.
 */

export type FreightLeadsIndustry = {
  slug: string;
  industry: string;
  headline: string;
  subhead: string;
  audienceLine: string;
  topShipperProfiles: string[];
  signalExamples: string[];
  lanesHighlighted: { from: string; to: string; cargo: string }[];
  painPoints: string[];
  hsHints: { code: string; description: string }[];
  faq: { q: string; a: string }[];
  seo: { title: string; description: string };
};

export const INDUSTRIES: FreightLeadsIndustry[] = [
  {
    slug: "automotive",
    industry: "Automotive & auto parts",
    headline: "Freight leads for automotive & auto parts importers",
    subhead:
      "Surface active OEMs, Tier-1 suppliers, and aftermarket distributors moving 8708 parts, 8703 vehicles, and 4011 tires this quarter — with the decision-makers attached.",
    audienceLine:
      "Built for forwarders, NVOCCs, and 3PLs selling into automotive supply chains in North America and Asia.",
    topShipperProfiles: [
      "Tier-1 brake & chassis suppliers",
      "Multinational auto OEMs with US assembly footprint",
      "Aftermarket parts distributors",
      "Specialty performance and electric vehicle component importers",
      "OEM electronics & ignition system suppliers",
      "Tire and rubber component importers",
    ],
    signalExamples: [
      "New origin in Vietnam for an importer who normally ships from China — likely supplier diversification underway",
      "A 3-month decline in inbound HS 8708 volume for a Tier-1 — RFQ window probably open",
      "First-time entry of HS 8507 (lithium batteries) for an importer historically focused on 8407 engines — EV pivot signal",
      "Switch from one ocean carrier alliance to another on a steady Yokohama–LA lane — re-quote window",
      "New entry through Houston for an importer who has always cleared through Long Beach — gateway diversification",
    ],
    lanesHighlighted: [
      { from: "Ningbo", to: "Long Beach", cargo: "Body panels, brake assemblies, electronics (HS 8708, 8511)" },
      { from: "Yokohama", to: "Los Angeles", cargo: "OEM transmission and engine components (HS 8708, 8407)" },
      { from: "Manzanillo, MX", to: "Long Beach", cargo: "Cross-border Tier-1 components & wiring harnesses" },
      { from: "Busan", to: "Savannah", cargo: "EV battery modules and electric drivetrain parts (HS 8507, 8501)" },
    ],
    painPoints: [
      "JIT delivery windows make every hour of dwell cost real money — late-shipment exposure compounds across the line",
      "USMCA origin requalification on Tier-1 parts after the 2026 review is reshuffling sourcing decisions in real time",
      "Section 232 metals tariffs on derivative auto components are creating tariff-engineering opportunities most reps miss",
      "Supplier audit and labor-rights enforcement post-Rapid Response Mechanism is forcing sourcing changes you can prospect against",
    ],
    hsHints: [
      { code: "8708", description: "Parts & accessories of motor vehicles" },
      { code: "8703", description: "Passenger motor vehicles" },
      { code: "8407", description: "Spark-ignition internal combustion engines" },
      { code: "8511", description: "Ignition and electrical starting equipment" },
      { code: "4011", description: "New pneumatic tires of rubber" },
    ],
    faq: [
      {
        q: "How does Logistic Intel surface new automotive importers?",
        a: "Every active automotive importer is built from ocean and air manifest filings refreshed daily, joined to verified buyer-side contacts in supply chain, logistics, and procurement roles. You filter by HS code, origin country, port pair, or carrier and get back live shippers — not stale company lists.",
      },
      {
        q: "Is LIT better for OEMs or for aftermarket distributors?",
        a: "Both. The OEM motion is a smaller universe of large accounts with predictable Tier-1 relationships; LIT helps you map the full vendor tree and time outreach to carrier or origin shifts. The aftermarket motion is broader, with thousands of mid-market distributors where Pulse AI alerts on first-time HS entries and volume jumps drive most opportunities.",
      },
      {
        q: "Can I filter on EV-specific components like batteries or motors?",
        a: "Yes. HS 8507 (lithium batteries), 8501 (electric motors), 8504 (power conversion), and 9032 (control instruments) are first-class filters. You can also combine HS filters with origin filters to find, for example, every importer who started bringing in HS 8507 from Korea in the last 90 days.",
      },
      {
        q: "Do you cover cross-border Mexico-US automotive flows?",
        a: "Yes. USMCA-relevant lanes from Manzanillo, Lazaro Cardenas, and Veracruz into US East and West coast ports are covered, including the Tier-1 cross-border supplier base.",
      },
      {
        q: "How fresh is the data?",
        a: "Customs manifest filings flow in daily. Most automotive importers show up within 5-10 days of a new container hitting a US port, which is fast enough to react before competitors do.",
      },
    ],
    seo: {
      title: "Freight leads for automotive importers — HS 8708, 8703, 4011 | LIT",
      description:
        "Find active automotive OEMs, Tier-1 suppliers, and aftermarket parts importers — with verified decision-maker contacts, lane intel, and Pulse AI signals.",
    },
  },
  {
    slug: "apparel-and-textiles",
    industry: "Apparel & textiles",
    headline: "Freight leads for apparel & textile importers",
    subhead:
      "Search live importers of HS 6109 knit shirts, 6203 men's suits, 6204 women's suits, and 5208 woven cotton — with the right decision-makers and Pulse AI alerts on every SKU swing.",
    audienceLine:
      "Built for forwarders and 3PLs selling into fashion brands, private-label sourcing teams, and fabric distributors.",
    topShipperProfiles: [
      "Fast-fashion brand importers",
      "Department-store private-label sourcing teams",
      "Specialty outdoor & athletic apparel brands",
      "Wholesale fabric distributors",
      "Children's wear and intimate apparel importers",
      "Footwear brands sourcing alongside apparel",
    ],
    signalExamples: [
      "First-time entry of HS 6109 from Vietnam for an importer historically sourcing from China — UFLPA-driven diversification underway",
      "A 90-day spike in inbound TEU on the Chittagong–NYC lane for a private-label apparel buyer — capacity pinch likely",
      "Switch from one NVOCC to another on a steady Yantian–LA lane — re-quote window opens",
      "New entry of HS 5208 (woven cotton fabric) for a brand historically buying finished garments — vertical integration move",
      "First-time port entry through Norfolk for an importer who has always cleared through NY/NJ — gateway diversification",
    ],
    lanesHighlighted: [
      { from: "Yantian", to: "Los Angeles", cargo: "Knit and woven apparel (HS 6109, 6203, 6204)" },
      { from: "Ho Chi Minh City", to: "Los Angeles", cargo: "T-shirts, denim, sportswear (HS 6109, 6203)" },
      { from: "Chittagong", to: "New York/New Jersey", cargo: "Bangladesh knitwear, basics, private label (HS 6109, 6110)" },
      { from: "Karachi", to: "New York/New Jersey", cargo: "Cotton home textiles and basics (HS 5208, 6302)" },
    ],
    painPoints: [
      "Seasonal cycles plus chargeback exposure for late delivery make on-time performance a top-3 RFP criterion",
      "Forced-labor / UFLPA detentions on cotton-origin SKUs are reshaping sourcing toward Vietnam, Bangladesh, and Pakistan",
      "Rapid SKU turnover overwhelms manual prospecting — by the time a list is built, half the brands have shifted programs",
      "Container-cost volatility eats margin on low-AOV SKUs, so brands aggressively re-quote ocean every 90-180 days",
    ],
    hsHints: [
      { code: "6109", description: "T-shirts, singlets, tank tops (knit)" },
      { code: "6203", description: "Men's & boys' suits, ensembles, trousers" },
      { code: "6204", description: "Women's & girls' suits, ensembles, dresses" },
      { code: "6110", description: "Sweaters, pullovers, cardigans" },
      { code: "5208", description: "Woven fabrics of cotton, ≥85% cotton" },
    ],
    faq: [
      {
        q: "How does Logistic Intel surface new apparel importers?",
        a: "Manifest-level filings feed the importer index daily. You filter on HS code, origin country, port, or carrier and get back live brands and private-label buyers actively moving freight — joined to verified contacts in sourcing, supply chain, and logistics roles.",
      },
      {
        q: "Can I find brands shifting away from China after UFLPA?",
        a: "Yes. Pulse AI flags any importer adding a new origin country in HS 5208, 6109, 6203, or 6204 — the classic 'diversification' signal. You can build a saved search that surfaces every brand opening a Vietnam or Bangladesh program for the first time.",
      },
      {
        q: "Is LIT useful for fabric distributors as well as finished-garment brands?",
        a: "Yes. HS 5208-5212 (woven cotton), 5407 (woven synthetic), and 6001-6006 (knit fabrics) are first-class filters. You can also identify finished-garment brands going vertical by adding fabric HS entries to their import history.",
      },
      {
        q: "How current is the manifest data?",
        a: "Filings refresh daily. Most apparel importers show up within 5-10 days of a new container clearing US customs, which is typically enough lead time to react inside the brand's 90-day re-quote cycle.",
      },
    ],
    seo: {
      title: "Freight leads for apparel & textile importers — HS 6109, 6203, 5208 | LIT",
      description:
        "Find active apparel brands, private-label sourcing teams, and fabric distributors. Verified contacts, lane intel, Pulse AI signals on every SKU swing.",
    },
  },
  {
    slug: "consumer-electronics",
    industry: "Consumer electronics",
    headline: "Freight leads for consumer electronics importers",
    subhead:
      "Find live importers of HS 8517 phones, 8528 displays, 8471 computers, and 8504 power adapters — with the right buyers attached and Pulse AI alerts on every launch window.",
    audienceLine:
      "Built for forwarders, NVOCCs, and 3PLs selling into electronics brands, EMS contract manufacturers, and accessory wholesalers.",
    topShipperProfiles: [
      "Consumer electronics OEMs & EMS contract manufacturers",
      "Smart-home & IoT brand importers",
      "Smartphone accessory wholesalers",
      "Computer peripheral distributors",
      "LCD/LED display and component importers",
      "Charger, cable, and power-adapter brands",
    ],
    signalExamples: [
      "New origin in Vietnam for an importer who normally ships from China — Section 301 driven move",
      "A 3-month decline in inbound HS 8517 volume on a steady Yantian–LA lane — likely RFQ window before peak season",
      "First-time entry of HS 8504 from Malaysia for an importer historically buying chargers from Shenzhen",
      "Switch to a different ocean carrier alliance on a steady Shanghai–LA lane — re-quote window",
      "Sudden TEU spike 60 days before a known launch window — capacity pinch likely",
    ],
    lanesHighlighted: [
      { from: "Yantian", to: "Los Angeles", cargo: "Smartphones, accessories, consumer electronics (HS 8517, 8504)" },
      { from: "Shanghai", to: "Los Angeles", cargo: "Computers, monitors, IoT devices (HS 8471, 8528)" },
      { from: "Hong Kong", to: "Los Angeles", cargo: "Mixed electronics consolidation (HS 8517, 8471, 8528)" },
      { from: "Kaohsiung", to: "Los Angeles", cargo: "Display modules, semiconductors, peripherals (HS 9013, 8471)" },
    ],
    painPoints: [
      "Section 301 tariff exposure covers a wide HS sweep — brands are constantly evaluating origin shifts and need freight partners who can move fast",
      "Product launch windows are unforgiving — missing the pre-Black-Friday inbound window can cost a year of revenue",
      "Counterfeit and IP enforcement scrutiny at the port means customs and compliance partners get evaluated on more than just price",
      "Battery and lithium-cell rules (HS 8507) bring DG handling requirements that disqualify many forwarders",
    ],
    hsHints: [
      { code: "8517", description: "Telephones, smartphones, network equipment" },
      { code: "8528", description: "Monitors, projectors, TVs" },
      { code: "8471", description: "Computers and data processing units" },
      { code: "8504", description: "Chargers, power adapters, transformers" },
      { code: "9013", description: "LCD modules, optical devices" },
    ],
    faq: [
      {
        q: "How does Logistic Intel surface new electronics importers?",
        a: "Manifest filings refresh daily. You filter on HS code, origin country, port, or carrier and get back live electronics importers — joined to verified contacts in supply chain, sourcing, and logistics roles.",
      },
      {
        q: "Can I track Section 301 driven origin shifts?",
        a: "Yes. Pulse AI flags any importer adding a new origin country on a 8517, 8471, 8504, or 8528 HS line. The classic signal is a Shenzhen-based importer opening a Vietnam or Malaysia program — that often correlates with an open freight RFQ.",
      },
      {
        q: "Is LIT useful for EMS contract manufacturers, not just brands?",
        a: "Yes. EMS providers show up in manifest data on the consignee side. You can find every EMS receiving inbound components and target them for outbound finished-goods freight programs.",
      },
      {
        q: "How current is the data ahead of peak season?",
        a: "Filings refresh daily. Importers ramping for Q4 launches typically show first new-lane activity 90-120 days before holidays, which gives a real lead window if you're watching the right HS lines.",
      },
    ],
    seo: {
      title: "Freight leads for consumer electronics importers — HS 8517, 8471 | LIT",
      description:
        "Find active consumer electronics OEMs, EMS providers, accessory wholesalers, and computer peripheral importers with verified contacts and Pulse AI signals.",
    },
  },
  {
    slug: "furniture-and-home-goods",
    industry: "Furniture & home goods",
    headline: "Freight leads for furniture & home goods importers",
    subhead:
      "Search active importers of HS 9401 seats, 9403 furniture, 9404 mattresses, and 6304 textile furnishings — with the buyers attached and Pulse AI alerts on every lane shift.",
    audienceLine:
      "Built for forwarders and 3PLs selling into mass-market furniture importers, DTC brands, mattress companies, and home-décor wholesalers.",
    topShipperProfiles: [
      "Mass-market furniture importers",
      "E-commerce direct-to-consumer furniture brands",
      "Mattress importers & specialty bedding distributors",
      "Specialty home-décor and lighting wholesalers",
      "Outdoor and patio furniture importers",
      "Kitchen and tableware importers",
    ],
    signalExamples: [
      "New origin in Vietnam for an importer who normally ships from China — antidumping diversification underway",
      "A 3-month decline in inbound HS 9403 volume for a mass-market retailer — RFQ window likely open",
      "First-time entry of HS 9404 (mattresses) for an importer historically focused on 9401 seating — category expansion",
      "Switch to Savannah from Long Beach on a steady Shanghai inbound — gateway diversification",
      "New ocean carrier on a steady Haiphong–LA lane — re-quote window",
    ],
    lanesHighlighted: [
      { from: "Haiphong", to: "Los Angeles", cargo: "Vietnamese wood and upholstered furniture (HS 9401, 9403)" },
      { from: "Yantian", to: "Long Beach", cargo: "Mixed furniture and home-décor (HS 9401, 9403, 6304)" },
      { from: "Shanghai", to: "Savannah", cargo: "Furniture and bedding for southeast distribution (HS 9403, 9404)" },
      { from: "Jakarta", to: "Los Angeles", cargo: "Wood furniture, rattan, outdoor goods (HS 9401, 9403)" },
    ],
    painPoints: [
      "Antidumping duties on key categories — wood bedroom furniture, mattresses, quilted comforters — change the math on origin selection",
      "Container-cost volatility hits margin directly on low-density, high-cube SKUs",
      "High SKU count vs. lane consolidation: brands want fewer ocean partners, which means RFQs are larger and stakes are higher",
      "Last-mile and white-glove integration is increasingly part of the freight buy, raising the bar on what 'forwarder' means",
    ],
    hsHints: [
      { code: "9401", description: "Seats (chairs, sofas, etc.)" },
      { code: "9403", description: "Other furniture (cabinets, tables, beds)" },
      { code: "9404", description: "Mattresses, bedding, pillows" },
      { code: "6304", description: "Other textile furnishing articles" },
      { code: "7013", description: "Glassware (table, kitchen, decoration)" },
    ],
    faq: [
      {
        q: "How does Logistic Intel surface new furniture importers?",
        a: "Manifest filings flow in daily. You filter on HS 9401-9404 plus origin, port, or carrier and get back active furniture and home-goods importers — joined to verified buyer-side contacts in supply chain, sourcing, and logistics roles.",
      },
      {
        q: "Can I see brands shifting away from China after antidumping orders?",
        a: "Yes. Pulse AI flags any importer adding a new origin country on a 9401, 9403, or 9404 HS line. China-to-Vietnam and China-to-Indonesia diversification on furniture is one of the most reliable signals in the dataset.",
      },
      {
        q: "Is LIT useful for DTC brands as well as mass-market importers?",
        a: "Yes. DTC furniture brands typically show smaller but higher-frequency container patterns. You can identify them by HS profile plus container cadence, and the contact data tilts toward heads of operations and supply chain at growth-stage e-commerce companies.",
      },
      {
        q: "How fresh is the data going into peak holiday season?",
        a: "Filings refresh daily. Furniture importers tend to ramp inbound 90-150 days ahead of holiday and seasonal sets, which gives a real prospecting lead window if you're watching the right HS and lane combinations.",
      },
    ],
    seo: {
      title: "Freight leads for furniture & home goods importers — HS 9401, 9403, 9404 | LIT",
      description:
        "Find active furniture, mattress, and home-décor importers with verified buyer contacts, lane intel, and Pulse AI signals on every antidumping-driven origin shift.",
    },
  },
  {
    slug: "food-and-beverage",
    industry: "Food & beverage",
    headline: "Freight leads for food & beverage importers",
    subhead:
      "Find live importers of HS 0901 coffee, 1604 prepared seafood, 2204 wine, 2009 juices, and 0805 citrus — with the right buyers attached and Pulse AI alerts on every program shift.",
    audienceLine:
      "Built for forwarders, NVOCCs, and reefer-capable 3PLs selling into specialty food importers, wine and spirits distributors, and grocery private-label brands.",
    topShipperProfiles: [
      "Specialty food importers",
      "Wine & spirits distributors",
      "Frozen seafood importers",
      "Grocery private-label brands",
      "Coffee roasters and green-coffee importers",
      "Produce and citrus importers",
    ],
    signalExamples: [
      "New origin in Colombia for a coffee importer historically sourcing from Brazil — program shift in progress",
      "A 3-month decline in inbound HS 1604 (prepared seafood) for an importer — likely RFQ window before peak demand",
      "First-time entry of HS 2204 (wine) from Argentina for an importer historically focused on European wine",
      "Switch from one reefer carrier to another on a steady Santos–Houston lane — re-quote window",
      "New entry through Port of Wilmington for an importer who has always cleared through New York/New Jersey",
    ],
    lanesHighlighted: [
      { from: "Santos", to: "Houston", cargo: "Brazilian coffee, fruit juice, sugar (HS 0901, 2009, 1701)" },
      { from: "Antwerp", to: "New York/New Jersey", cargo: "European wine, spirits, specialty food (HS 2204, 2208)" },
      { from: "Bangkok", to: "Los Angeles", cargo: "Frozen seafood, prepared meals, sauces (HS 1604, 2103)" },
      { from: "Buenos Aires", to: "Houston", cargo: "Argentine beef, wine, produce (HS 0202, 2204)" },
    ],
    painPoints: [
      "FDA FSVP and Prior Notice compliance applies to every entry — importers reward freight partners who keep them out of FDA hold",
      "Cold-chain temperature integrity plus reefer capacity tightness in peak seasons drives premium spend",
      "Country-of-origin labeling enforcement and tariff-rate quota management mean documentation accuracy is non-negotiable",
      "Long lead times on shelf placement at major grocers force importers to lock ocean capacity 6-9 months out",
    ],
    hsHints: [
      { code: "0901", description: "Coffee (green and roasted)" },
      { code: "1604", description: "Prepared or preserved fish, caviar" },
      { code: "2204", description: "Wine of fresh grapes" },
      { code: "2009", description: "Fruit and vegetable juices" },
      { code: "0805", description: "Citrus fruit, fresh or dried" },
    ],
    faq: [
      {
        q: "How does Logistic Intel surface new food & beverage importers?",
        a: "Manifest filings refresh daily. You filter on HS code, origin, port, or carrier and get back live food and beverage importers — joined to verified buyer-side contacts in supply chain, procurement, and logistics roles.",
      },
      {
        q: "Can I filter for reefer-only or DG-only importers?",
        a: "Yes. HS codes for refrigerated and frozen categories (e.g. 0202 beef, 0303 fish, 0805 citrus, 1604 prepared seafood) are first-class filters. You can build saved searches that surface only reefer-relevant importers for your capacity offering.",
      },
      {
        q: "Is LIT useful for both wine/spirits and shelf-stable specialty food?",
        a: "Yes. Wine and spirits import patterns (HS 2204, 2208) tend to be seasonal and brand-driven; shelf-stable specialty food (HS 2008, 2103, etc.) is more program-driven with grocery private-label cycles. The dataset covers both, and contact data is segmented by buyer role.",
      },
      {
        q: "How does FDA FSVP compliance show up in the data?",
        a: "Importers under FDA FSVP have known patterns — established origin programs, consistent carriers, and predictable port usage. Pulse AI flags deviations (a new origin, a first-time HS, an unexpected port) that often correlate with program changes a reefer-capable forwarder can pitch into.",
      },
    ],
    seo: {
      title: "Freight leads for food & beverage importers — HS 0901, 2204, 1604 | LIT",
      description:
        "Find active coffee, wine, seafood, and specialty food importers with verified buyer contacts, reefer lane intel, and Pulse AI signals on every program shift.",
    },
  },
  {
    slug: "industrial-machinery",
    industry: "Industrial machinery",
    headline: "Freight leads for industrial machinery importers",
    subhead:
      "Search live importers of HS 8479 special-function machinery, 8429 construction equipment, 8413 pumps, and 8414 compressors — with engineering and procurement buyers attached.",
    audienceLine:
      "Built for forwarders and project-cargo 3PLs selling into industrial OEMs, construction distributors, and automation integrators.",
    topShipperProfiles: [
      "Industrial OEMs importing components",
      "Construction-equipment distributors",
      "Process-control & automation integrators",
      "MRO and replacement-parts importers",
      "Pump, compressor, and HVAC equipment importers",
      "Heavy-machinery and crane importers",
    ],
    signalExamples: [
      "New entry of HS 8479 from Germany for an importer historically focused on Chinese-origin machinery",
      "A 6-month gap in inbound HS 8413 (pumps) for an industrial OEM — replenishment cycle imminent",
      "First-time entry through Charleston for an importer who has always cleared through Houston — gateway diversification",
      "New ocean carrier on a steady Hamburg–Charleston lane — re-quote window",
      "Sudden TEU spike on Section 232 machinery derivatives — tariff-engineering re-route in progress",
    ],
    lanesHighlighted: [
      { from: "Hamburg", to: "Charleston", cargo: "German precision machinery, automation, controls (HS 8479, 8537)" },
      { from: "Rotterdam", to: "Houston", cargo: "Industrial pumps, compressors, energy equipment (HS 8413, 8414)" },
      { from: "Shanghai", to: "Long Beach", cargo: "Construction equipment and machinery parts (HS 8429, 8479)" },
      { from: "Busan", to: "Los Angeles", cargo: "Korean industrial machinery and control boards (HS 8479, 8537)" },
    ],
    painPoints: [
      "Section 232 metals derivative scope creep into machinery components is rewriting tariff math mid-program",
      "Heavy and oversize cargo requires specialized handling, breakbulk capability, and project-cargo expertise — disqualifies most generalist forwarders",
      "Long sales-cycle B2B means high-touch outreach quality matters far more than volume — bad prospecting burns reps",
      "Aftermarket and MRO replacement-parts demand is hard to forecast — Pulse AI signals on inbound replenishment cadence are unusually valuable",
    ],
    hsHints: [
      { code: "8479", description: "Special-function machinery and mechanical appliances" },
      { code: "8429", description: "Self-propelled construction machinery (bulldozers, excavators)" },
      { code: "8413", description: "Pumps for liquids" },
      { code: "8414", description: "Air or vacuum pumps, compressors" },
      { code: "8537", description: "Electrical control and distribution boards" },
    ],
    faq: [
      {
        q: "How does Logistic Intel surface new industrial machinery importers?",
        a: "Manifest filings flow in daily. You filter on HS code, origin country, port, or carrier and get back live industrial OEMs, distributors, and MRO importers — joined to verified contacts in engineering, procurement, and supply chain roles.",
      },
      {
        q: "Is LIT useful for project-cargo and breakbulk forwarders, not just FCL?",
        a: "Yes. HS 8429 (construction equipment), 8430 (boring and earthmoving), and 8474 (mineral-processing machinery) frequently move as breakbulk or oversize FCL. You can filter to those HS lines and target importers who consistently need specialized handling.",
      },
      {
        q: "Can I track Section 232 tariff-driven sourcing shifts?",
        a: "Yes. Pulse AI flags any importer of HS 8479 or 8537 adding a new origin country, switching carriers, or shifting ports — all of which correlate with tariff-engineering decisions you can prospect into.",
      },
      {
        q: "How current is the data on long-cycle machinery programs?",
        a: "Filings refresh daily. Machinery programs are slower-moving than CPG, so signal value compounds — a 6-month inbound gap on HS 8413 is usually a strong RFQ predictor, and the data surfaces it without manual tracking.",
      },
    ],
    seo: {
      title: "Freight leads for industrial machinery importers — HS 8479, 8429, 8413 | LIT",
      description:
        "Find active industrial OEMs, construction equipment distributors, and automation integrators with verified engineering and procurement contacts.",
    },
  },
];

export function getIndustry(slug: string): FreightLeadsIndustry | undefined {
  return INDUSTRIES.find((i) => i.slug === slug);
}
