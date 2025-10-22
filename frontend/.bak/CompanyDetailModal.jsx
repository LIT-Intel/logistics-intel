import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Globe, Ship, TrendingUp, Box, Clock, Lock, MapPin, Database, Link as LinkIcon, BarChart as BarChartIcon } from 'lucide-react';
import { getCompanyShipments } from '@/lib/api';
import { hasFeature } from '@/lib/access';

export default function CompanyDetailModal({ company, isOpen, onClose, onSave, user, isSaved = false }) {
  const [allRows, setAllRows] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [showGate, setShowGate] = useState(false);

  const companyId = company?.company_id || company?.id || null;
  const name = company?.company_name || company?.name || 'Company';
  const website = company?.website || company?.domain || null;
  const hqText = [company?.hq_city, company?.hq_state].filter(Boolean).join(', ');
  const isWhitelisted = String(user?.email || '').toLowerCase() === 'vraymond@logisticintel.com' || String(user?.email || '').toLowerCase() === 'support@logisticintel.com';
  const canViewContacts = isWhitelisted || hasFeature('contacts');

  useEffect(() => {
    let abort = false;
    async function load() {
      if (!isOpen || !companyId) return;
      setLoading(true);
      setError('');
      try {
        const big = await getCompanyShipments({ company_id: String(companyId), limit: 1000, offset: 0 });
        const bigRows = Array.isArray(big?.rows) ? big.rows : [];
        if (!abort) setAllRows(bigRows);

        const first = await getCompanyShipments({ company_id: String(companyId), limit: 50, offset: 0 });
        if (!abort) setTableRows(Array.isArray(first?.rows) ? first.rows : []);
      } catch (e) {
        if (!abort) {
          setAllRows([]);
          setTableRows([]);
          setError('Failed to load shipments.');
        }
      } finally {
        if (!abort) setLoading(false);
      }
    }
    load();
    return () => { abort = true; };
  }, [isOpen, companyId]);

  const topRoute = useMemo(() => {
    const counts = new Map();
    for (const r of allRows) {
      const o = r.origin_country || r.origin_city || r.origin_port || '—';
      const d = r.dest_country || r.dest_city || r.dest_port || '—';
      const key = `${o} → ${d}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = '—', max = 0;
    for (const [k, v] of counts) {
      if (v > max) {
        max = v;
        best = k;
      }
    }
    return best;
  }, [allRows]);

  const monthlyVolumes = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, month: d.toLocaleString(undefined, { month: 'short' }), volume: 0 });
    }
    const byKey = new Map(months.map(m => [m.key, m]));
    for (const r of allRows) {
      const raw = r.shipped_on || r.date || r.snapshot_date || r.shipment_date;
      if (!raw) continue;
      const dt = new Date(String(raw));
      if (isNaN(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const vol = typeof r.teu === 'number' ? Number(r.teu) : 1;
      if (byKey.has(key)) byKey.get(key).volume += vol;
    }
    return months;
  }, [allRows]);

  const filteredRows = useMemo(() => {
    if (!dateStart && !dateEnd) return tableRows;
    const s = dateStart ? new Date(dateStart) : null;
    const e = dateEnd ? new Date(dateEnd) : null;
    return tableRows.filter((r) => {
      const raw = r.shipped_on || r.date || r.snapshot_date || r.shipment_date;
      if (!raw) return false;
      const d = new Date(String(raw));
      if (s && d < s) return false;
      if (e && d > e) return false;
      return true;
    });
  }, [tableRows, dateStart, dateEnd]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * 50;
    return filteredRows.slice(start, start + 50);
  }, [filteredRows, page]);

  async function handleSave() {
    if (!onSave || saving || isSaved) return;
    setSaving(true);
    try {
      await onSave(company);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen || !company) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto rounded-xl bg-white">
        <DialogHeader>
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle className="text-2xl font-bold text-purple-700">{name}</DialogTitle>
              <div className="text-sm text-gray-500">
                ID: {String(companyId)}
                {hqText && <div>HQ: {hqText}</div>}
                {website && (
                  <div className="flex items-center gap-1">
                    <Globe className="w-4 h-4" />
                    <a href={`https://${website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer">
                      {website}
                    </a>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving || isSaved} className="bg-purple-700 text-white">
                {isSaved ? 'Saved' : (saving ? 'Saving…' : 'Save to Command Center')}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="bg-gray-100 rounded p-1 space-x-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="summary">Shipment Summary</TabsTrigger>
            <TabsTrigger value="shipments">Shipments</TabsTrigger>
            <TabsTrigger value="contacts" onClick={() => { if (!isSaved || !canViewContacts) setShowGate(true); }}>Contacts</TabsTrigger>
          </TabsList>

          {/* You can keep the tab contents here as-is or from your final version */}
          {/* ... */}
        </Tabs>

        {showGate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-sm shadow-lg text-center">
              <div className="bg-purple-100 w-10 h-10 flex items-center justify-center rounded-full mx-auto mb-3">
                <Lock className="text-purple-700" />
              </div>
              <h3 className="text-xl font-bold mb-2">Command Center Access</h3>
              <p className="text-sm text-gray-600 mb-4">Saving companies and unlocking features like detailed contacts and AI enrichment requires a paid subscription.</p>
              <div className="flex justify-center gap-4">
                <Button variant="ghost" onClick={() => setShowGate(false)}>Not now</Button>
                <Button className="bg-purple-700 text-white" onClick={() => setShowGate(false)}>Upgrade Now</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
