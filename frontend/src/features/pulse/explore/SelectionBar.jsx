import { Download, FolderPlus, Bookmark, RefreshCw, Send } from 'lucide-react';

export default function SelectionBar({
  selectionCount,
  onExport,
  onSaveToList,
  onSaveAsView,
  onBulkRefresh,
  onAddToCampaign,
}) {
  if (!selectionCount) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <span className="font-medium text-slate-700">{selectionCount} selected</span>
      <span className="h-4 w-px bg-slate-200" />
      <BarBtn icon={<FolderPlus size={14} />} label="Save to list" onClick={onSaveToList} />
      <BarBtn icon={<Bookmark size={14} />} label="Save view" onClick={onSaveAsView} />
      <BarBtn icon={<Send size={14} />} label="Add to campaign" onClick={onAddToCampaign} />
      <BarBtn icon={<RefreshCw size={14} />} label="Bulk refresh" onClick={onBulkRefresh} />
      <BarBtn icon={<Download size={14} />} label="Export CSV" onClick={onExport} />
    </div>
  );
}

function BarBtn({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      {icon}{label}
    </button>
  );
}
