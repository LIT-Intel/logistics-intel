import type { QuoteMode } from "@/api/quoting";

export const SERVICE_TYPES: Record<QuoteMode, string[]> = {
  ocean: ["FCL · Port-to-Port", "FCL · Door-to-Door", "LCL · Port-to-Port", "Door-to-Port", "Port-to-Door"],
  air: ["Airport-to-Airport", "Door-to-Door", "Door-to-Airport", "Airport-to-Door"],
  drayage: ["Port-to-Door", "Ramp-to-Door", "Door-to-Port"],
  ftl: ["Dry Van", "Reefer", "Flatbed", "Power Only"],
  ltl: ["Standard LTL", "Guaranteed LTL", "Volume LTL"],
};

export const CATEGORY: Record<QuoteMode, { label: string; tone: "intl" | "dray" | "dom"; icon: string }> = {
  ocean: { label: "Freight forwarding · International", tone: "intl", icon: "Ship" },
  air: { label: "Freight forwarding · International", tone: "intl", icon: "Plane" },
  drayage: { label: "Drayage · Port logistics", tone: "dray", icon: "Container" },
  ftl: { label: "Domestic brokerage", tone: "dom", icon: "Truck" },
  ltl: { label: "Domestic brokerage", tone: "dom", icon: "Truck" },
};

export const USES_PORTS: Record<QuoteMode, boolean> = { ocean: true, air: true, drayage: true, ftl: false, ltl: false };
export const USES_INCOTERMS: Record<QuoteMode, boolean> = { ocean: true, air: true, drayage: false, ftl: false, ltl: false };

export interface ModeExtraField { key: string; label: string; mono?: boolean; }
export interface ModeFieldSet { originLabel: string; destLabel: string; equipment: string[]; extra: ModeExtraField[]; }

export const MODE_FIELDS: Record<QuoteMode, ModeFieldSet> = {
  ocean: { originLabel: "Origin Port", destLabel: "Destination Port", equipment: ["40HC","40GP","20GP","45HC","Reefer","Flat Rack"], extra: [{ key:"container_count", label:"Containers", mono:true }, { key:"hs_code", label:"HS Code", mono:true }, { key:"cargo_value", label:"Cargo Value", mono:true }] },
  air: { originLabel: "Origin Airport (IATA)", destLabel: "Destination Airport (IATA)", equipment: ["ULD","Loose","Pallet"], extra: [{ key:"weight_lbs", label:"Chargeable Wt (kg)", mono:true }, { key:"pallet_count", label:"Pieces", mono:true }, { key:"hs_code", label:"HS Code", mono:true }] },
  drayage: { originLabel: "Origin Port / Ramp", destLabel: "Destination (City, State, ZIP)", equipment: ["40HC + Chassis","40GP + Chassis","20GP + Chassis","Reefer + Genset"], extra: [{ key:"container_count", label:"Containers", mono:true }, { key:"distance_miles", label:"Distance (mi)", mono:true }] },
  ftl: { originLabel: "Origin (City, State, ZIP)", destLabel: "Destination (City, State, ZIP)", equipment: ["53' Dry Van","Reefer","Flatbed","Step Deck","Power Only"], extra: [{ key:"distance_miles", label:"Distance (mi)", mono:true }, { key:"weight_lbs", label:"Weight (lbs)", mono:true }] },
  ltl: { originLabel: "Origin (City, State, ZIP)", destLabel: "Destination (City, State, ZIP)", equipment: ["—"], extra: [{ key:"pallet_count", label:"Pallets", mono:true }, { key:"weight_lbs", label:"Weight (lbs)", mono:true }, { key:"distance_miles", label:"Distance (mi)", mono:true }] },
};
