import type { IyShipperHit, IyCompanyProfile, IyRouteKpis, IyTimeSeriesPoint } from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";

export const SAMPLE_COMPANIES = {
  apple: {
    key: "company/apple-inc",
    companyId: "company/apple-inc",
    companyKey: "company/apple-inc",
    name: "Apple Inc.",
    title: "Apple Inc.",
    normalizedName: "apple inc",
    domain: "apple.com",
    website: "https://www.apple.com",
    phone: "+1-408-996-1010",
    address: "One Apple Park Way",
    city: "Cupertino",
    state: "CA",
    postalCode: "95014",
    country: "United States",
    countryCode: "US",
    totalShipments: 45240,
    shipmentsLast12m: 45240,
    teusLast12m: 28650,
    estSpendLast12m: 125000000,
    mostRecentShipment: "2024-01-10",
    lastShipmentDate: "2024-01-10",
    primaryRouteSummary: "Shenzhen, CN → Los Angeles, CA",
    primaryRoute: "Shenzhen, CN → Los Angeles, CA",
    topSuppliers: ["Foxconn Technology", "Pegatron Corporation", "Wistron Corporation"],
  },
  walmart: {
    key: "company/walmart-inc",
    companyId: "company/walmart-inc",
    companyKey: "company/walmart-inc",
    name: "Walmart Inc.",
    title: "Walmart Inc.",
    normalizedName: "walmart inc",
    domain: "walmart.com",
    website: "https://www.walmart.com",
    phone: "+1-479-273-4000",
    address: "702 Southwest 8th Street",
    city: "Bentonville",
    state: "AR",
    postalCode: "72716",
    country: "United States",
    countryCode: "US",
    totalShipments: 124850,
    shipmentsLast12m: 124850,
    teusLast12m: 89200,
    estSpendLast12m: 385000000,
    mostRecentShipment: "2024-01-12",
    lastShipmentDate: "2024-01-12",
    primaryRouteSummary: "Ningbo, CN → Long Beach, CA",
    primaryRoute: "Ningbo, CN → Long Beach, CA",
    topSuppliers: ["Yihai Kerry Investments", "Procter & Gamble", "Unilever"],
  },
  costco: {
    key: "company/costco-wholesale",
    companyId: "company/costco-wholesale",
    companyKey: "company/costco-wholesale",
    name: "Costco Wholesale Corporation",
    title: "Costco Wholesale Corporation",
    normalizedName: "costco wholesale corporation",
    domain: "costco.com",
    website: "https://www.costco.com",
    phone: "+1-425-313-8100",
    address: "999 Lake Drive",
    city: "Issaquah",
    state: "WA",
    postalCode: "98027",
    country: "United States",
    countryCode: "US",
    totalShipments: 68420,
    shipmentsLast12m: 68420,
    teusLast12m: 52300,
    estSpendLast12m: 215000000,
    mostRecentShipment: "2024-01-11",
    lastShipmentDate: "2024-01-11",
    primaryRouteSummary: "Shanghai, CN → Seattle, WA",
    primaryRoute: "Shanghai, CN → Seattle, WA",
    topSuppliers: ["Kirkland Signature Suppliers", "Georgia-Pacific", "Nestle"],
  },
  tesla: {
    key: "company/tesla-inc",
    companyId: "company/tesla-inc",
    companyKey: "company/tesla-inc",
    name: "Tesla, Inc.",
    title: "Tesla, Inc.",
    normalizedName: "tesla inc",
    domain: "tesla.com",
    website: "https://www.tesla.com",
    phone: "+1-512-516-8177",
    address: "1 Tesla Road",
    city: "Austin",
    state: "TX",
    postalCode: "78725",
    country: "United States",
    countryCode: "US",
    totalShipments: 28940,
    shipmentsLast12m: 28940,
    teusLast12m: 18500,
    estSpendLast12m: 92000000,
    mostRecentShipment: "2024-01-09",
    lastShipmentDate: "2024-01-09",
    primaryRouteSummary: "Shanghai, CN → San Francisco, CA",
    primaryRoute: "Shanghai, CN → San Francisco, CA",
    topSuppliers: ["CATL", "Panasonic", "LG Energy Solution"],
  },
  amazon: {
    key: "company/amazon-com",
    companyId: "company/amazon-com",
    companyKey: "company/amazon-com",
    name: "Amazon.com, Inc.",
    title: "Amazon.com, Inc.",
    normalizedName: "amazon com inc",
    domain: "amazon.com",
    website: "https://www.amazon.com",
    phone: "+1-206-266-1000",
    address: "410 Terry Avenue North",
    city: "Seattle",
    state: "WA",
    postalCode: "98109",
    country: "United States",
    countryCode: "US",
    totalShipments: 258600,
    shipmentsLast12m: 258600,
    teusLast12m: 165400,
    estSpendLast12m: 680000000,
    mostRecentShipment: "2024-01-13",
    lastShipmentDate: "2024-01-13",
    primaryRouteSummary: "Shenzhen, CN → Los Angeles, CA",
    primaryRoute: "Shenzhen, CN → Los Angeles, CA",
    topSuppliers: ["Multiple suppliers", "Cross-border e-commerce vendors", "FBA sellers"],
  },
} as const;

const generateTimeSeries = (baseVolume: number, growth: boolean = false): IyTimeSeriesPoint[] => {
  const months = [
    "2023-02", "2023-03", "2023-04", "2023-05", "2023-06",
    "2023-07", "2023-08", "2023-09", "2023-10", "2023-11",
    "2023-12", "2024-01"
  ];

  return months.map((month, idx) => {
    const monthlyBase = baseVolume / 12;
    const seasonal = Math.sin((idx / 12) * Math.PI * 2) * 0.15;
    const trend = growth ? (idx / 12) * 0.2 : 0;
    const multiplier = 1 + seasonal + trend;

    const total = Math.round(monthlyBase * multiplier);
    const fclRatio = 0.7 + Math.random() * 0.2;

    return {
      month,
      fclShipments: Math.round(total * fclRatio),
      lclShipments: Math.round(total * (1 - fclRatio)),
    };
  });
};

export const SAMPLE_PROFILES: Record<string, IyCompanyProfile> = {
  "company/apple-inc": {
    ...SAMPLE_COMPANIES.apple,
    phoneNumber: SAMPLE_COMPANIES.apple.phone,
    routeKpis: {
      shipmentsLast12m: 45240,
      teuLast12m: 28650,
      estSpendUsd12m: 125000000,
      topRouteLast12m: "Shenzhen, CN → Los Angeles, CA",
      mostRecentRoute: "Shenzhen, CN → Los Angeles, CA",
      sampleSize: 45240,
      topRoutesLast12m: [
        { route: "Shenzhen, CN → Los Angeles, CA", shipments: 18500, teu: 12000, fclShipments: 15200, lclShipments: 3300 },
        { route: "Shanghai, CN → San Francisco, CA", shipments: 12800, teu: 8200, fclShipments: 10500, lclShipments: 2300 },
        { route: "Taipei, TW → Seattle, WA", shipments: 8400, teu: 5100, fclShipments: 6800, lclShipments: 1600 },
        { route: "Seoul, KR → Oakland, CA", shipments: 5540, teu: 3350, fclShipments: 4500, lclShipments: 1040 },
      ],
    },
    timeSeries: generateTimeSeries(45240, true),
    containers: {
      fclShipments12m: 37200,
      lclShipments12m: 8040,
    },
  },
  "company/walmart-inc": {
    ...SAMPLE_COMPANIES.walmart,
    phoneNumber: SAMPLE_COMPANIES.walmart.phone,
    routeKpis: {
      shipmentsLast12m: 124850,
      teuLast12m: 89200,
      estSpendUsd12m: 385000000,
      topRouteLast12m: "Ningbo, CN → Long Beach, CA",
      mostRecentRoute: "Ningbo, CN → Long Beach, CA",
      sampleSize: 124850,
      topRoutesLast12m: [
        { route: "Ningbo, CN → Long Beach, CA", shipments: 42500, teu: 32000, fclShipments: 38000, lclShipments: 4500 },
        { route: "Shenzhen, CN → Los Angeles, CA", shipments: 38200, teu: 28500, fclShipments: 34000, lclShipments: 4200 },
        { route: "Shanghai, CN → Savannah, GA", shipments: 24600, teu: 17200, fclShipments: 21500, lclShipments: 3100 },
        { route: "Yantian, CN → Norfolk, VA", shipments: 19550, teu: 11500, fclShipments: 17000, lclShipments: 2550 },
      ],
    },
    timeSeries: generateTimeSeries(124850, false),
    containers: {
      fclShipments12m: 110500,
      lclShipments12m: 14350,
    },
  },
  "company/costco-wholesale": {
    ...SAMPLE_COMPANIES.costco,
    phoneNumber: SAMPLE_COMPANIES.costco.phone,
    routeKpis: {
      shipmentsLast12m: 68420,
      teuLast12m: 52300,
      estSpendUsd12m: 215000000,
      topRouteLast12m: "Shanghai, CN → Seattle, WA",
      mostRecentRoute: "Shanghai, CN → Seattle, WA",
      sampleSize: 68420,
      topRoutesLast12m: [
        { route: "Shanghai, CN → Seattle, WA", shipments: 28600, teu: 22400, fclShipments: 26000, lclShipments: 2600 },
        { route: "Busan, KR → Tacoma, WA", shipments: 18200, teu: 13800, fclShipments: 16500, lclShipments: 1700 },
        { route: "Tokyo, JP → Oakland, CA", shipments: 12800, teu: 9600, fclShipments: 11500, lclShipments: 1300 },
        { route: "Ningbo, CN → Long Beach, CA", shipments: 8820, teu: 6500, fclShipments: 8000, lclShipments: 820 },
      ],
    },
    timeSeries: generateTimeSeries(68420, false),
    containers: {
      fclShipments12m: 62000,
      lclShipments12m: 6420,
    },
  },
  "company/tesla-inc": {
    ...SAMPLE_COMPANIES.tesla,
    phoneNumber: SAMPLE_COMPANIES.tesla.phone,
    routeKpis: {
      shipmentsLast12m: 28940,
      teuLast12m: 18500,
      estSpendUsd12m: 92000000,
      topRouteLast12m: "Shanghai, CN → San Francisco, CA",
      mostRecentRoute: "Shanghai, CN → San Francisco, CA",
      sampleSize: 28940,
      topRoutesLast12m: [
        { route: "Shanghai, CN → San Francisco, CA", shipments: 14800, teu: 9500, fclShipments: 13200, lclShipments: 1600 },
        { route: "Fremont, CA → Rotterdam, NL", shipments: 7200, teu: 4800, fclShipments: 6500, lclShipments: 700 },
        { route: "Berlin, DE → Newark, NJ", shipments: 4140, teu: 2600, fclShipments: 3700, lclShipments: 440 },
        { route: "Tokyo, JP → Long Beach, CA", shipments: 2800, teu: 1600, fclShipments: 2500, lclShipments: 300 },
      ],
    },
    timeSeries: generateTimeSeries(28940, true),
    containers: {
      fclShipments12m: 25900,
      lclShipments12m: 3040,
    },
  },
  "company/amazon-com": {
    ...SAMPLE_COMPANIES.amazon,
    phoneNumber: SAMPLE_COMPANIES.amazon.phone,
    routeKpis: {
      shipmentsLast12m: 258600,
      teuLast12m: 165400,
      estSpendUsd12m: 680000000,
      topRouteLast12m: "Shenzhen, CN → Los Angeles, CA",
      mostRecentRoute: "Shenzhen, CN → Los Angeles, CA",
      sampleSize: 258600,
      topRoutesLast12m: [
        { route: "Shenzhen, CN → Los Angeles, CA", shipments: 82400, teu: 54000, fclShipments: 72000, lclShipments: 10400 },
        { route: "Shanghai, CN → Seattle, WA", shipments: 68200, teu: 44200, fclShipments: 59500, lclShipments: 8700 },
        { route: "Ningbo, CN → Long Beach, CA", shipments: 54800, teu: 35600, fclShipments: 48000, lclShipments: 6800 },
        { route: "Yantian, CN → Oakland, CA", shipments: 53200, teu: 31600, fclShipments: 46500, lclShipments: 6700 },
      ],
    },
    timeSeries: generateTimeSeries(258600, false),
    containers: {
      fclShipments12m: 226000,
      lclShipments12m: 32600,
    },
  },
};

export const SAMPLE_ENRICHMENTS: Record<string, any> = {
  "company/apple-inc": {
    opportunities: [
      "Premium pricing tolerance allows for value-add services and specialized handling",
      "Consistent FCL volumes provide opportunities for contract rates and volume discounts",
      "High-value electronics require specialized climate control and security services",
      "Just-in-time delivery requirements create opportunities for expedited shipping services",
      "Growing India manufacturing footprint may create new Asia-US lanes",
    ],
    risks: [
      "Zero tolerance for delays - service failures could result in contract loss",
      "Stringent security and compliance requirements increase operational complexity",
      "High visibility means service issues become public relations problems",
    ],
    talkingPoints: [
      "Emphasize dedicated security protocols and real-time visibility tools",
      "Highlight experience handling high-value, time-sensitive electronics",
      "Demonstrate white-glove service capabilities and premium support",
      "Showcase compliance expertise with international trade regulations",
    ],
    focus: "Electronics, consumer devices, specialized components requiring premium logistics",
  },
  "company/walmart-inc": {
    opportunities: [
      "Massive volume creates opportunities for dedicated equipment and priority allocation",
      "Multi-lane diversification provides cross-selling opportunities across trade corridors",
      "Mixed container loads allow for consolidation services and LCL optimization",
      "Predictable seasonal patterns enable proactive capacity planning",
      "Growing e-commerce business creates opportunities for faster transit times",
    ],
    risks: [
      "Highly price-sensitive with rigorous rate benchmarking and RFP processes",
      "Established relationships with major carriers create high switching costs",
      "Service level agreements are strictly monitored with financial penalties",
    ],
    talkingPoints: [
      "Focus on total cost of ownership, not just base freight rates",
      "Demonstrate proven track record with retail industry clients",
      "Highlight flexibility to scale capacity during peak retail seasons",
      "Showcase technology integration capabilities (EDI, API, visibility platforms)",
    ],
    focus: "Retail goods, consumer products, seasonal merchandise, mixed container loads",
  },
  "company/costco-wholesale": {
    opportunities: [
      "Predictable shipping schedules create opportunities for contract rates and regular bookings",
      "Strong negotiation position means professional, relationship-driven approach is valued",
      "Focus on bulk/palletized goods matches well with full container optimization",
      "Private label Kirkland brand provides direct sourcing opportunities",
      "Limited SKU count simplifies handling and reduces operational complexity",
    ],
    risks: [
      "Sophisticated logistics team conducts thorough carrier performance reviews",
      "Rate expectations are informed by deep market knowledge and benchmarking",
      "Service consistency is critical - single delays can impact store-level operations",
    ],
    talkingPoints: [
      "Emphasize consistency and reliability over lowest pricing",
      "Demonstrate understanding of warehouse club distribution models",
      "Highlight container optimization and palletized cargo expertise",
      "Showcase partnership approach with long-term rate stability",
    ],
    focus: "Wholesale goods, private label products, bulk commodities, palletized shipments",
  },
  "company/tesla-inc": {
    opportunities: [
      "Rapidly growing shipment volumes as manufacturing scales globally",
      "Specialized handling requirements for batteries and automotive parts create value-add opportunities",
      "Bi-directional trade (US exports, China imports) provides backhaul optimization",
      "Direct relationships with manufacturers enable end-to-end supply chain solutions",
      "Innovation-focused culture values technology and digital capabilities",
    ],
    risks: [
      "Production volatility creates unpredictable shipping volumes and timing",
      "Hazardous materials (batteries) require specialized compliance and handling",
      "High expectations for service innovation and continuous improvement",
    ],
    talkingPoints: [
      "Emphasize experience with automotive and battery logistics",
      "Highlight technology platforms and digital capabilities",
      "Demonstrate flexibility to handle volume fluctuations and expedited shipments",
      "Showcase dangerous goods compliance and specialized equipment",
    ],
    focus: "Electric vehicle components, battery packs, automotive parts, specialized machinery",
  },
  "company/amazon-com": {
    opportunities: [
      "Highest volume shipper provides maximum opportunities for dedicated capacity",
      "Multi-carrier strategy means openness to new provider relationships",
      "Strong rate leverage creates competitive marketplace environment",
      "Growing international expansion provides opportunities in emerging trade lanes",
      "Innovation in logistics (Amazon Freight) creates partnership opportunities",
    ],
    risks: [
      "Extremely competitive environment with constant rate pressure",
      "Service level requirements are exceptionally demanding across all KPIs",
      "Large scale means small percentage failures can be significant volumes",
      "In-house logistics capabilities (Amazon Freight) creates competitive dynamic",
    ],
    talkingPoints: [
      "Lead with technology integration and API capabilities",
      "Demonstrate proven ability to handle high-volume, time-sensitive operations",
      "Highlight network coverage and capacity across multiple trade lanes",
      "Showcase performance analytics and continuous improvement culture",
    ],
    focus: "E-commerce goods, diverse product mix, fast-moving consumer goods, cross-border shipments",
  },
};

export function getSampleShipperHits(): IyShipperHit[] {
  return [
    SAMPLE_COMPANIES.apple,
    SAMPLE_COMPANIES.walmart,
    SAMPLE_COMPANIES.costco,
    SAMPLE_COMPANIES.tesla,
    SAMPLE_COMPANIES.amazon,
  ];
}

export function getSampleCommandCenterRecords(): CommandCenterRecord[] {
  return [
    {
      company: {
        company_id: "company/apple-inc",
        name: "Apple Inc.",
        source: "importyeti",
        address: "One Apple Park Way, Cupertino, CA 95014",
        country_code: "US",
        kpis: {
          shipments_12m: 45240,
          last_activity: "2024-01-10",
        },
        extras: {
          top_suppliers: ["Foxconn Technology", "Pegatron Corporation", "Wistron Corporation"],
        },
      },
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      company: {
        company_id: "company/walmart-inc",
        name: "Walmart Inc.",
        source: "importyeti",
        address: "702 Southwest 8th Street, Bentonville, AR 72716",
        country_code: "US",
        kpis: {
          shipments_12m: 124850,
          last_activity: "2024-01-12",
        },
        extras: {
          top_suppliers: ["Yihai Kerry Investments", "Procter & Gamble", "Unilever"],
        },
      },
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      company: {
        company_id: "company/costco-wholesale",
        name: "Costco Wholesale Corporation",
        source: "importyeti",
        address: "999 Lake Drive, Issaquah, WA 98027",
        country_code: "US",
        kpis: {
          shipments_12m: 68420,
          last_activity: "2024-01-11",
        },
        extras: {
          top_suppliers: ["Kirkland Signature Suppliers", "Georgia-Pacific", "Nestle"],
        },
      },
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      company: {
        company_id: "company/tesla-inc",
        name: "Tesla, Inc.",
        source: "importyeti",
        address: "1 Tesla Road, Austin, TX 78725",
        country_code: "US",
        kpis: {
          shipments_12m: 28940,
          last_activity: "2024-01-09",
        },
        extras: {
          top_suppliers: ["CATL", "Panasonic", "LG Energy Solution"],
        },
      },
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      company: {
        company_id: "company/amazon-com",
        name: "Amazon.com, Inc.",
        source: "importyeti",
        address: "410 Terry Avenue North, Seattle, WA 98109",
        country_code: "US",
        kpis: {
          shipments_12m: 258600,
          last_activity: "2024-01-13",
        },
        extras: {
          top_suppliers: ["Multiple suppliers", "Cross-border e-commerce vendors", "FBA sellers"],
        },
      },
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

export function isSampleCompany(companyKey: string | null | undefined): boolean {
  if (!companyKey) return false;
  const sampleKeys = Object.keys(SAMPLE_PROFILES);
  return sampleKeys.includes(companyKey);
}

export function getSampleProfile(companyKey: string): IyCompanyProfile | null {
  return SAMPLE_PROFILES[companyKey] || null;
}

export function getSampleRouteKpis(companyKey: string): IyRouteKpis | null {
  const profile = SAMPLE_PROFILES[companyKey];
  return profile?.routeKpis || null;
}

export function getSampleEnrichment(companyKey: string): any {
  return SAMPLE_ENRICHMENTS[companyKey] || null;
}
