import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCompanyOverview, getCompanyShipments } from "@/api/functions";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function PreCallBriefing() {
  const query = useQuery();
  const navigate = useNavigate();
  const initialId = query.get("company_id") || "";

  const [companyId, setCompanyId] = useState(initialId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  async function loadBriefing() {
    if (!companyId) {
      setError("Enter a company ID");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const [ovr, shp] = await Promise.all([
        getCompanyOverview({ company_id: companyId }),
        getCompanyShipments(companyId, { limit: 50 }),
      ]);
      setOverview(ovr?.data?.result || null);
      setShipments(Array.isArray(shp?.data?.results) ? shp.data.results : []);
    } catch (e) {
      console.error(e);
      setError("Failed to load briefing.");
      setOverview(null);
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }
  function toHtml() {
    const title = `Pre-Call Briefing — ${overview?.name || companyId}`;
    const recent = shipments.slice(0,6).map(s => `${s.origin || s.origin_country || '—'} → ${s.destination || s.dest_country || '—'} (${s.mode || s.transport_mode || '—'})`).join('<br/>');
    return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font-family:Inter,system-ui,-apple-system,sans-serif;padding:24px;color:#111}h1{margin:0 0 8px}h2{margin:20px 0 8px}</style><h1>${title}</h1><h2>Overview</h2><div>Name: <b>${overview?.name || overview?.company_name || companyId}</b></div><div>Recent Activity: ${overview?.last_seen ?? 'N/A'}</div><div>Modes: ${(overview?.mode_breakdown||[]).map(m=>m.mode).join(', ')}</div><div>Top Lanes: ${(overview?.top_lanes||[]).slice(0,3).map(l=>l.route).join(' · ')}</div><h2>Recent Shipments</h2><div>${recent || 'No recent shipments'}</div>`;
  }

  async function downloadHtml() {
    const html = toHtml();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `briefing-${companyId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function sendEmail() {
    try {
      setEmailSending(true);
      const html = toHtml();
      // Use existing sendEmail callable stub
      const { sendEmail } = await import("@/api/functions");
      await sendEmail({ subject: `Pre-Call Briefing: ${overview?.name || companyId}`, html, to: [] });
      alert('Email sent (if email service configured).');
    } catch (e) {
      console.error(e);
      alert('Failed to send email.');
    } finally {
      setEmailSending(false);
    }
  }

  useEffect(() => {
    if (initialId) loadBriefing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pre-Call Briefing</h1>
          <p className="text-sm text-gray-600">AI-aided context before you talk to a prospect</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
        <Button onClick={downloadHtml} disabled={!overview || exporting} className="bg-blue-600 text-white hover:bg-blue-700">Download HTML</Button>
        <Button onClick={sendEmail} disabled={!overview || emailSending} className="bg-purple-600 text-white hover:bg-purple-700">Email Briefing</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Load Company</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <Input value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="Company ID" />
          <Button onClick={loadBriefing} disabled={loading}>{loading ? "Loading…" : "Generate Briefing"}</Button>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">{error}</div>
      )}

      {overview && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Company Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-gray-500">Name</div>
                  <div className="font-medium">{overview?.name || overview?.company_name || companyId}</div>
                </div>
                <div>
                  <div className="text-gray-500">Recent Activity</div>
                  <div className="font-medium">{overview?.last_seen ?? "N/A"}</div>
                </div>
                <div>
                  <div className="text-gray-500">Modes</div>
                  <div className="font-medium">{Array.isArray(overview?.mode_breakdown) ? overview.mode_breakdown.map(m => m.mode).join(", ") : "—"}</div>
                </div>
                <div>
                  <div className="text-gray-500">Top Lanes</div>
                  <div className="font-medium">{Array.isArray(overview?.top_lanes) ? overview.top_lanes.slice(0,3).map(l => l.route).join(" · ") : "—"}</div>
                </div>
              </div>
              <div className="text-gray-600">Suggested opener: Based on your recent {overview?.mode_breakdown?.[0]?.mode || 'trade'} activity to {overview?.top_lanes?.[0]?.route?.split('→')?.[1] || 'target region'}, we can reduce transit variability and improve landed cost by 3–7%.</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent Shipments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {shipments.slice(0,6).map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="truncate">{s.origin || s.origin_country || '—'} → {s.destination || s.dest_country || '—'}</div>
                  <div className="text-gray-500">{s.mode || s.transport_mode || '—'}</div>
                </div>
              ))}
              {shipments.length === 0 && <div className="text-gray-500">No recent shipments</div>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

