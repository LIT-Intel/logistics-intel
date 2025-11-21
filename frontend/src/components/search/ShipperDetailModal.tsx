import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, Package, Ship, Info } from "lucide-react";
import type { IyShipperHit } from "@/lib/api";

type ExtendedShipperHit = IyShipperHit & {
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  shipments_12m?: number | string | null;
  total_teus?: number | null;
  last_shipment_date?: string | null;
  topSuppliers?: string[];
};

type ShipperDetailModalProps = {
  shipper: IyShipperHit | null;
  open: boolean;
  onClose: () => void;
  topRoute?: string | null;
  recentRoute?: string | null;
  onSave?: (shipper: IyShipperHit) => void | Promise<void>;
  saving?: boolean;
};

function safe(value: unknown): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text.length ? text : "—";
}

export default function ShipperDetailModal({
  shipper,
  open,
  onClose,
  topRoute,
  recentRoute,
  onSave,
  saving = false,
}: ShipperDetailModalProps) {
  if (!open || !shipper) return null;

  const extended = shipper as ExtendedShipperHit;
  const title = safe((shipper as any).title ?? "");

  const address = (() => {
    const parts = [
      extended.address_line_1,
      extended.address_line_2,
      extended.city,
      extended.state,
      extended.postal_code,
      extended.country,
    ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

    if (parts.length > 0) {
      return safe(parts.join(", "));
    }

    return safe((shipper as any).address);
  })();

  const shipmentsLabel = (() => {
    if (typeof extended.shipments_12m === "number") {
      return extended.shipments_12m.toLocaleString();
    }
    if (typeof (extended as any).totalShipments === "number") {
      return (extended as any).totalShipments.toLocaleString();
    }
    return safe(extended.shipments_12m ?? (shipper as any).totalShipments);
  })();

  const teusLabel =
    typeof extended.total_teus === "number" ? extended.total_teus.toLocaleString() : "—";

  const suppliers = Array.isArray(extended.topSuppliers)
    ? extended.topSuppliers.slice(0, 6)
    : [];

  const handleSaveClick = async () => {
    if (!onSave) return;
    await onSave(shipper);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[95vh] bg-white rounded-2xl p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle
                className="text-2xl font-semibold text-slate-900 truncate"
                title={title}
              >
                {title}
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-500 truncate">{address}</p>
            </div>
            <div className="flex items-center gap-2">
              {onSave && (
                <Button
                  size="sm"
                  onClick={handleSaveClick}
                  disabled={saving}
                  className="rounded-full bg-indigo-600 text-xs font-semibold text-white px-4 py-2 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving…" : "Save to Command Center"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full text-slate-500 hover:text-slate-900"
              >
                ✕
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs defaultValue="overview" className="flex-1 flex flex-col">
            <div className="px-6 border-b border-slate-100">
              <TabsList className="h-11 gap-2 bg-transparent p-0">
                <TabsTrigger
                  value="overview"
                  className="px-3 py-2 text-xs font-semibold text-slate-500 data-[state=active]:text-indigo-600 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none border-b-2 border-transparent"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="kpis"
                  className="px-3 py-2 text-xs font-semibold text-slate-500 data-[state=active]:text-indigo-600 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none border-b-2 border-transparent"
                >
                  KPIs
                </TabsTrigger>
                <TabsTrigger
                  value="shipments"
                  className="px-3 py-2 text-xs font-semibold text-slate-500 data-[state=active]:text-indigo-600 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none border-b-2 border-transparent"
                >
                  Shipments
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-auto">
              <TabsContent value="overview" className="p-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-center gap-3">
                    <Ship className="h-5 w-5 text-indigo-500" />
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">
                        Shipments (12m)
                      </div>
                      <div className="text-lg font-semibold text-slate-900">
                        {shipmentsLabel}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-center gap-3">
                    <Package className="h-5 w-5 text-indigo-500" />
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">
                        TEUs (12m)
                      </div>
                      <div className="text-lg font-semibold text-slate-900">
                        {teusLabel}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-indigo-500" />
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">
                        Most recent shipment
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {safe(
                          recentRoute ??
                            (extended.last_shipment_date ?? (shipper as any)?.last_shipment_date),
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {suppliers.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      Top suppliers
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {suppliers.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="kpis" className="p-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-indigo-500" />
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">
                        Top route (12m)
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {safe((topRoute ?? (shipper as any)?.top_route_12m) ?? "")}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-indigo-500" />
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">
                        Recent route
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {safe((recentRoute ?? (shipper as any)?.recent_route) ?? "")}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-indigo-50 bg-indigo-50/60 px-4 py-3 flex gap-2 text-xs text-slate-700">
                  <Info className="h-4 w-4 mt-0.5 text-indigo-500" />
                  <p>
                    ImportYeti DMA KPIs are directional. Save this shipper to Command Center to
                    unlock AI briefings, contact enrichment, and multi-lane summaries.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="shipments" className="p-6 space-y-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Shipment-level BOL details will appear here. For now, lane and TEU intelligence is
                  available on the Overview and KPIs tabs.
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
