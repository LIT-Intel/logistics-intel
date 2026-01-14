import React from "react";
import { Loader2, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { CommandCenterRecord } from "@/types/importyeti";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";

type SavedCompaniesPanelProps = {
  companies: CommandCenterRecord[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  loading: boolean;
  error: string | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const buildRouteLabel = (shipment?: { origin_port?: string | null; destination_port?: string | null }) => {
  if (!shipment) return "—";
  const origin = shipment.origin_port || "—";
  const destination = shipment.destination_port || "—";
  if (origin === "—" && destination === "—") return "—";
  return `${origin} → ${destination}`;
};

const buildLocation = (company?: CommandCenterRecord["company"]) => {
  if (!company) return "Location unavailable";
  if (company.address) return company.address;
  return company.country_code || "Location unavailable";
};

const recordKey = (record: CommandCenterRecord) =>
  record.company?.company_id || record.company?.name || record.company?.company_name || "";

export default function SavedCompaniesPanel({
  companies,
  selectedKey,
  onSelect,
  loading,
  error,
}: SavedCompaniesPanelProps) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            Saved companies
          </p>
          <motion.p
            key={companies.length}
            initial={{ scale: 1.2, color: "#3b82f6" }}
            animate={{ scale: 1, color: "#0f172a" }}
            transition={{ duration: 0.3 }}
            className="text-sm font-semibold"
          >
            {companies.length} {companies.length === 1 ? 'company' : 'companies'}
          </motion.p>
        </div>
      </div>
      <div className="relative">
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 backdrop-blur-sm"
            >
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            </motion.div>
          )}
        </AnimatePresence>
        <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-auto">
          <AnimatePresence mode="wait">
            {error && (
              <motion.li
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-4 py-5 text-sm text-rose-600 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                {error}
              </motion.li>
            )}
            {!error && !companies.length && !loading && (
              <motion.li
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-4 py-8 text-center"
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">No saved companies yet</p>
                  <p className="text-xs text-slate-400">Save companies from search to get started</p>
                </div>
              </motion.li>
            )}
          </AnimatePresence>
          {companies.map((record, index) => {
            const key = recordKey(record);
            if (!key) return null;
            const active = key === selectedKey;
            const lastShipment =
              record.company?.kpis?.last_activity ||
              record.shipments?.[0]?.date ||
              null;
            const recentRoute = buildRouteLabel(record.shipments?.[0]);
            const logoUrl = getCompanyLogoUrl(record.company?.domain);

            return (
              <motion.li
                key={key}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
                whileHover={{ x: 2 }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  className={`flex w-full items-start gap-3 px-4 py-4 text-left transition-all relative ${
                    active
                      ? "bg-gradient-to-r from-blue-50 to-transparent"
                      : "hover:bg-slate-50"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-blue-600 rounded-r"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <motion.div whileHover={{ scale: 1.05 }}>
                    <CompanyAvatar
                      name={record.company?.name || "Company"}
                      logoUrl={logoUrl ?? undefined}
                      size="sm"
                    />
                  </motion.div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-xs font-semibold tracking-wide ${active ? 'text-blue-600' : 'text-slate-500'} transition-colors`}>
                      {(record.company?.name || "Company").toUpperCase()}
                    </p>
                    <p className="truncate text-sm text-slate-900 font-medium">
                      {buildLocation(record.company)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(lastShipment)}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{recentRoute}</p>
                  </div>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </motion.aside>
  );
}
