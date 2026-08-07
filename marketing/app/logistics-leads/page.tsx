import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { BofuMoneyPage } from "@/components/lead-magnet/BofuMoneyPage";
import { getBofuPage } from "@/app/_bofu/data";

const page = getBofuPage("logistics-leads");

export const metadata: Metadata = buildMetadata({
  title: page.metaTitle,
  description: page.metaDescription,
  path: "/logistics-leads",
});

export default function LogisticsLeadsPage() {
  return <BofuMoneyPage page={page} />;
}
