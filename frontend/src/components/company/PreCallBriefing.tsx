import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import { themeFor } from '@/lib/charts';

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className='px-2 py-0.5 rounded-full text-xs bg-white/70 border border-white/60 shadow-sm'>{children}</span>
);

function KpiTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='rounded-2xl p-4 bg-gradient-to-br from-white/85 to-white/60 backdrop-blur border border-white/50 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)]'>
      <div className='text-[11px] uppercase tracking-wide text-slate-500'>{label}</div>
      <div className='text-2xl font-extrabold text-slate-900 drop-shadow-sm'>{value}</div>
    </div>
  );
}

export default function PreCallBriefing({ company }: { company: any }) {
  const t = themeFor(company.name);
  const growth = company.charts?.growth || [];
  const eco = company.charts?.ecosystem || [];
  const comp = company.charts?.competition || [];
  const src = company.charts?.sourcing || [];
  const pie = eco.map((d: any) => ({ name: d.label, value: d.value }));
  const primaryName = String(company.name || '').split(' ')[0] || 'Company';

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
        <KpiTile label='Shipments (12M)' value={(company.kpis?.shipments12m || 0).toLocaleString()} />
        <KpiTile label='Last Activity' value={company.kpis?.lastActivity || '—'} />
        <KpiTile label='Top Origins' value={(company.kpis?.originsTop || []).slice(0, 3).join(', ') || '—'} />
        <KpiTile label='Top Carriers' value={(company.kpis?.carriersTop || []).slice(0, 2).join(', ') || '—'} />
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div className='rounded-2xl p-4 bg-white/80 backdrop-blur border border-white shadow'>
          <h3 className='font-bold text-center' style={{ color: t.deep }}>Historic Growth Trajectory</h3>
          <div className='h-64'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart data={growth}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='x' />
                <YAxis />
                <Tooltip />
                <Line type='monotone' dataKey='y' stroke={t.bright} strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className='rounded-2xl p-4 bg-white/80 backdrop-blur border border-white shadow'>
          <h3 className='font-bold text-center' style={{ color: t.deep }}>Product Ecosystem</h3>
          <div className='h-64'>
            <ResponsiveContainer width='100%' height='100%'>
              <PieChart>
                <Pie data={pie} innerRadius={70} outerRadius={100} paddingAngle={2} dataKey='value'>
                  {pie.map((e: any, i: number) => (<Cell key={i} fill={[t.deep, t.mid, t.bright, t.light][i % 4]} />))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6 items-start'>
        <div className='rounded-2xl p-4 bg-white/80 backdrop-blur border border-white shadow order-2 md:order-1'>
          <h3 className='font-bold text-center' style={{ color: t.deep }}>Competitive Landscape</h3>
          <div className='h-80'>
            <ResponsiveContainer width='100%' height='100%'>
              <RadarChart data={comp}>
                <PolarGrid />
                <PolarAngleAxis dataKey='k' />
                <PolarRadiusAxis angle={30} domain={[0, 10]} />
                <Radar name={primaryName} dataKey={primaryName} stroke={t.mid} fill={t.mid} fillOpacity={0.2} />
                <Radar name='Market' dataKey='Market' stroke='#8884d8' fill='#8884d8' fillOpacity={0.1} />
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className='rounded-2xl p-4 bg-white/80 backdrop-blur border border-white shadow order-1 md:order-2'>
          <h3 className='text-xl font-bold mb-2' style={{ color: t.deep }}>Analyst Take</h3>
          <p className='text-sm text-slate-700 whitespace-pre-wrap'>{company.ai?.summary || 'Pending enrichment…'}</p>
          <div className='mt-3'>
            <div className='text-xs uppercase text-slate-500'>Talk Tracks</div>
            <ul className='list-disc pl-5 text-sm'>
              {(company.ai?.bullets || ['—']).map((b: string, i: number) => (<li key={i}>{b}</li>))}
            </ul>
          </div>
        </div>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div className='rounded-2xl p-4 bg-white/80 backdrop-blur border border-white shadow'>
          <h3 className='font-bold text-center' style={{ color: t.deep }}>Top Sourcing Countries</h3>
          <div className='h-72'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={src} layout='vertical' margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis type='number' domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis type='category' dataKey='country' />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey='pct' fill={t.mid} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className='rounded-2xl p-4 bg-white/80 backdrop-blur border border-white shadow'>
          <h3 className='font-bold' style={{ color: t.deep }}>Trade & Supply Chain Notes</h3>
          <p className='text-sm text-slate-700'>Lane reliability, seasonality, and DC proximity drive cost-to-serve. Consider dedicated capacity for launches, SLA scorecards, and sustainability reporting.</p>
          <div className='mt-3 flex gap-2 flex-wrap'><Pill>New Lane Alerts</Pill><Pill>DG Compliance</Pill><Pill>RFP Ready</Pill></div>
        </div>
      </div>
    </div>
  );
}

