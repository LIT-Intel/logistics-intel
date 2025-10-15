import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Brief = { summary: string; bullets: string[] };

export default function PreCallBriefing() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("lit:selectedCompany") || "null"); } catch { return null; }
  }, []);

  useEffect(() => {
    const cached = readCache(selected);
    if (cached) setBrief(cached);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    if (!selected) return;
    setLoading(true); setErr(null);
    try {
      const body = {
        company_id: selected.company_id ?? null,
        name: selected.name,
      };
      const r = await fetch("/api/lit/public/briefing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status === 404) {
        toast.info("Briefing service is not enabled in this environment yet.");
        setBrief({ summary: "Not available in this environment.", bullets: [] });
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json(); // expected: { summary, bullets[] }
      setBrief(data);
      writeCache(selected, data);
    } catch (e:any) {
      setErr(e?.message || "Failed to generate briefing");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Pre-Call Summary</div>
        <button
          className="px-2.5 py-1.5 text-xs rounded-lg border hover:bg-slate-50"
          onClick={generate}
          disabled={loading}
        >
          {loading ? "Generating…" : "Generate via AI"}
        </button>
      </div>

      {err && <div className="text-sm text-red-600 mb-2">Error: {err}</div>}
      {!brief && !loading && (
        <div className="text-sm text-slate-500">Click “Generate via AI” for a one-page summary and talking points.</div>
      )}
      {brief && (
        <div className="space-y-2">
          <div className="text-sm">{brief.summary}</div>
          {!!brief.bullets?.length && (
            <ul className="list-disc pl-5 text-sm">
              {brief.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function cacheKey(sel:any) {
  const id = sel?.company_id ?? sel?.name ?? "unknown";
  const day = new Date().toISOString().slice(0,10);
  return `lit:brief:${id}:${day}`;
}
function readCache(sel:any): Brief | null {
  try { return JSON.parse(localStorage.getItem(cacheKey(sel)) || "null"); } catch { return null; }
}
function writeCache(sel:any, data: Brief) {
  localStorage.setItem(cacheKey(sel), JSON.stringify(data));
}
