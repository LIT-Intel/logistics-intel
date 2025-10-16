import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { loadSaved as loadSavedUnified } from '@/components/command-center/storage';

type SavedCompany = {
  company_id?: string | null;
  name: string;
  domain?: string | null;
  source: "LIT" | "LUSHA" | "APOLLO" | "MANUAL";
  ts: number;
};

function loadSaved(): SavedCompany[] { return loadSavedUnified() as any; }
function setSelected(c: SavedCompany) {
  localStorage.setItem("lit:selectedCompany", JSON.stringify({
    company_id: c.company_id ?? null, name: c.name, domain: c.domain ?? null
  }));
}

export default function SavedCompaniesPicker({ onPicked }: { onPicked?: () => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SavedCompany[]>([]);

  useEffect(() => { setItems(loadSaved()); }, []);

  function pick(c: SavedCompany) {
    setSelected(c);
    toast.success(`Selected ${c.name}`);
    setOpen(false);
    onPicked?.();
    // simplest hydrate for now
    window.location.reload();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="px-3 py-1.5 text-xs rounded-full border border-violet-300 text-violet-700 hover:bg-violet-50 flex items-center gap-1 shadow-sm"
      >
        <Heart className="w-3.5 h-3.5" /> Saved Companies
      </button>
      {open && (
        <div className="absolute z-40 mt-2 w-80 rounded-2xl border bg-white shadow-xl right-0">
          <div className="p-3 border-b text-sm font-semibold">Saved Companies</div>
          <div className="max-h-64 overflow-auto">
            {items.filter(i=>!i.archived).length === 0 && (
              <div className="p-3 text-sm text-slate-500">No saved companies yet.</div>
            )}
            {items.filter(i=>!i.archived).map((c, idx) => (
              <button
                key={idx}
                onClick={() => pick(c)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50"
              >
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-slate-500">{c.domain || c.source}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
