import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getCrmCampaigns, attachCompaniesToCampaign } from "@/lib/api";

// `lit_campaigns.id` is a uuid string. The legacy modal typed it as
// number which silently masked the real failure path; fixed to string
// here so the FK insert into lit_campaign_companies is correct.
type Campaign = { id: string; name: string };

export default function AddToCampaignModal({
  open,
  onClose,
  company,
}: {
  open: boolean;
  onClose: () => void;
  // `company.company_id` here is the lit_companies.id UUID — the FK
  // target. CommandCenter resolves the UUID from getSavedCompanies()
  // before mounting this modal, not the source_company_key slug.
  company: { company_id?: string | null; name: string };
}) {
  const [list, setList] = useState<Campaign[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const data = await getCrmCampaigns();
        const rows = Array.isArray((data as any)?.rows)
          ? ((data as any).rows as Campaign[])
          : Array.isArray(data)
          ? (data as Campaign[])
          : [];
        setList(rows);
      } catch (err) {
        console.error("Failed to load campaigns:", err);
        setList([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  async function add(campaignId: string) {
    if (!company.company_id) {
      toast.error("Company ID is required");
      return;
    }
    setAdding(campaignId);
    try {
      // Phase: route through the canonical Supabase-direct helper added
      // in Phase C. The legacy /crm/campaigns/{id}/addCompany gateway
      // is not deployed, so the previous addCompanyToCampaign call
      // silently failed. attachCompaniesToCampaign upserts into
      // lit_campaign_companies with onConflict (campaign_id, company_id),
      // making re-adds a no-op instead of a duplicate-key error.
      await attachCompaniesToCampaign(campaignId, [company.company_id]);
      toast.success("Added to campaign");
      onClose();
      document.dispatchEvent(new Event("lit:campaign-kpi:refresh"));
    } catch (e: any) {
      toast.error(`Failed: ${e?.message || e}`);
    } finally {
      setAdding(null);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center">
      <div className="w-[600px] max-w-[95vw] rounded-2xl bg-white shadow-2xl border">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="text-sm font-semibold">Add to Campaign</div>
          <button onClick={onClose} className="text-sm text-gray-500">
            Close
          </button>
        </div>
        <div className="p-5">
          {loading && <div className="text-sm text-gray-500">Loading…</div>}
          {!loading && !list?.length && (
            <div className="text-sm text-gray-500">No campaigns found.</div>
          )}
          <div className="space-y-2">
            {list?.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border p-3 flex items-center justify-between"
              >
                <div className="text-sm">{c.name}</div>
                <button
                  className="px-3 py-1.5 text-sm rounded-lg border disabled:cursor-wait disabled:opacity-60"
                  onClick={() => add(c.id)}
                  disabled={adding !== null}
                >
                  {adding === c.id ? "Adding…" : "Add"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
