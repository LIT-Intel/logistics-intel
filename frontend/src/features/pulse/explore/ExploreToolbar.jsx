import { Search } from 'lucide-react';
import ColorModeToggle from './ColorModeToggle';
import SizeModeToggle from './SizeModeToggle';
import FilterChipRow from './FilterChipRow';
import SelectionBar from './SelectionBar';

export default function ExploreToolbar({
  query, onQuery, onSubmit,
  filters, onFiltersChange,
  color, onColor,
  size, onSize,
  selectionCount, selectionActions,
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-white/80 backdrop-blur px-4 py-3">
      <form onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }} className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={query ?? ''}
            onChange={(e) => onQuery(e.target.value)}
            placeholder='Try "vulnerable incumbents in the southeast"'
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 focus:border-slate-400 focus:outline-none text-sm"
          />
        </div>
        <ColorModeToggle value={color} onChange={onColor} />
        <SizeModeToggle value={size} onChange={onSize} />
      </form>
      <div className="flex items-center gap-3">
        <FilterChipRow filters={filters} onChange={onFiltersChange} />
        <div className="ml-auto"><SelectionBar selectionCount={selectionCount} {...selectionActions} /></div>
      </div>
    </div>
  );
}
