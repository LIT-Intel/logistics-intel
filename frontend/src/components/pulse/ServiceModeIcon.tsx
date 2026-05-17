// frontend/src/components/pulse/ServiceModeIcon.tsx
import { Ship, Plane, Truck, Package } from 'lucide-react';

export type ServiceMode = 'fcl' | 'lcl' | 'air' | 'truck' | 'unknown';

export function deriveServiceMode(shipment: {
  mode?: string | null;
  lcl?: boolean | null;
}): ServiceMode {
  const mode = (shipment.mode || '').toLowerCase();
  if (mode.includes('air')) return 'air';
  if (mode.includes('truck') || mode.includes('road')) return 'truck';
  if (shipment.lcl === true) return 'lcl';
  if (mode.includes('sea') || mode.includes('ocean')) return 'fcl';
  return 'unknown';
}

const ICONS = {
  fcl: Ship,
  lcl: Package,
  air: Plane,
  truck: Truck,
  unknown: Ship,
} as const;

const LABELS = {
  fcl: 'FCL',
  lcl: 'LCL',
  air: 'Air',
  truck: 'Truck',
  unknown: 'Ocean',
} as const;

export function ServiceModeIcon(props: {
  shipment: { mode?: string | null; lcl?: boolean | null };
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const mode = deriveServiceMode(props.shipment);
  const Icon = ICONS[mode];
  return (
    <span className={`inline-flex items-center gap-1 text-xs text-slate-600 ${props.className || ''}`}>
      <Icon size={props.size ?? 14} aria-hidden />
      {props.showLabel !== false && <span>{LABELS[mode]}</span>}
    </span>
  );
}
