// AdminPanels.jsx — Admin Dashboard panels (light theme)
'use strict';

function fmt(n) { return typeof n === 'number' ? n.toLocaleString('en-US') : n; }

/* ── System Overview KPI strip ──────────────────────── */
function AdminOverview() {
  const o = ADMIN_DATA.overview;
  const tiles = [
    ['Total users',        'totalUsers',      'blue',   'users'],
    ['Active · 7 days',    'activeUsers7d',   'cyan',   'activity'],
    ['Companies',          'companies',       'violet', 'building-2'],
    ['Contacts',           'contacts',        'blue',   'user-round'],
    ['Active campaigns',   'campaigns',       'amber',  'send'],
    ['Outreach · 24h',     'outreachSent24h', 'cyan',   'mail'],
    ['Error rate · 24h',   'errorRate',       'green',  'shield-check'],
    ['API latency · p95',  'apiLatencyMs',    'slate',  'timer'],
  ];
  return (
    <div className="ak-kpi-grid">
      {tiles.map(([label,key,tone,icon]) => {
        const d = o[key];
        const v = typeof d.v==='number' ? (d.unit==='%' ? d.v.toFixed(2) : fmt(d.v)) : d.v;
        return <AKPI key={key} label={label} value={v} unit={d.unit||''} trend={d.trend} tone={tone} icon={icon}/>;
      })}
    </div>
  );
}

/* ── Plan distribution donut ────────────────────────── */
function PlanDistribution() {
  const rows = ADMIN_DATA.planDistribution;
  const total = rows.reduce((a,b)=>a+b.count,0);
  const mrrTotal = rows.reduce((a,b)=>a+b.mrr,0);
  let cursor = 0;
  const segs = rows.map(r => { const start=cursor,len=(r.count/total)*360; cursor+=len; return {...r,start,len}; });
  const grad = 'conic-gradient(' + segs.map(s=>`${s.color} ${s.start}deg ${s.start+s.len}deg`).join(', ') + ')';
  return (
    <APanel title={<><i data-lucide="pie-chart" style={{width:14,height:14,color:'#3b82f6'}}></i> Plan distribution</>} subtitle={`${fmt(total)} workspaces · $${fmt(mrrTotal)} MRR`}>
      <div style={{display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
        <div style={{position:'relative',flexShrink:0}}>
          <div style={{width:120,height:120,borderRadius:'50%',background:grad}}/>
          <div style={{position:'absolute',inset:18,borderRadius:'50%',background:'#fff',border:'1px solid #F1F5F9',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:10,color:'#94a3b8',letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:600}}>MRR</div>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:20,fontWeight:700,color:'#0F172A'}}>${(mrrTotal/1000).toFixed(1)}k</div>
          </div>
        </div>
        <div style={{flex:1,minWidth:180,display:'flex',flexDirection:'column',gap:8}}>
          {rows.map(r => (
            <div key={r.plan} style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{width:8,height:8,borderRadius:2,background:r.color,flexShrink:0}}/>
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,minWidth:0}}>
                <span style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12.5,fontWeight:600,color:'#0F172A'}}>{r.plan}</span>
                <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11.5,color:'#64748b'}}>{fmt(r.count)} · ${fmt(r.mrr)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </APanel>
  );
}

/* ── System Health stoplight ────────────────────────── */
function SystemHealth() {
  const items = ADMIN_DATA.systemHealth;
  const tone = s => ({ok:'green', degraded:'amber', warning:'amber', down:'red'}[s]||'slate');
  const overall = items.some(i=>i.status==='down') ? 'down'
                : items.some(i=>i.status==='degraded'||i.status==='warning') ? 'degraded' : 'ok';
  return (
    <APanel
      title={<><ADot tone={tone(overall)} live/> System health</>}
      subtitle="Provider + infrastructure status"
      right={<APill tone={tone(overall)} dot>{overall==='ok'?'All systems operational': overall==='degraded'?'Degraded services':'Incident'}</APill>}
      pad={0}>
      <div>
        {items.map(h => (
          <ARow key={h.svc}>
            <ADot tone={tone(h.status)} live={h.status==='ok'||h.status==='degraded'}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12.5,fontWeight:600,color:'#0F172A',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{h.svc}</div>
              {h.note && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color: (h.status==='warning'||h.status==='degraded')?'#B45309':'#94a3b8',marginTop:1}}>{h.note}</div>}
            </div>
            <div className="ak-mobile-hide" style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#64748b',width:60,textAlign:'right'}}>{h.uptime}</div>
            <div className="ak-mobile-hide" style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#64748b',width:56,textAlign:'right'}}>{h.latency}</div>
            <APill tone={tone(h.status)} dot>{h.status}</APill>
          </ARow>
        ))}
      </div>
    </APanel>
  );
}

/* ── User Management ────────────────────────────────── */
function UserManagement({ onAction }) {
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const rows = ADMIN_DATA.users.filter(u => {
    if (filter==='flagged' && !u.flagged) return false;
    if (filter==='suspended' && u.status!=='suspended') return false;
    if (filter==='admins' && u.role!=='admin' && u.role!=='superadmin') return false;
    if (q && !(u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()) || u.org.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });
  const roleTone = r => r==='superadmin' ? 'violet' : r==='admin' ? 'blue' : 'slate';
  const planTone = p => p==='Enterprise'?'violet':p==='Scale'?'cyan':p==='Growth'?'blue':'slate';
  const statusTone = s => s==='active'?'green':s==='suspended'?'red':'slate';

  return (
    <APanel
      title={<><i data-lucide="users" style={{width:14,height:14,color:'#3b82f6'}}></i> User management</>}
      subtitle={`${fmt(ADMIN_DATA.overview.totalUsers.v)} users across ${fmt(ADMIN_DATA.planDistribution.reduce((a,b)=>a+b.count,0))} workspaces`}
      right={<>
        <AInput icon="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search users, email, workspace…" style={{width:260}}/>
        <ASelect value={filter} onChange={e=>setFilter(e.target.value)} options={[
          {value:'all', label:'All users'},
          {value:'admins', label:'Admins only'},
          {value:'flagged', label:'Flagged'},
          {value:'suspended', label:'Suspended'},
        ]} style={{width:150}}/>
      </>}
      pad={0}>
      <AHead cols={[
        {label:'User', flex:2.2},
        {label:'Workspace', flex:1.6},
        {label:'Role', w:96},
        {label:'Plan', w:104},
        {label:'MRR', w:74, align:'right'},
        {label:'Last active', w:104},
        {label:'Status', w:100},
        {label:'', w:100, align:'right'},
      ]}/>
      <div className="ak-scroll-table">
        {rows.map(u => (
          <ARow key={u.id}>
            <div style={{flex:2.2,display:'flex',alignItems:'center',gap:10,minWidth:0}}>
              <div style={{width:28,height:28,borderRadius:'50%',background:'#EFF6FF',border:'1px solid #BFDBFE',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10.5,fontWeight:700,color:'#1d4ed8',fontFamily:'Space Grotesk,sans-serif',flexShrink:0}}>
                {u.name.split(' ').map(s=>s[0]).join('').slice(0,2)}
              </div>
              <div style={{minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12.5,fontWeight:600,color:'#0F172A',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.name}</span>
                  {u.flagged && <i data-lucide="alert-triangle" style={{width:11,height:11,color:'#f59e0b'}}></i>}
                </div>
                <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#64748b',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.email}</div>
              </div>
            </div>
            <div style={{flex:1.6,minWidth:0}}>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12,fontWeight:500,color:'#334155',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.org}</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:10.5,color:'#94a3b8'}}>{u.seats} seat{u.seats!==1?'s':''} · since {u.joined}</div>
            </div>
            <div style={{width:96}}><APill tone={roleTone(u.role)} dot>{u.role}</APill></div>
            <div style={{width:104}}><APill tone={planTone(u.plan)}>{u.plan}</APill></div>
            <div style={{width:74,textAlign:'right',fontFamily:'JetBrains Mono,monospace',fontSize:11.5,color:u.mrr>0?'#0F172A':'#cbd5e1'}}>{u.mrr>0?`$${fmt(u.mrr)}`:'—'}</div>
            <div style={{width:104,fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#64748b'}}>{u.last}</div>
            <div style={{width:100}}><APill tone={statusTone(u.status)} dot>{u.status}</APill></div>
            <div style={{width:100,display:'flex',justifyContent:'flex-end',gap:2}}>
              <AIconBtn icon="eye" title="View profile" onClick={()=>onAction('view', u)}/>
              <AIconBtn icon="shield" tone="blue" title="Change role" onClick={()=>onAction('role', u)}/>
              <AIconBtn icon={u.status==='suspended'?'user-check':'user-x'} tone={u.status==='suspended'?'green':'red'} title={u.status==='suspended'?'Reactivate':'Suspend'} onClick={()=>onAction('suspend', u)}/>
            </div>
          </ARow>
        ))}
        {rows.length===0 && <AEmpty icon="user-search" title="No users match" sub="Adjust search or filter to see more."/>}
      </div>
    </APanel>
  );
}

/* ── Campaign Monitoring ────────────────────────────── */
function CampaignMonitoring({ onAction }) {
  const rows = ADMIN_DATA.campaigns;
  const statusTone = s => ({sending:'green', paused:'amber', failed:'red', completed:'slate', draft:'blue'}[s]||'slate');
  const counts = rows.reduce((a,c)=>{a[c.status]=(a[c.status]||0)+1;return a;},{});
  const totalToday = rows.reduce((a,c)=>a+c.sentToday,0);
  const totalErrors = rows.reduce((a,c)=>a+c.errors,0);

  return (
    <APanel
      title={<><i data-lucide="send" style={{width:14,height:14,color:'#3b82f6'}}></i> Campaign monitoring</>}
      subtitle={`${rows.length} campaigns · ${fmt(totalToday)} sent today · ${totalErrors} errors`}
      right={<>
        <APill tone="green" dot>{counts.sending||0} sending</APill>
        <APill tone="amber" dot>{counts.paused||0} paused</APill>
        <APill tone="red" dot>{counts.failed||0} failed</APill>
        <button style={aBtnWarn} onClick={()=>onAction('pauseAll')}><i data-lucide="pause" style={{width:12,height:12}}></i> Pause all</button>
      </>}
      pad={0}>
      <AHead cols={[
        {label:'Campaign', flex:2.4},
        {label:'Workspace', flex:1.2},
        {label:'Provider', w:92},
        {label:'Sent today', w:94, align:'right'},
        {label:'Queued', w:76, align:'right'},
        {label:'Errors', w:70, align:'right'},
        {label:'Status', w:96},
        {label:'Last event', w:92},
        {label:'', w:76, align:'right'},
      ]}/>
      <div className="ak-scroll-table">
        {rows.map(c => (
          <ARow key={c.id}>
            <div style={{flex:2.4,minWidth:0}}>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12.5,fontWeight:600,color:'#0F172A',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:'#94a3b8'}}>{c.id} · {c.owner} · {c.steps} steps · {fmt(c.contacts)} contacts</div>
            </div>
            <div style={{flex:1.2,fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#334155',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.org}</div>
            <div style={{width:92}}><APill tone={c.provider==='LinkedIn'?'violet':c.provider==='Outlook'?'blue':'cyan'}>{c.provider}</APill></div>
            <div style={{width:94,textAlign:'right',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:c.sentToday>0?'#0F172A':'#cbd5e1'}}>{fmt(c.sentToday)}</div>
            <div style={{width:76,textAlign:'right',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:c.queued>0?'#B45309':'#cbd5e1'}}>{fmt(c.queued)}</div>
            <div style={{width:70,textAlign:'right',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:c.errors>0?'#b91c1c':'#cbd5e1'}}>{c.errors}</div>
            <div style={{width:96}}><APill tone={statusTone(c.status)} dot>{c.status}</APill></div>
            <div style={{width:92,fontFamily:'DM Sans,sans-serif',fontSize:10.5,color:'#94a3b8'}}>{c.lastEvent}</div>
            <div style={{width:76,display:'flex',justifyContent:'flex-end',gap:2}}>
              <AIconBtn icon={c.status==='paused'?'play':'pause'} tone="amber" title={c.status==='paused'?'Resume':'Pause'} onClick={()=>onAction('pause', c)} disabled={c.status==='completed'||c.status==='draft'}/>
              <AIconBtn icon="square" tone="red" title="Stop campaign" onClick={()=>onAction('stop', c)} disabled={c.status==='completed'||c.status==='draft'}/>
              <AIconBtn icon="external-link" title="Open" onClick={()=>onAction('open', c)}/>
            </div>
          </ARow>
        ))}
      </div>
    </APanel>
  );
}

/* ── Queue Monitor ──────────────────────────────────── */
function QueueMonitor() {
  const q = ADMIN_DATA.queue;
  return (
    <APanel
      title={<><i data-lucide="cpu" style={{width:14,height:14,color:'#3b82f6'}}></i> Outreach queue</>}
      subtitle="lit_campaign_step_runs · live"
      right={<APill tone="green" dot>live</APill>}>
      <div className="ak-queue-tiles">
        <QMini label="Scheduled"     v={fmt(q.scheduled)}    tone="blue"  icon="clock"/>
        <QMini label="In progress"   v={fmt(q.inProgress)}   tone="cyan"  icon="loader" live/>
        <QMini label="Failed · 24h"  v={fmt(q.failed)}       tone="red"   icon="x-circle"/>
        <QMini label="Retry pending" v={fmt(q.retryPending)} tone="amber" icon="refresh-ccw"/>
      </div>
      <div style={{padding:'12px 14px',background:'#F8FAFC',border:'1px solid #E5E7EB',borderRadius:8,marginTop:12}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6,flexWrap:'wrap',gap:6}}>
          <span style={{fontFamily:'Space Grotesk,sans-serif',fontSize:10.5,fontWeight:600,color:'#64748b',letterSpacing:'0.06em',textTransform:'uppercase'}}>Throughput · last 30m</span>
          <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#0F172A',fontWeight:500}}>{q.completed24h.toLocaleString()} jobs · 24h</span>
        </div>
        <div style={{width:'100%',overflow:'hidden'}}>
          <ASpark data={q.series} w={320} h={38} stroke="#3B82F6" fill="rgba(59,130,246,0.1)"/>
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:10,gap:10,flexWrap:'wrap'}}>
        <span>Avg runtime: <span style={{color:'#0F172A',fontFamily:'JetBrains Mono,monospace',fontWeight:500}}>{q.avgRuntime}</span></span>
        <span>Oldest pending: <span style={{color:'#B45309',fontFamily:'JetBrains Mono,monospace',fontWeight:500}}>{q.oldestPending}</span></span>
      </div>
    </APanel>
  );
}

function QMini({ label, v, tone, icon, live }) {
  const c = {blue:'#3B82F6', cyan:'#06B6D4', red:'#EF4444', amber:'#F59E0B'}[tone];
  const bg = {blue:'#EFF6FF', cyan:'#ECFEFF', red:'#FEF2F2', amber:'#FFFBEB'}[tone];
  return (
    <div style={{padding:'12px 14px',background:bg,border:'1px solid #E5E7EB',borderRadius:8,minWidth:0}}>
      <div style={{display:'flex',alignItems:'center',gap:6,fontFamily:'Space Grotesk,sans-serif',fontSize:10.5,fontWeight:600,color:'#64748b',letterSpacing:'0.06em',textTransform:'uppercase'}}>
        <i data-lucide={icon} style={{width:11,height:11,color:c, animation: live?'aSpin 2s linear infinite':'none'}}></i>
        <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{label}</span>
      </div>
      <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:22,fontWeight:700,color:c,marginTop:4,letterSpacing:'-0.02em',lineHeight:1.1}}>{v}</div>
    </div>
  );
}

/* ── Error Log ──────────────────────────────────────── */
function ErrorLog({ onAction }) {
  const rows = ADMIN_DATA.queueErrors;
  return (
    <APanel
      title={<><i data-lucide="alert-octagon" style={{width:14,height:14,color:'#ef4444'}}></i> Provider errors · failed jobs</>}
      subtitle={`${rows.length} errors in the retry queue`}
      right={<button style={aBtnGhost} onClick={()=>onAction('retryAll')}><i data-lucide="refresh-ccw" style={{width:12,height:12}}></i> Retry all</button>}
      pad={0}>
      <div>
        {rows.map(e => (
          <ARow key={e.id}>
            <div style={{width:84,flexShrink:0}}>
              <APill tone={e.provider==='Gmail'?'cyan':e.provider==='Outlook'?'blue':e.provider==='PhantomBuster'?'violet':e.provider==='Stripe'?'amber':'slate'}>{e.provider}</APill>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11.5,color:'#b91c1c',fontWeight:500}}>{e.code}</span>
                <span style={{color:'#cbd5e1'}}>·</span>
                <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#94a3b8'}}>{e.campaign}</span>
              </div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#334155',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.message}</div>
            </div>
            <div className="ak-mobile-hide" style={{width:74,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:'#94a3b8',textAlign:'right'}}>try {e.attempts}</div>
            <div className="ak-mobile-hide" style={{width:72,fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#94a3b8'}}>{e.ts}</div>
            <AIconBtn icon="refresh-ccw" tone="blue" title="Retry now" onClick={()=>onAction('retry', e)}/>
          </ARow>
        ))}
      </div>
    </APanel>
  );
}

/* ── Ingestion ──────────────────────────────────────── */
function IngestionStatus() {
  const rows = ADMIN_DATA.ingestion;
  const tone = s => ({ok:'green', warning:'amber', stale:'amber', fail:'red'}[s]||'slate');
  return (
    <APanel
      title={<><i data-lucide="database-zap" style={{width:14,height:14,color:'#3b82f6'}}></i> Data & ingestion</>}
      subtitle="Supabase snapshot tables + enrichment pipelines"
      right={<button style={aBtnGhost}><i data-lucide="refresh-ccw" style={{width:12,height:12}}></i> Refresh all</button>}
      pad={0}>
      {rows.map(r => (
        <ARow key={r.name}>
          <ADot tone={tone(r.status)} live={r.status==='ok'}/>
          <div style={{flex:1.8,minWidth:0}}>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12.5,fontWeight:600,color:'#0F172A',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.name}</div>
            {r.note && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color: (r.status==='warning'||r.status==='stale')?'#B45309':'#94a3b8',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.note}</div>}
          </div>
          <div className="ak-mobile-hide" style={{width:110,fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#64748b'}}>{r.records}</div>
          <div className="ak-mobile-hide" style={{width:66,textAlign:'right',fontFamily:'JetBrains Mono,monospace',fontSize:11, color: r.deltaPct>0?'#15803d':r.deltaPct<0?'#b91c1c':'#94a3b8'}}>
            {r.deltaPct>0?`+${r.deltaPct}%`:r.deltaPct===0?'—':`${r.deltaPct}%`}
          </div>
          <div className="ak-mobile-hide" style={{width:76,fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#64748b'}}>{r.last}</div>
          <div style={{width:88}}><APill tone={tone(r.status)} dot>{r.status}</APill></div>
          <AIconBtn icon="play" tone="blue" title="Run now"/>
          <AIconBtn icon="file-search" title="View logs"/>
        </ARow>
      ))}
    </APanel>
  );
}

/* ── Feature Flags ──────────────────────────────────── */
function FeatureFlags({ role }) {
  const [flags, setFlags] = React.useState(ADMIN_DATA.flags);
  const toggle = (key, field) => setFlags(fs => fs.map(f => f.key===key ? {...f, [field]: !f[field]} : f));
  return (
    <APanel
      title={<><i data-lucide="flask-conical" style={{width:14,height:14,color:'#8b5cf6'}}></i> Feature flags · plan matrix</>}
      subtitle="Per-plan entitlement + global kill-switches · mirrors server-side resolver"
      right={<APill tone="violet" icon="shield-alert">Superadmin only</APill>}
      pad={0}>
      <AHead cols={[
        {label:'Flag', flex:2.4},
        {label:'Scope', w:84},
        {label:'Free', w:60, align:'center'},
        {label:'Growth', w:68, align:'center'},
        {label:'Scale', w:62, align:'center'},
        {label:'Enterprise', w:88, align:'center'},
        {label:'Rollout', flex:1},
        {label:'Owner', w:110},
      ]}/>
      <div className="ak-scroll-table">
        {flags.map(f => (
          <ARow key={f.key}>
            <div style={{flex:2.4,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <span style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12.5,fontWeight:600,color:'#0F172A'}}>{f.label}</span>
                <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:'#64748b',background:'#F1F5F9',border:'1px solid #E5E7EB',padding:'1px 6px',borderRadius:4}}>{f.key}</span>
                {f.globalKill && <APill tone="red" dot>killed</APill>}
              </div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#64748b',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{f.desc}</div>
            </div>
            <div style={{width:84}}><APill tone={f.scope==='global'?'amber':'slate'}>{f.scope}</APill></div>
            {['free','growth','scale','enterprise'].map((p,i)=>{
              const w = [60,68,62,88][i];
              const v = f[p];
              return (
                <div key={p} style={{width:w,display:'flex',justifyContent:'center'}}>
                  {v===null ? <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#cbd5e1'}}>—</span>
                            : <AToggle checked={v} onChange={()=>toggle(f.key, p)} disabled={role!=='super'}/>}
                </div>
              );
            })}
            <div style={{flex:1,display:'flex',alignItems:'center',gap:8,minWidth:100}}>
              <ABar value={f.rollout} max={100} tone={f.rollout===100?'green':f.rollout>50?'blue':'amber'}/>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:'#64748b',minWidth:32,textAlign:'right'}}>{f.rollout}%</span>
            </div>
            <div style={{width:110,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:'#64748b'}}>
              {f.owner}
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:10.5,color:'#94a3b8'}}>{f.updated}</div>
            </div>
          </ARow>
        ))}
      </div>
    </APanel>
  );
}

/* ── Audit Log ──────────────────────────────────────── */
function AuditLog() {
  const [filter, setFilter] = React.useState('all');
  const rows = ADMIN_DATA.audit.filter(a => filter==='all' ? true : filter==='critical' ? (a.severity==='warn'||a.severity==='error') : a.source===filter);
  const sevIcon = s => ({info:'info', warn:'alert-triangle', error:'x-octagon'}[s]||'circle');
  const sevColor = s => ({info:'#94a3b8', warn:'#f59e0b', error:'#ef4444'}[s]||'#94a3b8');
  const srcTone = s => ({admin:'blue', webhook:'violet', job:'slate', sec:'red', app:'cyan'}[s]||'slate');
  return (
    <APanel
      title={<><i data-lucide="scroll-text" style={{width:14,height:14,color:'#3b82f6'}}></i> Audit trail & events</>}
      subtitle="Every admin action · immutable · lit_audit_log"
      right={<>
        <ASelect value={filter} onChange={e=>setFilter(e.target.value)} style={{width:150}} options={[
          {value:'all',label:'All events'},
          {value:'critical',label:'Critical only'},
          {value:'admin',label:'Admin actions'},
          {value:'webhook',label:'Webhooks'},
          {value:'job',label:'System jobs'},
          {value:'sec',label:'Security'},
        ]}/>
        <button style={aBtnGhost}><i data-lucide="download" style={{width:12,height:12}}></i> Export CSV</button>
      </>}
      pad={0}>
      <div className="ak-scroll-table" style={{maxHeight:480}}>
        {rows.map(a => (
          <ARow key={a.id}>
            <div className="ak-mobile-hide" style={{width:72,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:'#94a3b8'}}>{a.ts}</div>
            <div style={{width:28,display:'flex',justifyContent:'center',flexShrink:0}}>
              <i data-lucide={sevIcon(a.severity)} style={{width:13,height:13,color:sevColor(a.severity)}}></i>
            </div>
            <div style={{width:130,minWidth:100}}>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12,fontWeight:600,color: a.actor==='system'?'#64748b':'#0F172A',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.actor}</div>
              <div className="ak-mobile-hide" style={{fontFamily:'DM Sans,sans-serif',fontSize:10.5,color:'#94a3b8'}}>{a.actorRole}</div>
            </div>
            <div className="ak-mobile-hide" style={{width:140,fontFamily:'JetBrains Mono,monospace',fontSize:11.5,color:'#1d4ed8'}}>{a.action}</div>
            <div style={{flex:1,minWidth:0,fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#334155',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.target}</div>
            <div style={{width:80}}><APill tone={srcTone(a.source)}>{a.source}</APill></div>
          </ARow>
        ))}
      </div>
    </APanel>
  );
}

Object.assign(window, {
  AdminOverview, PlanDistribution, SystemHealth, UserManagement,
  CampaignMonitoring, QueueMonitor, ErrorLog, IngestionStatus,
  FeatureFlags, AuditLog,
});
