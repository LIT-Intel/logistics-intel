// PopularShippers — 8-tile grid below the search bar on /app/search.
//
// Hardcoded list of well-known shippers in lit_company_index.
// company_ids were resolved at plan-writing time against the actual
// table (see plan doc for the resolution). Click any tile → navigate
// to that company's profile.
//
// Hidden on results state — parent passes showGrid=false once a
// search has been submitted.

import { useNavigate } from "react-router-dom";
import {
  Car,
  ShoppingCart,
  ShoppingBag,
  Package,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

type Shipper = {
  id: string;            // lit_company_index.company_id
  displayName: string;   // clean brand name for the tile
  industry: string;
  Icon: LucideIcon;
};

// Eight shippers resolved against lit_company_index (volume rank desc
// within each name match). Industries are hardcoded since
// lit_company_index doesn't carry an industry column.
const POPULAR_SHIPPERS: Shipper[] = [
  { id: "samsung-electronics-america", displayName: "Samsung",  industry: "Electronics", Icon: Smartphone },
  { id: "amazon-logistics",            displayName: "Amazon",   industry: "E-commerce",  Icon: Package },
  { id: "costco-wholesale-canada",     displayName: "Costco",   industry: "Retail",      Icon: ShoppingCart },
  { id: "adidas-international-trade",  displayName: "Adidas",   industry: "Apparel",     Icon: ShoppingBag },
  { id: "nike-usa",                    displayName: "Nike",     industry: "Apparel",     Icon: ShoppingBag },
  { id: "walmart-601-n-walton-blvd",   displayName: "Walmart",  industry: "Retail",      Icon: ShoppingCart },
  { id: "ford-motor",                  displayName: "Ford",     industry: "Automotive",  Icon: Car },
  { id: "bmw-of-north-america",        displayName: "BMW",      industry: "Automotive",  Icon: Car },
];

type Props = {
  showGrid: boolean;
};

export default function PopularShippers({ showGrid }: Props) {
  const navigate = useNavigate();
  if (!showGrid) return null;
  return (
    <div className="mx-auto mt-12 max-w-3xl px-4">
      <div className="font-display mb-4 text-center text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-500">
        Popular shippers
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {POPULAR_SHIPPERS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate(`/app/companies/${s.id}`)}
            className="group flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand-cyan/40 hover:shadow-glow-cyan"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-brand-cyan/10 group-hover:text-brand-cyan-dim">
              <s.Icon size={22} />
            </div>
            <div className="font-display text-[13px] font-semibold tracking-tight text-ink-900">
              {s.displayName}
            </div>
            <div className="font-body mt-1 text-[10.5px] text-ink-500">
              {s.industry}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
