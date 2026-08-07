import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { BofuMoneyPage } from "@/components/lead-magnet/BofuMoneyPage";
import { getBofuPage } from "@/app/_bofu/data";

const page = getBofuPage("3pl-leads");

export const metadata: Metadata = buildMetadata({
  title: page.metaTitle,
  description: page.metaDescription,
  path: "/3pl-leads",
});

export default function ThreePlLeadsPage() {
  return <BofuMoneyPage page={page} />;
}
