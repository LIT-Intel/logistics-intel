import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { BofuMoneyPage } from "@/components/lead-magnet/BofuMoneyPage";
import { getBofuPage } from "@/app/_bofu/data";

const page = getBofuPage("freight-forwarding-leads");

export const metadata: Metadata = buildMetadata({
  title: page.metaTitle,
  description: page.metaDescription,
  path: "/freight-forwarding-leads",
});

export default function FreightForwardingLeadsPage() {
  return <BofuMoneyPage page={page} />;
}
