import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { BofuMoneyPage } from "@/components/lead-magnet/BofuMoneyPage";
import { getBofuPage } from "@/app/_bofu/data";

const page = getBofuPage("direct-shipper-leads");

export const metadata: Metadata = buildMetadata({
  title: page.metaTitle,
  description: page.metaDescription,
  path: "/direct-shipper-leads",
});

export default function DirectShipperLeadsPage() {
  return <BofuMoneyPage page={page} />;
}
