export default function CommandCenterPage() {
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20 }}>Command Center</h1>
      <p>Route sanity check OK.</p>
    </div>
  );
}

// ---------- Subcomponents ----------

function SectionTitle({ title, compact }: { title: string; compact?: boolean }) {
  return (
    <div className={`text-sm font-semibold ${compact ? '' : 'mb-2'}`}>{title}</div>
  );
}

// Modal UI (render at root below content)
// NOTE: This JSX should be placed at the bottom of the component tree in the return statement above.

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-1">{icon}{value}</div>
    </div>
  );
}

function TagRow({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(t => (
        <span key={t} className="px-2 py-1 rounded-full bg-slate-100 text-xs">{t}</span>
      ))}
    </div>
  );
}

function SimilarItem({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-3 py-2">
      <div className="text-sm">{name}</div>
      <Button size="sm" variant="ghost" className="text-indigo-700">View</Button>
    </div>
  );
}

function FeedItem({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-xl border p-3 hover:bg-slate-50 transition">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{meta}</div>
    </div>
  );
}

function GhostContact({ name, title }: { name: string; title: string }) {
  return (
    <div className="rounded-xl border p-3 bg-white/50">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-slate-200" />
        <div>
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{title}</div>
        </div>
      </div>
      <div className="mt-2 flex gap-1">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100">email hidden</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100">LinkedIn hidden</span>
      </div>
    </div>
  );
}

function KpiStrip({ kpi }: { kpi: { shipments12m: string; lastActivity: string; topLane: string; topCarrier: string } }) {
  const items = [
    { label: 'Shipments (12m)', value: kpi.shipments12m },
    { label: 'Last Activity', value: kpi.lastActivity },
    { label: 'Top Lane', value: kpi.topLane },
    { label: 'Top Carrier', value: kpi.topCarrier },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map(k => (
        <Card key={k.label} className="p-4 rounded-2xl shadow-sm">
          <div className="text-xs text-muted-foreground">{k.label}</div>
          <div className="text-xl font-semibold">{k.value}</div>
        </Card>
      ))}
    </div>
  );
}
