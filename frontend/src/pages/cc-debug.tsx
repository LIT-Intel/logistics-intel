export default function CCDebug() {
  return (
    <div className="p-6">
      <div className="rounded-xl border p-4">
        <div className="text-sm font-semibold">CC DEBUG</div>
        <div className="text-xs text-slate-600">Path: {typeof window!=="undefined" ? window.location.pathname : ''}</div>
        <div className="text-xs text-slate-600">Build tag: cc-debug-1</div>
      </div>
    </div>
  );
}
