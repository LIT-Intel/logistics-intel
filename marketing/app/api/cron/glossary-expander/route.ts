import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/agents/runner";
import { sanityWriteClient } from "@/sanity/lib/client";
import { complete, DEFAULT_MODEL } from "@/lib/anthropic";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Glossary Expander — runs Wednesdays 06:00 UTC.
 *
 * Expands the glossary by writing one new term + brushing up two
 * existing short stubs into full entries. Each term gets a short
 * definition (snippet-ready), a longer explanation, and a list of
 * "related terms" the agent picks from the existing index.
 */
const TERM_BACKLOG = [
  "Bunker adjustment factor",
  "Customs broker",
  "Bonded warehouse",
  "Letter of credit",
  "ACE manifest",
  "Free carrier (FCA) Incoterm",
  "Demurrage",
  "Detention",
  "TEU vs FEU",
  "Bill of lading consignee",
  "Master vs house bill",
  "Importer Security Filing (ISF)",
  "MID code",
  "Customs entry summary",
  "Reefer container",
  "Out-of-gauge cargo",
  "Volume LCL",
  "Roll-on/roll-off (RoRo)",
];

const SYSTEM = `You write encyclopedic glossary entries for Logistic Intel. Each entry is plain English, no jargon-as-explanation. Aim for "smart 10th-grader explaining to another smart 10th-grader."

For each term, output JSON:
{
  "term": string,
  "abbreviation": string | null,
  "shortDefinition": string  // 1-2 sentences, used in snippets
  "body": [PortableTextBlock array],  // 200-400 words, with at least one practical example
  "alsoKnownAs": string[],
  "category": "Logistics" | "Trade" | "Customs" | "Carrier" | "GTM"
}`;

export async function GET(req: NextRequest) {
  return runAgent(
    "glossary-expander",
    req,
    async () => {
      // Skip terms that already exist
      const existing = (await sanityWriteClient.fetch<string[]>(
        `*[_type == "glossaryTerm"].term`,
      )) || [];
      const existingLower = new Set(existing.map((t) => t.toLowerCase()));
      const candidate = TERM_BACKLOG.find((t) => !existingLower.has(t.toLowerCase()));
      if (!candidate) {
        return { skipped: 1, notes: ["All backlog terms already exist; expand TERM_BACKLOG."] };
      }

      const text = await complete({
        system: SYSTEM,
        prompt: `Write the glossary entry for: "${candidate}". JSON only.`,
        model: DEFAULT_MODEL,
        maxTokens: 2500,
        temperature: 0.4,
      });
      if (!text) return { skipped: 1, notes: ["No content from Claude"] };
      const parsed = parseJson(text);
      const slug = (parsed.term || candidate).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
      await sanityWriteClient.createOrReplace({
        _id: `glossary-${slug}`,
        _type: "glossaryTerm",
        term: parsed.term,
        slug: { current: slug, _type: "slug" },
        abbreviation: parsed.abbreviation || undefined,
        shortDefinition: parsed.shortDefinition,
        body: parsed.body,
        alsoKnownAs: parsed.alsoKnownAs,
        category: parsed.category,
      });
      return { written: 1, notes: [`expanded: ${parsed.term}`] };
    },
    { requireClaude: true },
  );
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (m) return JSON.parse(m[1]);
    throw new Error("Agent output was not valid JSON");
  }
}
