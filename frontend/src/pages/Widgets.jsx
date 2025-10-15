import React, { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { calcTariff, generateQuote } from "@/lib/api";
import { sendEmail } from "@/api/functions";
import LitPageHeader from "../components/ui/LitPageHeader";
import LitPanel from "../components/ui/LitPanel";
import LitWatermark from "../components/ui/LitWatermark";

export default function Widgets() {
  // Tariff state
  const [tariffInput, setTariffInput] = useState({ hsCode: "", origin: "", destination: "", valueUsd: "" });
  const [tariffResult, setTariffResult] = useState(null);
  const [tariffLoading, setTariffLoading] = useState(false);

  // Quote state
  const [companyId, setCompanyId] = useState("");
  const [lanes, setLanes] = useState([{ origin: "", destination: "", mode: "ocean" }]);
  const [notes, setNotes] = useState("");
  const [quoteResult, setQuoteResult] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const quoteHtml = useMemo(() => {
    const items = (quoteResult?.items || []).map(i => `${i.origin} → ${i.destination} (${i.mode}) - $${i.priceUsd}`).join('<br/>');
    return `<!doctype html><meta charset="utf-8"><title>Quote ${quoteResult?.quoteId || ''}</title><style>body{font-family:Inter,system-ui,-apple-system,sans-serif;padding:24px;color:#111}</style><h1>Quote ${quoteResult?.quoteId || ''}</h1><div>Company: ${companyId || '—'}</div><div>Notes: ${notes || '—'}</div><h2>Lanes</h2><div>${items || 'No lanes'}</div><div>Total: ${quoteResult?.totals?.currency || 'USD'} ${quoteResult?.totals?.amount || 0}</div>`;
  }, [quoteResult, companyId, notes]);

  return (
    <div className="relative px-2 md:px-5 py-3 min-h-screen">
      <LitWatermark />
      <div className="max-w-7xl mx-auto space-y-6">
        <LitPageHeader title="Widgets" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tariff Calculator */}
          <LitPanel title="Tariff Calculator">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input placeholder="HS Code" value={tariffInput.hsCode} onChange={(e) => setTariffInput(v => ({ ...v, hsCode: e.target.value }))} />
              <Input placeholder="Value (USD)" type="number" value={tariffInput.valueUsd} onChange={(e) => setTariffInput(v => ({ ...v, valueUsd: Number(e.target.value || 0) }))} />
              <Input placeholder="Origin (Country)" value={tariffInput.origin} onChange={(e) => setTariffInput(v => ({ ...v, origin: e.target.value }))} />
              <Input placeholder="Destination (Country)" value={tariffInput.destination} onChange={(e) => setTariffInput(v => ({ ...v, destination: e.target.value }))} />
            </div>
            <Button onClick={async () => { try { setTariffLoading(true); const res = await calcTariff({ ...tariffInput, valueUsd: Number(tariffInput.valueUsd) || 0 }); setTariffResult(res); } finally { setTariffLoading(false); } }} disabled={tariffLoading} className="bg-blue-600 text-white hover:bg-blue-700">{tariffLoading ? 'Calculating…' : 'Calculate'}</Button>
            {tariffResult && (
              <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto">{JSON.stringify(tariffResult, null, 2)}</pre>
            )}
          </LitPanel>

          {/* Quote Generator */}
          <LitPanel title="Quote Generator">
            <Input placeholder="Company ID (optional)" value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
            <div className="space-y-2">
              {lanes.map((lane, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input placeholder="Origin" value={lane.origin} onChange={(e) => setLanes(arr => arr.map((x, i) => i === idx ? { ...x, origin: e.target.value } : x))} />
                  <Input placeholder="Destination" value={lane.destination} onChange={(e) => setLanes(arr => arr.map((x, i) => i === idx ? { ...x, destination: e.target.value } : x))} />
                  <Select value={lane.mode} onValueChange={(v) => setLanes(arr => arr.map((x, i) => i === idx ? { ...x, mode: v } : x))}>
                    <SelectTrigger><SelectValue placeholder="Mode" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ocean">Ocean</SelectItem>
                      <SelectItem value="air">Air</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setLanes(arr => [...arr, { origin: "", destination: "", mode: "ocean" }])}>Add Lane</Button>
                {lanes.length > 1 && <Button variant="outline" onClick={() => setLanes(arr => arr.slice(0, -1))}>Remove</Button>}
              </div>
            </div>
            <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={async () => { try { setQuoteLoading(true); const res = await generateQuote({ companyId, lanes, notes }); setQuoteResult(res); } finally { setQuoteLoading(false); } }} disabled={quoteLoading} className="bg-green-600 text-white hover:bg-green-700">{quoteLoading ? 'Generating…' : 'Generate Quote'}</Button>
              {quoteResult && (
                <>
                  <Button variant="outline" onClick={() => { const blob = new Blob([quoteHtml], { type: 'text/html' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `quote-${quoteResult?.quoteId || 'draft'}.html`; a.click(); URL.revokeObjectURL(url); }}>Download HTML</Button>
                  <Button variant="outline" onClick={async () => { try { await sendEmail({ subject: `Quote ${quoteResult?.quoteId || ''}`, html: quoteHtml, to: [] }); alert('Email sent (if configured)'); } catch (e) { alert('Failed to send email'); } }}>Email</Button>
                </>
              )}
            </div>
            {quoteResult && (
              <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto">{JSON.stringify(quoteResult, null, 2)}</pre>
            )}
          </LitPanel>
        </div>
      </div>
    </div>
  );
}

