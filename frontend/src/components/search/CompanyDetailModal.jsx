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
        // Load large set to power chart and top route
        const big = await getCompanyShipments({ company_id: String(companyId), limit: 1000, offset: 0 });
        const bigRows = Array.isArray(big?.rows) ? big.rows : [];
        if (!abort) setAllRows(bigRows);
        // Load first page for table
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

  // Top route from allRows
  const topRoute = useMemo(() => {
    const counts = new Map();
    for (const r of allRows) {
      const o = r.origin_country || r.origin_city || r.origin_port || '—';
      const d = r.dest_country || r.dest_city || r.dest_port || '—';
      const key = `${o} → ${d}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = '—', max = 0;
    for (const [k, v] of counts) { if (v > max) { max = v; best = k; } }
    return best;
  }, [allRows]);

  // Monthly volumes (TEU if present else count)
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
      const dt = new Date(String(raw)); if (isNaN(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const vol = typeof r.teu === 'number' ? Number(r.teu) : 1;
      if (byKey.has(key)) byKey.get(key).volume += vol;
    }
    return months;
  }, [allRows]);

  // Filter and paginate table rows client-side by date
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

  function KpiInfo({ icon: Icon, label, value, link = false }) {
    return (
      <div className="relative z-50 mx-auto w-full max-w-4xl max-h-[95vh] overflow-y-auto overflow-hidden       btn-brand max-w-4xl max-h-[95vh] bg-white rounded-xl shadow-lg overflow-y-auto">
        <Icon className="btn-brand" />
        <div className="btn-brand">
          <div className="btn-brand">{label}</div>
          {link ? (
            <a href={value ? String(value) : '#'} target="_blank" rel="noopener noreferrer" className="btn-brand">
              {value ? String(value).replace(/^https?:\/\//,'') : '—'}
            </a>
          ) : (
            <div className="btn-brand">{value || '—'}</div>
          )}
        </div>
      </div>
    );
  }

  async function handleSave() {
    if (!onSave || saving || isSaved) return;
    setSaving(true);
    try { await onSave(company); } finally { setSaving(false); }
  }

  if (!isOpen || !company) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="btn-brand">
        <DialogHeader className="btn-brand">
          <div className="btn-brand">
            <div className="btn-brand">
              <DialogTitle className="btn-brand" style={{ color: '#7F3DFF' }} title={name}>{name}</DialogTitle>
              <div className="btn-brand">
                <div>ID: {String(companyId)}</div>
                {hqText && <div>HQ: {hqText}</div>}
                {website && (
                  <div className="btn-brand"><Globe className="w-4 h-4" />
                    <a href={`https://${String(website).replace(/^https?:\/\//,'')}`} target="_blank" rel="noopener noreferrer" className="btn-brand">
                      {String(website)}
                    </a>
                  </div>
                )}
              </div>
            </div>
            <div className="btn-brand">
              <Button size="sm" onClick={handleSave} disabled={saving || isSaved} className="btn-brand" style={{ backgroundColor: '#7F3DFF' }}>{isSaved ? 'Saved' : (saving ? 'Saving…' : 'Save to Command Center')}</Button>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="btn-brand">
                <X className="btn-brand" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="btn-brand">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="btn-brand">
            <div className="btn-brand">
              <TabsList className="btn-brand">
                <TabsTrigger value="overview" className="btn-brand">Overview</TabsTrigger>
                <TabsTrigger value="summary" className="btn-brand">Shipment Summary</TabsTrigger>
                <TabsTrigger value="shipments" className="btn-brand">Shipments</TabsTrigger>
                <TabsTrigger value="contacts" className="btn-brand" onClick={() => { if (!isSaved || !canViewContacts) setShowGate(true); }}>Contacts</TabsTrigger>
              </TabsList>
            </div>
            <div className="btn-brand">
              {/* Overview */}
              <TabsContent value="overview" className="btn-brand">
                <h3 className="btn-brand">Company Profile</h3>
                <div className="btn-brand">
                  <KpiInfo icon={Database} label="Company ID" value={companyId} />
                  <KpiInfo icon={LinkIcon} label="Website" value={website} link />
                  <KpiInfo icon={Ship} label="Total Shipments (12m)" value={(company?.shipments_12m ?? '—')} />
                  <KpiInfo icon={Box} label="Total TEUs (12m)" value={company?.total_teus != null ? Number(company.total_teus).toLocaleString() : '—'} />
                  <KpiInfo icon={MapPin} label="Top Trade Route" value={topRoute} />
                </div>
                <div className="btn-brand">
                  <h4 className="btn-brand"><BarChartIcon className="w-5 h-5 mr-2" style={{ color: '#7F3DFF' }}/> Sales Intelligence Available</h4>
                  <p className="btn-brand">Access real-time contacts and AI-enriched insights about this company's supply chain strategy by saving them to your Command Center.</p>
                </div>
              </TabsContent>

              {/* Shipment Summary */}
              <TabsContent value="summary" className="btn-brand">
                <div className="btn-brand">
                  <div className="btn-brand"><Ship className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{company?.shipments_12m ?? '—'}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Total Shipments (12m)</div></div>
                  <div className="btn-brand"><Box className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{company?.total_teus != null ? Number(company.total_teus).toLocaleString() : '—'}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Total TEUs (12m)</div></div>
                  <div className="btn-brand"><TrendingUp className="w-6 h-6 mx-auto mb-2" style={{ color: '#7F3DFF' }}/><div className="text-2xl font-bold">{company?.growth_rate != null ? `${Math.round(Number(company.growth_rate) * 100)}%` : '—'}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Growth Rate (YoY)</div></div>
                  <div className="btn-brand"><MapPin className="w-6 h-6 mx-auto mb-2 text-red-500"/><div className="text-lg font-bold">{topRoute}</div><div className="text-xs uppercase text-gray-500 font-medium mt-1">Primary Route</div></div>
                </div>
                <div className="btn-brand">
                  <h3 className="btn-brand"><BarChartIcon className="w-5 h-5 mr-2" style={{ color: '#7F3DFF' }}/> 12-Month Shipment Volume (TEU Equivalent)</h3>
                  <div className="btn-brand" style={{ height: '150px' }}>
                    <div className="btn-brand" />
                    <div className="btn-brand" />
                    <div className="btn-brand" />
                    <div className="btn-brand">
                      {(() => {
                        const max = Math.max(1, ...monthlyVolumes.map(v => v.volume));
                        return monthlyVolumes.map((v, idx) => {
                          const barH = Math.max(5, Math.round((v.volume / max) * 150));
                          const color = idx === monthlyVolumes.length - 1 ? '#7F3DFF' : '#A97EFF';
                          return (
                            <div key={v.key} className="btn-brand" style={{ minWidth: '20px' }}>
                              <div className="btn-brand">{v.volume.toLocaleString()}</div>
                              <div className="btn-brand" style={{ height: `${barH}px`, background: `linear-gradient(180deg, ${color} 0%, ${color} 60%, #5f2fd1 100%)` }} />
                              <div className="btn-brand">{v.month}</div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  <p className="btn-brand">Data represents estimated monthly shipment volume over the last 12 months.</p>
                </div>
              </TabsContent>

              {/* Shipments */}
              <TabsContent value="shipments" className="btn-brand">
                <div className="btn-brand">
                  <div>
                    <div className="btn-brand">Start date</div>
                    <input type="date" className="btn-brand" value={dateStart} onChange={(e)=> { setPage(1); setDateStart(e.target.value); }} />
                  </div>
                  <div>
                    <div className="btn-brand">End date</div>
                    <input type="date" className="btn-brand" value={dateEnd} onChange={(e)=> { setPage(1); setDateEnd(e.target.value); }} />
                  </div>
                  <div className="btn-brand">Page {page} · 50 per page {filteredRows.length ? `· ${filteredRows.length} filtered` : ''}</div>
                </div>
                {error && (
                  <div className="btn-brand">{error}</div>
                )}
                <div className="btn-brand">
                  {loading ? (
                    <div className="btn-brand">Loading shipments…</div>
                  ) : pagedRows.length === 0 ? (
                    <div className="btn-brand">No shipment data available.</div>
                  ) : (
                    <table className="btn-brand">
                      <thead className="btn-brand">
                        <tr>
                          <th className="btn-brand">Date</th>
                          <th className="btn-brand">Mode</th>
                          <th className="btn-brand">Origin</th>
                          <th className="btn-brand">Destination</th>
                          <th className="btn-brand">Carrier</th>
                          <th className="btn-brand">Containers</th>
                          <th className="btn-brand">TEUs</th>
                        </tr>
                      </thead>
                      <tbody className="btn-brand">
                        {pagedRows.map((r, i) => {
                          const raw = r.shipped_on || r.date || r.snapshot_date || r.shipment_date;
                          const d = raw ? new Date(String(raw)).toLocaleDateString() : '—';
                          const mode = (r.mode || r.transport_mode || '—');
                          const origin = r.origin || r.origin_city || r.origin_country || r.origin_port || '—';
                          const dest = r.destination || r.dest_city || r.dest_country || r.dest_port || '—';
                          const carrier = r.carrier_name || r.carrier || '—';
                          const containers = r.container_count ?? '—';
                          const teu = r.teu ?? '—';
                          return (
                            <tr key={i} className="btn-brand">
                              <td className="btn-brand">{d}</td>
                              <td className="btn-brand">{String(mode).toLowerCase()}</td>
                              <td className="btn-brand">{origin}</td>
                              <td className="btn-brand">{dest}</td>
                              <td className="btn-brand">{carrier}</td>
                              <td className="btn-brand">{typeof containers === 'number' ? containers.toLocaleString() : containers}</td>
                              <td className="btn-brand">{typeof teu === 'number' ? teu.toLocaleString() : teu}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="btn-brand">
                  <div />
                  <div className="btn-brand">
                    <button className="btn-brand" onClick={()=> setPage((p)=> Math.max(1, p-1))} disabled={page===1}>Prev</button>
                    <button className="btn-brand" onClick={()=> setPage((p)=> p+1)} disabled={page*50 >= filteredRows.length}>Next</button>
                  </div>
                </div>
              </TabsContent>

              {/* Contacts */}
              <TabsContent value="contacts" className="btn-brand">
                <div className="btn-brand">Contacts are gated.</div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Branded gating overlay */}
        {showGate && (
          <div className="btn-brand" role="dialog" aria-modal="true" onClick={()=> setShowGate(false)}>
            <div className="btn-brand" onClick={(e)=> e.stopPropagation()}>
              <div className="btn-brand" style={{ backgroundColor: '#EEE6FF' }}>
                <Lock className="btn-brand" style={{ color: '#7F3DFF' }} />
              </div>
              <h3 className="btn-brand">Command Center Access</h3>
              <p className="btn-brand">Saving companies and unlocking features like detailed contacts and AI enrichment requires a paid subscription.</p>
              <div className="btn-brand">
                <button className="btn-brand" onClick={()=> setShowGate(false)}>Not now</button>
                <button className="btn-brand" style={{ backgroundColor: '#7F3DFF' }} onClick={()=> setShowGate(false)}>Upgrade Now</button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
