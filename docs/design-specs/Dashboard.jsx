// Dashboard.jsx — Trade Intelligence Overview (premium v2)
'use strict';

const FLAGS = {
  'China':'🇨🇳','USA':'🇺🇸','India':'🇮🇳','Germany':'🇩🇪','Japan':'🇯🇵',
  'S.Korea':'🇰🇷','Mexico':'🇲🇽','UK':'🇬🇧','Brazil':'🇧🇷','Australia':'🇦🇺',
  'Vietnam':'🇻🇳','Canada':'🇨🇦','Morocco':'🇲🇦','Sri Lanka':'🇱🇰',
  'Italy':'🇮🇹','Netherlands':'🇳🇱','Singapore':'🇸🇬','Taiwan':'🇹🇼',
};

const MOCK_ACTIVITY = [
  { company:'Atlas Global Logistics', domain:'atlasglobal.com',  change:'+32%', dir:1,  shipments:'14,200', lastShip:'Today',      lane:['China','USA'],     activity:'Spike detected' },
  { company:'Pacific Freight Co.',    domain:'pacificfreight.co',change:'+8%',  dir:1,  shipments:'2,840',  lastShip:'3 days ago', lane:['Vietnam','USA'],   activity:'Steady' },
  { company:'Harbor Logistics Group', domain:'harborlogistics.com',change:'+14%',dir:1, shipments:'9,100',  lastShip:'4 days ago', lane:['India','USA'],     activity:'New lane' },
  { company:'Blue Ocean Express',     domain:'blueocean.io',     change:'-5%',  dir:-1, shipments:'7,800',  lastShip:'Today',      lane:['China','Mexico'],  activity:'Volume drop' },
  { company:'Meridian Cargo Partners',domain:'meridiancargo.com',change:'+2%',  dir:1,  shipments:'1,240',  lastShip:'2 days ago', lane:['Germany','USA'],   activity:'Steady' },
  { company:'Ballard Designs',        domain:'ballarddesigns.com',change:'+6%', dir:1,  shipments:'650',    lastShip:'5 days ago', lane:['Italy','USA'],     activity:'New supplier' },
];

const MOCK_OPPORTUNITIES = [
  { company:'Vanguard Trade Group',  shipments:'3,320', teu:'14.8K', spend:'$5.1M', trend:'+18%', up:true,  signal:'Activity spike' },
  { company:'RedSea Lines',          shipments:'5,600', teu:'24.1K', spend:'$7.8M', trend:'+11%', up:true,  signal:'New lane added' },
  { company:'NorthStar Freight',     shipments:'390',   teu:'1.8K',  spend:'$580K', trend:'+44%', up:true,  signal:'Rapid growth' },
  { company:'Pacific Rim Carriers',  shipments:'2,100', teu:'8.4K',  spend:'$3.2M', trend:'+9%',  up:true,  signal:'Carrier switch' },
];

const TIMELINE = [
  { icon:'trending-up', text:'Atlas Global increased shipments +32%',       time:'2h ago',    color:'#22C55E' },
  { icon:'ship',        text:'Pacific Freight — last shipment: Today',      time:'5h ago',    color:'#3B82F6' },
  { icon:'plus-circle', text:'Harbor Logistics added to Command Center',    time:'Yesterday', color:'#6366F1' },
  { icon:'send',        text:'Q2 Outreach campaign launched — 580 sent',    time:'2 days ago',color:'#F59E0B' },
  { icon:'alert-circle',text:'RedSea Lines activity spike detected (+11%)', time:'3 days ago',color:'#EF4444' },
  { icon:'file-text',   text:'RFP sent to Pacific Freight Co. — $240K',     time:'4 days ago',color:'#8B5CF6' },
];

function CompanyAvatar({ name, domain, size=24 }) {
  const [err,setErr]=React.useState(false);
  if(!domain||err){
    const palette=['#3B82F6','#6366F1','#8B5CF6','#0EA5E9','#10B981','#F59E0B','#EF4444','#14B8A6'];
    const c=palette[(name||'').charCodeAt(0)%palette.length];
    return <div style={{width:size,height:size,borderRadius:Math.floor(size*0.25),background:`linear-gradient(135deg, ${c}, ${c}cc)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.42,fontWeight:700,color:'#fff',fontFamily:'Space Grotesk,sans-serif',flexShrink:0,boxShadow:'0 1px 2px rgba(15,23,42,0.08), inset 0 0 0 1px rgba(255,255,255,0.1)'}}>{(name||'?')[0].toUpperCase()}</div>;
  }
  return <img src={`https://logo.clearbit.com/${domain}`} onError={()=>setErr(true)} alt={name} style={{width:size,height:size,borderRadius:Math.floor(size*0.25),objectFit:'contain',background:'#fff',border:'1px solid #E5E7EB',padding:2,flexShrink:0}}/>;
}

function Flag({ country, size=14 }) {
  return <span style={{fontSize:size,lineHeight:1,display:'inline-block'}}>{FLAGS[country]||'🏳️'}</span>;
}

function LaneInline({ from, to, mono=true }) {
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
      <Flag country={from} size={13}/>
      <span style={{fontFamily:mono?'JetBrains Mono,monospace':'inherit',fontSize:11.5,fontWeight:600,color:'#374151'}}>{from}</span>
      <i data-lucide="arrow-right" style={{width:10,height:10,color:'#CBD5E1'}}></i>
      <Flag country={to} size={13}/>
      <span style={{fontFamily:mono?'JetBrains Mono,monospace':'inherit',fontSize:11.5,fontWeight:600,color:'#374151'}}>{to}</span>
    </span>
  );
}

function Dashboard() {
  const [selectedLane, setSelectedLane] = React.useState('cn-us');
  const handleLane = id => setSelectedLane(prev => prev === id ? null : id);

  React.useEffect(()=>{ if(window.lucide) window.lucide.createIcons(); },[selectedLane]);

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#F8FAFC'}}>
      {/* Premium header — same DNA as CDP */}
      <DashboardHeader/>

      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'18px 24px 32px',display:'flex',flexDirection:'column',gap:16}}>

          {/* Hero row — Globe + Strategic Brief */}
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 360px',gap:16,alignItems:'stretch'}}>
            <GlobeCard selectedLane={selectedLane} onLane={handleLane}/>
            <StrategicBriefCard/>
          </div>

          {/* What Matters Now */}
          <ActivityCard rows={MOCK_ACTIVITY}/>

          {/* Two-column: Opportunities + Timeline */}
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 360px',gap:16,alignItems:'start'}}>
            <OpportunityCard rows={MOCK_OPPORTUNITIES}/>
            <TimelineCard items={TIMELINE}/>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ─── HEADER ─── */
function DashboardHeader() {
  const KPIS = [
    { label:'SAVED COMPANIES', value:'114',     trend:'+8',   up:true },
    { label:'SHIPMENTS 12M',   value:'62,400',  trend:'+12%', up:true },
    { label:'TEU 12M',         value:'218K',    trend:'+9%',  up:true },
    { label:'EST. SPEND',      value:'$84M',    trend:'+5%',  up:true },
    { label:'ACTIVE CAMPAIGNS',value:'2',       trend:'1 launching', up:null },
    { label:'NEW SIGNALS',     value:'12',      trend:'7d',   up:null },
  ];
  return (
    <div style={{background:'#FFFFFF',borderBottom:'1px solid #E5E7EB',flexShrink:0}}>
      {/* Breadcrumb / meta */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 24px 0',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,fontFamily:'DM Sans,sans-serif',color:'#64748B'}}>
          <span style={{color:'#0F172A',fontWeight:600}}>Dashboard</span>
          <span style={{color:'#CBD5E1'}}>/</span>
          <span>Trade Intelligence Overview</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#94A3B8',fontFamily:'JetBrains Mono,monospace'}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:4}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'#22C55E',boxShadow:'0 0 5px rgba(34,197,94,0.55)'}}></span>
            Live
          </span>
          <span style={{color:'#E2E8F0'}}>·</span>
          <span>Synced 2 min ago</span>
        </div>
      </div>

      {/* Title row */}
      <div style={{padding:'14px 24px 12px',display:'flex',alignItems:'flex-end',gap:14}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',marginBottom:4}}>Welcome back</div>
          <h1 style={{fontFamily:'Space Grotesk,sans-serif',fontSize:24,fontWeight:700,color:'#0F172A',letterSpacing:'-0.025em',lineHeight:1.15,margin:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Valesco Raymond</h1>
          <div style={{fontSize:12,color:'#475569',fontFamily:'DM Sans,sans-serif',marginTop:4,lineHeight:1.5}}>
            Real-time shipment intelligence across <strong style={{color:'#0F172A',fontFamily:'JetBrains Mono,monospace',fontWeight:600}}>114</strong> saved accounts ·
            <strong style={{color:'#0F172A',fontFamily:'JetBrains Mono,monospace',fontWeight:600}}> 62,400</strong> shipments tracked ·
            <strong style={{color:'#0F172A',fontFamily:'JetBrains Mono,monospace',fontWeight:600}}> 218K</strong> TEU
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <HeaderIconBtn icon="bell" title="Notifications" badge="3"/>
          <HeaderIconBtn icon="filter" title="Filters"/>
          <HeaderIconBtn icon="download" title="Export"/>
          <button style={{display:'inline-flex',alignItems:'center',gap:6,background:'#FFFFFF',border:'1px solid #E2E8F0',borderRadius:8,padding:'7px 12px',fontSize:12,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',whiteSpace:'nowrap'}}>
            <i data-lucide="search" style={{width:13,height:13}}></i>Discover Companies
          </button>
          <button style={{display:'inline-flex',alignItems:'center',gap:6,background:'linear-gradient(180deg,#3B82F6,#2563EB)',border:'none',borderRadius:8,padding:'7px 14px',fontSize:12,fontWeight:600,color:'#fff',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',boxShadow:'0 1px 3px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',whiteSpace:'nowrap'}}>
            <i data-lucide="send" style={{width:13,height:13}}></i>New Campaign
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',borderTop:'1px solid #F1F5F9',background:'#FAFBFC'}}>
        {KPIS.map((k,i)=>(
          <div key={k.label} style={{padding:'10px 16px',borderRight:i<5?'1px solid #F1F5F9':'none'}}>
            <div style={{fontSize:9,fontWeight:600,letterSpacing:'0.08em',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{k.label}</div>
            <div style={{display:'flex',alignItems:'baseline',gap:6,marginTop:3}}>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:700,color:'#0F172A',letterSpacing:'-0.01em',whiteSpace:'nowrap'}}>{k.value}</span>
              {k.trend && (
                <span style={{fontSize:10,fontWeight:600,color:k.up===true?'#15803D':k.up===false?'#B91C1C':'#94A3B8',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>
                  {k.up===true && '↑ '}{k.up===false && '↓ '}{k.trend}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeaderIconBtn({ icon, title, badge, onClick }) {
  return (
    <button onClick={onClick} title={title} style={{position:'relative',width:32,height:32,borderRadius:7,background:'#FFFFFF',border:'1px solid #E2E8F0',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#475569',transition:'all 150ms'}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor='#CBD5E1';e.currentTarget.style.background='#F8FAFC';}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='#E2E8F0';e.currentTarget.style.background='#FFFFFF';}}>
      <i data-lucide={icon} style={{width:14,height:14}}></i>
      {badge && <span style={{position:'absolute',top:-3,right:-3,minWidth:14,height:14,borderRadius:9999,background:'#EF4444',color:'#fff',fontSize:9,fontWeight:700,fontFamily:'JetBrains Mono,monospace',display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px',border:'1.5px solid #FFFFFF'}}>{badge}</span>}
    </button>
  );
}

/* ─── CARDS ─── */

function SectionCard({ title, sub, action, padded=true, children, accent }) {
  return (
    <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,boxShadow:'0 1px 2px rgba(15,23,42,0.03)',overflow:'hidden',display:'flex',flexDirection:'column'}}>
      {(title || action) && (
        <div style={{padding:'12px 16px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexShrink:0,...(accent?{background:'#FAFBFC'}:{})}}>
          <div style={{minWidth:0}}>
            {title && <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:700,color:'#0F172A',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{title}</div>}
            {sub && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#94A3B8',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{sub}</div>}
          </div>
          {action}
        </div>
      )}
      <div style={{padding:padded?16:0,flex:1,minHeight:0}}>{children}</div>
    </div>
  );
}

function GlobeCard({ selectedLane, onLane }) {
  const lanes = window.GLOBE_LANES || [];
  return (
    <SectionCard
      title="Top Active Trade Lanes"
      sub="Click a lane to focus the globe · Trailing 12-month TEU"
      action={<span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10,fontWeight:600,color:'#15803d',background:'rgba(34,197,94,0.1)',border:'1px solid #BBF7D0',padding:'3px 9px',borderRadius:9999,fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}><span style={{width:5,height:5,borderRadius:'50%',background:'#22C55E'}}></span>Live</span>}
      padded={false}
    >
      <div style={{display:'grid',gridTemplateColumns:'minmax(280px,1fr) minmax(0,1.05fr)',minHeight:340}}>
        {/* Globe */}
        <div style={{padding:'18px',display:'flex',alignItems:'center',justifyContent:'center',background:'radial-gradient(circle at 30% 30%, #F8FAFC 0%, #EEF2F7 100%)',borderRight:'1px solid #F1F5F9',position:'relative'}}>
          <div style={{position:'absolute',top:12,left:12,fontSize:9,fontWeight:700,letterSpacing:'0.1em',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase'}}>Trade Lane Map</div>
          <Globe selectedLane={selectedLane} size={280}/>
          {selectedLane && (() => {
            const lane = lanes.find(l => l.id === selectedLane);
            if (!lane) return null;
            return (
              <div style={{position:'absolute',bottom:12,left:12,right:12,background:'rgba(15,23,42,0.92)',backdropFilter:'blur(8px)',color:'#fff',borderRadius:10,padding:'10px 12px',display:'flex',alignItems:'center',gap:10,boxShadow:'0 8px 24px rgba(15,23,42,0.25)'}}>
                <Flag country={lane.from} size={18}/>
                <i data-lucide="arrow-right" style={{width:11,height:11,color:'#94A3B8'}}></i>
                <Flag country={lane.to} size={18}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11.5,fontWeight:700,fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{lane.from} → {lane.to}</div>
                  <div style={{fontSize:10,color:'#94A3B8',fontFamily:'JetBrains Mono,monospace',marginTop:1}}>{lane.shipments.toLocaleString()} ships · {lane.teu} TEU</div>
                </div>
                <span style={{fontSize:10,fontWeight:700,color:lane.up?'#86EFAC':'#FCA5A5',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>{lane.up?'↑':'↓'} {lane.trend}</span>
              </div>
            );
          })()}
        </div>

        {/* Lane list */}
        <div style={{overflowY:'auto',maxHeight:340}}>
          {lanes.map((lane,i) => {
            const isSelected = selectedLane === lane.id;
            return (
              <div key={lane.id} onClick={()=>onLane(lane.id)} style={{
                padding:'11px 14px',
                borderBottom:i<lanes.length-1?'1px solid #F1F5F9':'none',
                cursor:'pointer',
                background: isSelected ? '#EFF6FF' : 'transparent',
                transition:'background 140ms',
                borderLeft: isSelected ? '2px solid #3B82F6' : '2px solid transparent',
                display:'flex',alignItems:'center',gap:10,
              }}
                onMouseEnter={e=>{ if (!isSelected) e.currentTarget.style.background='#FAFBFC'; }}
                onMouseLeave={e=>{ if (!isSelected) e.currentTarget.style.background='transparent'; }}>
                <span style={{width:18,fontSize:9,fontWeight:700,color:isSelected?'#1d4ed8':'#94A3B8',fontFamily:'JetBrains Mono,monospace',textAlign:'center',flexShrink:0}}>{String(i+1).padStart(2,'0')}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3,whiteSpace:'nowrap'}}>
                    <Flag country={lane.from} size={14}/>
                    <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,fontWeight:600,color:isSelected?'#1d4ed8':'#0F172A'}}>{lane.from}</span>
                    <i data-lucide="arrow-right" style={{width:10,height:10,color:'#CBD5E1'}}></i>
                    <Flag country={lane.to} size={14}/>
                    <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,fontWeight:600,color:isSelected?'#1d4ed8':'#0F172A'}}>{lane.to}</span>
                  </div>
                  <div style={{display:'flex',gap:10}}>
                    <span style={{fontSize:10,color:'#64748B',fontFamily:'JetBrains Mono,monospace'}}>{lane.shipments.toLocaleString()} ships</span>
                    <span style={{fontSize:10,color:'#94A3B8',fontFamily:'JetBrains Mono,monospace'}}>{lane.teu} TEU</span>
                  </div>
                </div>
                <span style={{fontSize:10,fontWeight:700,color:lane.up?'#15803d':'#b91c1c',background:lane.up?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',padding:'2px 7px',borderRadius:9999,fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap',flexShrink:0}}>{lane.up?'↑':'↓'} {lane.trend}</span>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

function StrategicBriefCard() {
  return (
    <div style={{background:'linear-gradient(135deg,#0B1736 0%,#0F1D38 60%,#102240 100%)',border:'1px solid #1E293B',borderRadius:12,padding:'18px',position:'relative',overflow:'hidden',display:'flex',flexDirection:'column',minHeight:340}}>
      <div style={{position:'absolute',top:-40,right:-40,width:240,height:240,background:'radial-gradient(circle,rgba(0,240,255,0.18) 0%,transparent 60%)',pointerEvents:'none'}}></div>
      <div style={{position:'relative',display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <div style={{width:24,height:24,borderRadius:6,background:'linear-gradient(135deg,#00F0FF,#3B82F6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 12px rgba(0,240,255,0.4)'}}>
          <i data-lucide="sparkles" style={{width:12,height:12,color:'#0B1736'}}></i>
        </div>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.14em',color:'#7DD3FC',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase'}}>AI Trade Brief</span>
        <span style={{marginLeft:'auto',fontSize:9,fontFamily:'JetBrains Mono,monospace',color:'#64748B'}}>Today · 9:42 AM</span>
      </div>
      <div style={{position:'relative',fontFamily:'Space Grotesk,sans-serif',fontSize:16,fontWeight:700,color:'#F8FAFC',letterSpacing:'-0.01em',lineHeight:1.3,marginBottom:10}}>
        VN → US lanes are accelerating across your saved accounts.
      </div>
      <div style={{position:'relative',fontSize:12,color:'#CBD5E1',fontFamily:'DM Sans,sans-serif',lineHeight:1.55,marginBottom:14,textWrap:'pretty'}}>
        <strong style={{color:'#F8FAFC',fontWeight:600}}>78 accounts</strong> shipped in the last 30 days. Vietnam → US grew <strong style={{color:'#86EFAC'}}>+22%</strong> while CN → MX softened <strong style={{color:'#FCA5A5'}}>-5%</strong>. <strong style={{color:'#F8FAFC',fontWeight:600}}>114 of your saved accounts</strong> have no verified contacts yet.
      </div>

      {/* Insight bullets */}
      <div style={{position:'relative',display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
        {[
          { icon:'trending-up', color:'#86EFAC', text:'Rising activity across Morocco → US and Hong Kong → SF among saved accounts.' },
          { icon:'alert-circle',color:'#FCA5A5', text:'114 saved accounts have no verified contacts — outreach pending enrichment.' },
          { icon:'zap',         color:'#FCD34D', text:'78 accounts shipped in the last 30 days — prioritize for outreach.' },
        ].map((b,i)=>(
          <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
            <div style={{width:18,height:18,borderRadius:5,background:b.color+'22',border:`1px solid ${b.color}33`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
              <i data-lucide={b.icon} style={{width:10,height:10,color:b.color}}></i>
            </div>
            <div style={{fontSize:11.5,color:'#E2E8F0',fontFamily:'DM Sans,sans-serif',lineHeight:1.5,textWrap:'pretty'}}>{b.text}</div>
          </div>
        ))}
      </div>

      <div style={{position:'relative',display:'flex',gap:6,marginTop:'auto'}}>
        <button style={{flex:1,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'8px 12px',fontSize:11.5,fontWeight:600,color:'#F8FAFC',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',whiteSpace:'nowrap'}}>
          <i data-lucide="play" style={{width:11,height:11}}></i>Run Outreach
        </button>
        <button style={{flex:1,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,background:'transparent',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'8px 12px',fontSize:11.5,fontWeight:600,color:'#CBD5E1',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',whiteSpace:'nowrap'}}>
          <i data-lucide="file-text" style={{width:11,height:11}}></i>Read Brief
        </button>
      </div>
    </div>
  );
}

function ActivityCard({ rows }) {
  return (
    <SectionCard
      title="What Matters Now"
      sub="Saved accounts ranked by recent shipment activity"
      action={
        <div style={{display:'flex',gap:6}}>
          <button style={{display:'inline-flex',alignItems:'center',gap:5,background:'#F8FAFC',border:'1px solid #E5E7EB',borderRadius:7,padding:'5px 10px',fontSize:11,fontWeight:600,color:'#64748B',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',whiteSpace:'nowrap'}}>
            <i data-lucide="sliders-horizontal" style={{width:11,height:11}}></i>Filter
          </button>
          <button style={{background:'none',border:'none',color:'#3b82f6',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>View all →</button>
        </div>
      }
      padded={false}
    >
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr style={{background:'#FAFBFC'}}>
            {['Company','Shipments 12m','Last shipment','Top lane','Activity','Change',''].map((h,i) => (
              <th key={i} style={{textAlign:'left',fontSize:9,fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',padding:'9px 14px',borderBottom:'1px solid #F1F5F9',whiteSpace:'nowrap'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row,i) => (
            <tr key={i} style={{borderBottom:i<rows.length-1?'1px solid #F1F5F9':'none',cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background='#FAFBFC'}
              onMouseLeave={e=>e.currentTarget.style.background=''}>
              <td style={{padding:'10px 14px'}}>
                <div style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}>
                  <CompanyAvatar name={row.company} domain={row.domain} size={28}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{row.company}</div>
                    <div style={{fontSize:10,color:'#94A3B8',fontFamily:'JetBrains Mono,monospace',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{row.domain}</div>
                  </div>
                </div>
              </td>
              <td style={{padding:'10px 14px'}}><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:13,fontWeight:600,color:'#0F172A'}}>{row.shipments}</span></td>
              <td style={{padding:'10px 14px'}}><span style={{fontSize:12,color:'#64748B',fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}>{row.lastShip}</span></td>
              <td style={{padding:'10px 14px'}}><LaneInline from={row.lane[0]} to={row.lane[1]}/></td>
              <td style={{padding:'10px 14px'}}><span style={{fontSize:11,color:'#475569',fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}>{row.activity}</span></td>
              <td style={{padding:'10px 14px'}}>
                <span style={{fontSize:11,fontWeight:700,fontFamily:'Space Grotesk,sans-serif',color: row.dir>0?'#15803d':'#b91c1c',background:row.dir>0?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',padding:'2px 8px',borderRadius:9999,whiteSpace:'nowrap'}}>
                  {row.dir>0?'↑':'↓'} {row.change}
                </span>
              </td>
              <td style={{padding:'10px 14px',textAlign:'right'}}>
                <button style={{fontSize:11,fontWeight:600,background:'transparent',color:'#3b82f6',border:'none',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>Enrich →</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

function OpportunityCard({ rows }) {
  return (
    <SectionCard
      title="High-Opportunity Companies"
      sub="High volume · Recent activity spike · Not yet engaged"
      action={<button style={{background:'none',border:'none',color:'#3b82f6',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>View all →</button>}
      padded={false}
    >
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr style={{background:'#FAFBFC'}}>
            {['Company','Shipments','TEU','Spend','Signal','Trend','Action'].map((h,i) => (
              <th key={i} style={{textAlign:'left',fontSize:9,fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',padding:'9px 14px',borderBottom:'1px solid #F1F5F9',whiteSpace:'nowrap'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row,i) => (
            <tr key={i} style={{borderBottom:i<rows.length-1?'1px solid #F1F5F9':'none',cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background='#FAFBFC'}
              onMouseLeave={e=>e.currentTarget.style.background=''}>
              <td style={{padding:'10px 14px'}}>
                <div style={{display:'flex',alignItems:'center',gap:9}}>
                  <CompanyAvatar name={row.company} size={28}/>
                  <span style={{fontSize:13,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>{row.company}</span>
                </div>
              </td>
              <td style={{padding:'10px 14px'}}><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:13,fontWeight:600,color:'#0F172A'}}>{row.shipments}</span></td>
              <td style={{padding:'10px 14px'}}><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'#374151'}}>{row.teu}</span></td>
              <td style={{padding:'10px 14px'}}><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'#374151'}}>{row.spend}</span></td>
              <td style={{padding:'10px 14px'}}>
                <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,fontWeight:600,color:'#6D28D9',background:'#F5F3FF',border:'1px solid #DDD6FE',padding:'2px 7px',borderRadius:4,fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>
                  <i data-lucide="zap" style={{width:9,height:9}}></i>{row.signal}
                </span>
              </td>
              <td style={{padding:'10px 14px'}}>
                <span style={{fontSize:11,fontWeight:700,color:'#15803d',background:'rgba(34,197,94,0.1)',padding:'2px 8px',borderRadius:9999,fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>↑ {row.trend}</span>
              </td>
              <td style={{padding:'10px 14px'}}>
                <div style={{display:'flex',gap:5}}>
                  <button style={{fontSize:11,fontWeight:600,background:'#FFFFFF',color:'#374151',border:'1px solid #E2E8F0',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>View</button>
                  <button style={{fontSize:11,fontWeight:600,background:'linear-gradient(180deg,#3B82F6,#2563EB)',color:'#fff',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap',boxShadow:'0 1px 2px rgba(59,130,246,0.3), inset 0 1px 0 rgba(255,255,255,0.18)'}}>+ Campaign</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

function TimelineCard({ items }) {
  return (
    <SectionCard title="Recent Changes" sub="Intelligence signals & activity" padded={true}>
      <div style={{display:'flex',flexDirection:'column',position:'relative'}}>
        <div style={{position:'absolute',left:13,top:14,bottom:14,width:1,background:'#F1F5F9'}}></div>
        {items.map((item,i) => (
          <div key={i} style={{display:'flex',gap:10,padding:'7px 0',alignItems:'flex-start',position:'relative',zIndex:1}}>
            <div style={{width:26,height:26,borderRadius:7,background:'#FFFFFF',border:`1.5px solid ${item.color}55`,boxShadow:`0 0 0 3px ${item.color}10`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <i data-lucide={item.icon} style={{width:11,height:11,color:item.color}}></i>
            </div>
            <div style={{flex:1,minWidth:0,paddingTop:1}}>
              <div style={{fontSize:12,color:'#374151',fontFamily:'DM Sans,sans-serif',lineHeight:1.4,textWrap:'pretty'}}>{item.text}</div>
              <div style={{fontSize:10,color:'#94A3B8',fontFamily:'JetBrains Mono,monospace',marginTop:2,whiteSpace:'nowrap'}}>{item.time}</div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

Object.assign(window, { Dashboard });
