// V6-aligned selection action bar — appears above the account table when
// 1+ accounts are selected. Contextual actions: Save to list, Save as view,
// Bulk refresh, Add to campaign, Export CSV.

import { Download, FolderPlus, Bookmark, RefreshCw, Send, X } from 'lucide-react';

function Btn({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
    >
      {icon}{label}
    </button>
  );
}

export default function SelectionActionBar({
  selectionCount,
  totalCount,
  onClear,
  onExport,
  onSaveToList,
  onSaveAsView,
  onBulkRefresh,
  onAddToCampaign,
}) {
  if (!selectionCount) return null;
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 bg-cyan-50/40 px-3 py-1.5 text-sm">
      <span className="font-medium text-cyan-900 mr-2">
        {selectionCount.toLocaleString()} of {totalCount.toLocaleString()} selected
      </span>
      <button
        type="button"
        onClick={onClear}
        className="text-cyan-700 hover:bg-cyan-100 rounded p-0.5"
        aria-label="Clear selection"
        title="Clear selection"
      >
        <X size={12} />
      </button>
      <span className="h-4 w-px bg-slate-300 mx-2" />
      <Btn icon={<FolderPlus size={13} />} label="Save to list" onClick={onSaveToList} />
      <Btn icon={<Bookmark size={13} />} label="Save view" onClick={onSaveAsView} />
      <Btn icon={<Send size={13} />} label="Add to campaign" onClick={onAddToCampaign} />
      <Btn icon={<RefreshCw size={13} />} label="Bulk refresh" onClick={onBulkRefresh} />
      <Btn icon={<Download size={13} />} label="Export CSV" onClick={onExport} />
    </div>
  );
}
