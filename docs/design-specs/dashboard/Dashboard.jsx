// Dashboard.jsx — Intelligence Command Overview
'use strict';

const MOCK_ACTIVITY = [
  { company:'Atlas Global Logistics',  change:'+32%', dir:1,  shipments:'14,200', lastShip:'Today',       carrier:'MSC'      },
  { company:'Pacific Freight Co.',     change:'+8%',  dir:1,  shipments:'2,840',  lastShip:'3 days ago',  carrier:'Maersk'   },
  { company:'Harbor Logistics Group',  change:'+14%', dir:1,  shipments:'9,100',  lastShip:'4 days ago',  carrier:'Yang Ming'},
  { company:'Blue Ocean Express',      change:'-5%',  dir:-1, shipments:'7,800',  lastShip:'Today',       carrier:'ONE'      },
  { company:'Meridian Cargo Partners', change:'+2%',  dir:1,  shipments:'1,240',  lastShip:'2 days ago',  carrier:'CMA CGM'  },
];

const MOCK_OPPORTUNITIES = [
  { company:'Vanguard Trade Group',  shipments:'3,320', teu:'14.8K', spend:'$5.1M', trend:'+18%', up:true,  engaged:false },
  { company:'RedSea Lines',          shipments:'5,600', teu:'24.1K', spend:'$7.8M', trend:'+11%', up:true,  engaged:false },
  { company:'NorthStar Freight',     shipments:'390',   teu:'1.8K',  spend:'$580K', trend:'+44%', up:true,  engaged:false },
  { company:'Pacific Rim Carriers',  shipments:'2,100', teu:'8.4K',  spend:'$3.2M', trend:'+9%',  up:true,  engaged:false },
];

const TIMELINE = [
  { icon:'trending-up', text:'Atlas Global increased shipments +32%',       time:'2h ago',    color:'#22C55E' },
  { icon:'ship',        text:'Pacific Freight — last shipment: Today',      time:'5h ago',    color:'#3B82F6' },
  { icon:'plus-circle', text:'Harbor Logistics added to Command Center',    time:'Yesterday', color:'#6366F1' },
  { icon:'send',        text:'Q2 Outreach campaign launched — 580 sent',    time:'2 days ago',color:'#F59E0B' },
  { icon:'alert-circle',text:'RedSea Lines activity spike detected (+11%)', time:'3 days ago',color:'#EF4444' },
  { icon:'file-text',   text:'RFP sent to Pacific Freight Co. — $240K',     time:'4 days ago',color:'#8B5CF6' },
];

function Dashboard() {
  const [selectedLane, setSelectedLane] = React.useState('cn-us');

  function handleLane(id) {
    setSelectedLane(prev => prev === id ? null : id);
  }

  return (
    <div style={D.wrap}>
      {/* Header */}
      <div style={D.header}>
        <div style={{flex:1}}>
          <div style={D.pageTitle}>Dashboard</div>
          <div style={D.pageSub}>Real-time shipment intelligence and opportunity signals</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {[
            {icon:'building-2',  label:'Add Company'},
            {icon:'send',        label:'Start Campaign'},
            {icon:'file-text',   label:'Generate Quote'},
          ].map(a => (
            <button key={a.label} style={D.actionBtn}>
              <i data-lucide={a.icon} style={{width:13,height:13}}></i>{a.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'0 24px 24px'}}>
        {/* KPI Row */}
        <div style={D.kpiRow}>
          {[
            { label:'Active Companies',    value:'34',     sub:'Last 7 days',    icon:'building-2',  color:'#3B82F6' },
            { label:'Total Shipments 12m', value:'62,400', sub:'All saved cos',  icon:'package',     color:'#6366F1' },
            { label:'Total TEU 12m',       value:'218K',   sub:'All saved cos',  icon:'layers',      color:'#10B981' },
            { label:'Est. Spend 12m',      value:'$84M',   sub:'All saved cos',  icon:'dollar-sign', color:'#F59E0B' },
            { label:'New Opportunities',   value:'12',     sub:'Last 7 days',    icon:'zap',         color:'#EF4444' },
          ].map(k => (
            <div key={k.label} style={D.kpiCard}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
                <div style={{width:32,height:32,borderRadius:8,background:k.color+'18',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <i data-lucide={k.icon} style={{width:15,height:15,color:k.color}}></i>
                </div>
                <span style={{fontSize:10,fontWeight:600,color:'#22C55E',background:'rgba(34,197,94,0.1)',padding:'2px 7px',borderRadius:9999,fontFamily:'Space Grotesk,sans-serif'}}>↑ Live</span>
              </div>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:22,fontWeight:700,color:'#0F172A',letterSpacing:'-0.01em'}}>{k.value}</div>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:11,fontWeight:600,color:'#374151',marginTop:2}}>{k.label}</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#94A3B8',marginTop:1}}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Main 2-col grid */}
        <div style={D.mainGrid}>
          {/* LEFT COLUMN */}
          <div style={{display:'flex',flexDirection:'column',gap:16,minWidth:0}}>

            {/* What Matters Now */}
            <div style={D.card}>
              <div style={D.cardHeader}>
                <div>
                  <div style={D.cardTitle}>What Matters Now</div>
                  <div style={D.cardSub}>Active shipment activity across saved companies</div>
                </div>
                <span style={D.livePill}><span style={D.liveDot}></span>Live</span>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    {['Company','Shipments','Last Shipment','Carrier','Change'].map(h => (
                      <th key={h} style={D.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MOCK_ACTIVITY.map((row,i) => (
                    <tr key={i} style={{borderBottom:'1px solid #F1F5F9',cursor:'pointer'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'}
                      onMouseLeave={e=>e.currentTarget.style.background=''}>
                      <td style={D.td}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:24,height:24,borderRadius:6,background:companyColor(row.company),display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',flexShrink:0}}>{row.company[0]}</div>
                          <span style={{fontSize:13,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif'}}>{row.company}</span>
                        </div>
                      </td>
                      <td style={D.td}><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:13,fontWeight:600,color:'#1d4ed8'}}>{row.shipments}</span></td>
                      <td style={D.td}><span style={{fontSize:12,color:'#64748b',fontFamily:'DM Sans,sans-serif'}}>{row.lastShip}</span></td>
                      <td style={D.td}><span style={{fontSize:12,color:'#64748b',fontFamily:'DM Sans,sans-serif'}}>{row.carrier}</span></td>
                      <td style={D.td}>
                        <span style={{fontSize:12,fontWeight:700,fontFamily:'Space Grotesk,sans-serif',color: row.dir>0?'#15803d':'#b91c1c',background:row.dir>0?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',padding:'2px 8px',borderRadius:9999}}>
                          {row.dir>0?'↑':'↓'} {row.change}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Opportunity Signals */}
            <div style={D.card}>
              <div style={D.cardHeader}>
                <div>
                  <div style={D.cardTitle}>High-Opportunity Companies</div>
                  <div style={D.cardSub}>High volume · Recent activity spike · Not yet engaged</div>
                </div>
                <button style={D.ghostBtn}><i data-lucide="sliders-horizontal" style={{width:12,height:12}}></i> Filter</button>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    {['Company','Shipments','TEU','Est. Spend','Trend','Action'].map(h => (
                      <th key={h} style={D.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MOCK_OPPORTUNITIES.map((row,i) => (
                    <tr key={i} style={{borderBottom:'1px solid #F1F5F9',cursor:'pointer'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'}
                      onMouseLeave={e=>e.currentTarget.style.background=''}>
                      <td style={D.td}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:24,height:24,borderRadius:6,background:companyColor(row.company),display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',flexShrink:0}}>{row.company[0]}</div>
                          <span style={{fontSize:13,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif'}}>{row.company}</span>
                        </div>
                      </td>
                      <td style={D.td}><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:13,fontWeight:600,color:'#1d4ed8'}}>{row.shipments}</span></td>
                      <td style={D.td}><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'#374151'}}>{row.teu}</span></td>
                      <td style={D.td}><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'#374151'}}>{row.spend}</span></td>
                      <td style={D.td}>
                        <span style={{fontSize:11,fontWeight:700,color:'#15803d',background:'rgba(34,197,94,0.1)',padding:'2px 7px',borderRadius:9999,fontFamily:'Space Grotesk,sans-serif'}}>↑ {row.trend}</span>
                      </td>
                      <td style={D.td}>
                        <div style={{display:'flex',gap:5}}>
                          <button style={{fontSize:11,fontWeight:600,background:'#EFF6FF',color:'#3b82f6',border:'1px solid #BFDBFE',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>View</button>
                          <button style={{fontSize:11,fontWeight:600,background:'linear-gradient(180deg,#3B82F6,#2563EB)',color:'#fff',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>+ Campaign</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{display:'flex',flexDirection:'column',gap:16,minWidth:0}}>

            {/* Globe + Trade Lanes */}
            <div style={{...D.card,padding:0,overflow:'hidden'}}>
              <div style={{padding:'16px 18px 12px',borderBottom:'1px solid #F1F5F9'}}>
                <div style={D.cardTitle}>Top Active Trade Lanes</div>
                <div style={D.cardSub}>Click a lane to focus the globe</div>
              </div>
              <div style={{display:'flex',gap:0}}>
                {/* Globe */}
                <div style={{padding:'16px',display:'flex',alignItems:'center',justifyContent:'center',background:'#F8FAFC',borderRight:'1px solid #F1F5F9'}}>
                  <Globe selectedLane={selectedLane} size={240} />
                </div>

                {/* Lane list */}
                <div style={{flex:1,overflowY:'auto',maxHeight:290}}>
                  {GLOBE_LANES.map(lane => {
                    const isSelected = selectedLane === lane.id;
                    return (
                      <div key={lane.id} onClick={()=>handleLane(lane.id)} style={{
                        padding:'10px 14px',
                        borderBottom:'1px solid #F1F5F9',
                        cursor:'pointer',
                        background: isSelected ? '#EFF6FF' : 'transparent',
                        transition:'background 140ms',
                        borderLeft: isSelected ? '2px solid #3B82F6' : '2px solid transparent',
                      }}
                        onMouseEnter={e=>{ if (!isSelected) e.currentTarget.style.background='#F8FAFC'; }}
                        onMouseLeave={e=>{ if (!isSelected) e.currentTarget.style.background='transparent'; }}
                      >
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
                          <div style={{display:'flex',alignItems:'center',gap:5}}>
                            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,fontWeight:600,color: isSelected?'#1d4ed8':'#374151'}}>{lane.from}</span>
                            <i data-lucide="arrow-right" style={{width:10,height:10,color:'#CBD5E1'}}></i>
                            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,fontWeight:600,color: isSelected?'#1d4ed8':'#374151'}}>{lane.to}</span>
                          </div>
                          <span style={{fontSize:10,fontWeight:700,color: lane.up?'#15803d':'#b91c1c',background: lane.up?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',padding:'1px 6px',borderRadius:9999,fontFamily:'Space Grotesk,sans-serif'}}>{lane.trend}</span>
                        </div>
                        <div style={{display:'flex',gap:10}}>
                          <span style={{fontSize:10,color:'#94A3B8',fontFamily:'JetBrains Mono,monospace'}}>{lane.shipments.toLocaleString()} ships</span>
                          <span style={{fontSize:10,color:'#94A3B8',fontFamily:'JetBrains Mono,monospace'}}>{lane.teu} TEU</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected lane detail bar */}
              {selectedLane && (() => {
                const lane = GLOBE_LANES.find(l => l.id === selectedLane);
                if (!lane) return null;
                return (
                  <div style={{padding:'10px 16px',background:'#EFF6FF',borderTop:'1px solid #BFDBFE',display:'flex',gap:16,alignItems:'center'}}>
                    <div style={{fontSize:12,fontWeight:600,color:'#1d4ed8',fontFamily:'Space Grotesk,sans-serif'}}>{lane.from} → {lane.to}</div>
                    <div style={{display:'flex',gap:12,marginLeft:'auto'}}>
                      <span style={{fontSize:11,color:'#64748b',fontFamily:'DM Sans,sans-serif'}}>Ships: <strong style={{color:'#1d4ed8',fontFamily:'JetBrains Mono,monospace'}}>{lane.shipments.toLocaleString()}</strong></span>
                      <span style={{fontSize:11,color:'#64748b',fontFamily:'DM Sans,sans-serif'}}>TEU: <strong style={{color:'#1d4ed8',fontFamily:'JetBrains Mono,monospace'}}>{lane.teu}</strong></span>
                      <span style={{fontSize:11,fontWeight:700,color: lane.up?'#15803d':'#b91c1c'}}>{lane.up?'↑':'↓'} {lane.trend}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Recent Changes Timeline */}
            <div style={D.card}>
              <div style={D.cardHeader}>
                <div>
                  <div style={D.cardTitle}>Recent Changes</div>
                  <div style={D.cardSub}>Intelligence signals and activity updates</div>
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:0}}>
                {TIMELINE.map((item,i) => (
                  <div key={i} style={{display:'flex',gap:10,padding:'9px 0',borderBottom: i<TIMELINE.length-1?'1px solid #F8FAFC':'none',alignItems:'flex-start'}}>
                    <div style={{width:26,height:26,borderRadius:7,background:item.color+'15',border:`1px solid ${item.color}25`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
                      <i data-lucide={item.icon} style={{width:12,height:12,color:item.color}}></i>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,color:'#374151',fontFamily:'DM Sans,sans-serif',lineHeight:1.4,textWrap:'pretty'}}>{item.text}</div>
                    </div>
                    <span style={{fontSize:10,color:'#CBD5E1',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap',marginTop:2}}>{item.time}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

const D = {
  wrap:      { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#F8FAFC' },
  header:    { padding:'20px 24px 16px', borderBottom:'1px solid #E5E7EB', background:'#FFFFFF', flexShrink:0, display:'flex', alignItems:'center', gap:16 },
  pageTitle: { fontFamily:'Space Grotesk,sans-serif', fontSize:20, fontWeight:700, color:'#0F172A', letterSpacing:'-0.02em' },
  pageSub:   { fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginTop:2 },
  actionBtn: { display:'flex', alignItems:'center', gap:5, background:'#FFFFFF', border:'1px solid #E5E7EB', borderRadius:8, padding:'7px 13px', fontSize:12, fontWeight:600, fontFamily:'Space Grotesk,sans-serif', color:'#374151', cursor:'pointer' },
  kpiRow:    { display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, padding:'16px 0' },
  kpiCard:   { background:'linear-gradient(180deg,#FFFFFF,#F8FAFC)', border:'1px solid #E5E7EB', borderRadius:14, padding:'16px', boxShadow:'0 8px 30px rgba(15,23,42,0.06)' },
  mainGrid:  { display:'grid', gridTemplateColumns:'1fr 380px', gap:16, alignItems:'start' },
  card:      { background:'#FFFFFF', border:'1px solid #E5E7EB', borderRadius:14, padding:'16px 18px', boxShadow:'0 8px 30px rgba(15,23,42,0.06)' },
  cardHeader:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 },
  cardTitle: { fontFamily:'Space Grotesk,sans-serif', fontSize:14, fontWeight:700, color:'#0F172A' },
  cardSub:   { fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#94A3B8', marginTop:2 },
  th:        { textAlign:'left', fontSize:9, fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:'#94A3B8', fontFamily:'Space Grotesk,sans-serif', paddingBottom:8, paddingLeft:6, borderBottom:'1px solid #F1F5F9' },
  td:        { padding:'9px 6px', fontSize:13, verticalAlign:'middle' },
  livePill:  { display:'flex', alignItems:'center', gap:5, fontSize:11, fontWeight:600, color:'#15803d', background:'rgba(34,197,94,0.1)', padding:'3px 10px', borderRadius:9999, fontFamily:'Space Grotesk,sans-serif', flexShrink:0 },
  liveDot:   { width:6, height:6, borderRadius:'50%', background:'#22C55E', boxShadow:'0 0 5px rgba(34,197,94,0.6)', display:'inline-block' },
  ghostBtn:  { display:'flex', alignItems:'center', gap:5, background:'#F8FAFC', border:'1px solid #E5E7EB', borderRadius:7, padding:'5px 11px', fontSize:11, fontWeight:600, color:'#64748b', fontFamily:'Space Grotesk,sans-serif', cursor:'pointer' },
};

Object.assign(window, { Dashboard });
