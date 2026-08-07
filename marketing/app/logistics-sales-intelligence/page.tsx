import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { BofuMoneyPage } from "@/components/lead-magnet/BofuMoneyPage";
import { getBofuPage } from "@/app/_bofu/data";

const page = getBofuPage("logistics-sales-intelligence");

export const metadata: Metadata = buildMetadata({
  title: page.metaTitle,
  description: page.metaDescription,
  path: "/logistics-sales-intelligence",
});

export default function LogisticsSalesIntelligencePage() {
  return <BofuMoneyPage page={page} />;
}
