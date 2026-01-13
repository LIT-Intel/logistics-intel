import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getCrmCampaigns, addCompanyToCampaign } from "@/lib/api";

type Campaign = { id: number; name: string };

export default function AddToCampaignModal({ open, onClose, company }:{ open:boolean; onClose:()=>void; company:{company_id?:string|null; name:string} }) {
  const [list, setList] = useState<Campaign[]|null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ if(open){ (async()=>{
    setLoading(true);
    try{
      const data = await getCrmCampaigns();
      const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
      setList(rows);
    }catch(err){
      console.error('Failed to load campaigns:', err);
      setList([]);
    } finally{ setLoading(false); }
  })(); } },[open]);

  async function add(id:number) {
    try{
      if (!company.company_id) {
        throw new Error('Company ID is required');
      }
      await addCompanyToCampaign({
        campaign_id: id,
        company_id: company.company_id,
        contact_ids: []
      });
      toast.success("Added to campaign");
      onClose();
      document.dispatchEvent(new Event("lit:campaign-kpi:refresh"));
    }catch(e:any){ toast.error(`Failed: ${e?.message||e}`); }
  }

  if(!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center">
      <div className="w-[600px] max-w-[95vw] rounded-2xl bg-white shadow-2xl border">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="text-sm font-semibold">Add to Campaign</div>
          <button onClick={onClose} className="text-sm text-gray-500">Close</button>
        </div>
        <div className="p-5">
          {loading && <div className="text-sm text-gray-500">Loading…</div>}
          {!loading && !list?.length && <div className="text-sm text-gray-500">No campaigns found.</div>}
          <div className="space-y-2">
            {list?.map(c=> (
              <div key={c.id} className="rounded-xl border p-3 flex items-center justify-between">
                <div className="text-sm">{c.name}</div>
                <button className="px-3 py-1.5 text-sm rounded-lg border" onClick={()=>add(c.id)}>Add</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
