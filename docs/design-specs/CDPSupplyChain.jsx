// CDPSupplyChain.jsx — Supply Chain / Overview tab
'use strict';

const SC_LANES = [
  { id:'l1', from:'Vietnam', to:'USA',  share:'74%', shipments:121, teu:178, trend:'+18%', up:true,  status:'Primary' },
  { id:'l2', from:'Singapore',to:'USA', share:'16%', shipments:21,  teu:28,  trend:'+4%',  up:true,  status:'Active'  },
  { id:'l3', from:'China',   to:'USA',  share:'8%',  shipments:11,  teu:14,  trend:'-22%', up:false, status:'Declining' },
  { id:'l4', from:'Taiwan',  to:'USA',  share:'2%',  shipments:3,   teu:4,   trend:'New',  up:true,  status:'Emerging' },
];

const SC_FORWARDERS = [
  { name:'Maersk',           share:'42.1%', status:'Primary',   color:'#3B82F6', trend:'+6%',  up:true },
  { name:'CMA CGM',          share:'24.8%', status:'Active',    color:'#6366F1', trend:'+2%',  up:true },
  { name:'ONE',              share:'18.3%', status:'Active',    color:'#8B5CF6', trend:'-1%',  up:false },
  { name:'Hapag-Lloyd',      share:'9.4%',  status:'Active',    color:'#0EA5E9', trend:'+12%', up:true },
  { name:'Yang Ming',        share:'5.4%',  status:'New \u201926',    color:'#10B981', trend:'New',  up:true },
];

function MiniBar({ data, h=64 }) {
  const max = Math.max(...data.map(d=>d.v), 1);
  return (
    <div style={{display:'flex',alignItems:'flex-end',gap:4,height:h+18}}>
      {data.map((d,i)=>(
        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',height:'100%'}}>
          <div style={{width:'100%',height:`${(d.v/max)*h}px`,minHeight:2,background:d.active?'#3B82F6':'#DBEAFE',borderRadius:'3px 3px 0 0'}}></div>
          <span style={{fontSize:9,color:'#94A3B8',marginTop:4,fontFamily:'Space Grotesk,sans-serif'}}>{d.l}</span>
        </div>
      ))}
    </div>
  );
}

function Sparkline({ values, color='#3B82F6', w=120, h=28 }) {
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v,i) => {
    const x = (i/(values.length-1))*w;
    const y = h - ((v-min)/(max-min||1))*h;
    return `${x},${y}`;
  }).join(' ');
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polygon points={area} fill={color} opacity="0.1"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

function SubTab({ active, children, onClick }) {
  return (
    <button onClick={onClick} style={{background:active?'#FFFFFF':'transparent',border:`1px solid ${active?'#E2E8F0':'transparent'}`,borderRadius:7,padding:'5px 12px',fontSize:12,fontWeight:600,color:active?'#0F172A':'#64748B',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',boxShadow:active?'0 1px 2px rgba(15,23,42,0.04)':'none',whiteSpace:'nowrap'}}>
      {children}
    </button>
  );
}

function SectionCard({ title, sub, action, children, padded=true }) {
  return (
    <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,boxShadow:'0 1px 2px rgba(15,23,42,0.03)'}}>
      {(title || action) && (
        <div style={{padding:'12px 16px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            {title && <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:700,color:'#0F172A',whiteSpace:'nowrap'}}>{title}</div>}
            {sub && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#94A3B8',marginTop:1}}>{sub}</div>}
          </div>
          {action}
        </div>
      )}
      <div style={{padding:padded?16:0}}>{children}</div>
    </div>
  );
}

function CDPSupplyChain({ company }) {
  const [sub, setSub] = React.useState('summary');
  const monthly = [
    {l:'Apr',v:42,active:false},{l:'May',v:38,active:false},{l:'Jun',v:55,active:false},
    {l:'Jul',v:62,active:false},{l:'Aug',v:78,active:false},{l:'Sep',v:69,active:false},
    {l:'Oct',v:85,active:false},{l:'Nov',v:92,active:false},{l:'Dec',v:71,active:false},
    {l:'Jan',v:48,active:false},{l:'Feb',v:64,active:false},{l:'Mar',v:103,active:true},
  ];
  const sparkA = [12,14,18,16,22,28,24,30,34,38,36,42];
  const sparkB = [22,28,24,18,12,15,10,14,9,7,5,6];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* Sub-tabs */}
      <div style={{display:'flex',alignItems:'center',gap:6,background:'#F1F5F9',borderRadius:9,padding:4,alignSelf:'flex-start',flexWrap:'nowrap'}}>
        {[
          {id:'summary',label:'Summary'},
          {id:'lanes',label:'Trade Lanes'},
          {id:'providers',label:'Service Providers'},
          {id:'shipments',label:'Shipments'},
          {id:'products',label:'Products'},
        ].map(s=> <SubTab key={s.id} active={sub===s.id} onClick={()=>setSub(s.id)}>{s.label}</SubTab>)}
      </div>

      {/* Strategic Brief — premium accent card */}
      <div style={{background:'linear-gradient(135deg,#0B1736 0%,#0F1D38 60%,#102240 100%)',border:'1px solid #1E293B',borderRadius:12,padding:'16px 18px',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',top:0,right:0,width:240,height:240,background:'radial-gradient(circle,rgba(0,240,255,0.15) 0%,transparent 60%)',pointerEvents:'none'}}></div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#00F0FF',fontFamily:'Space Grotesk,sans-serif',textShadow:'0 0 8px rgba(0,240,255,0.4)'}}>What matters now</span>
          <span style={{height:1,width:32,background:'rgba(0,240,255,0.3)'}}></span>
          <span style={{fontSize:9,fontWeight:600,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif'}}>Updated 2h ago</span>
        </div>
        <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:18,fontWeight:600,color:'#F8FAFC',letterSpacing:'-0.01em',lineHeight:1.4,marginBottom:8,position:'relative'}}>
          Vietnam → USA is the strongest visible lane — <span style={{color:'#00F0FF'}}>74% of trailing-12m volume</span>, growing +18% YoY.
        </div>
        <div style={{fontSize:13,color:'#CBD5E1',fontFamily:'DM Sans,sans-serif',lineHeight:1.55,position:'relative',maxWidth:680}}>
          Hp ran 163 shipments over the trailing 12 months, totaling 241 TEU. <strong style={{color:'#F8FAFC'}}>3 reachable trade lanes</strong> across 6 countries. China lane is declining (-22%) — opening for VN/SG capacity expansion.
        </div>
        <div style={{display:'flex',gap:6,marginTop:12,position:'relative'}}>
          {['Forwarder displacement','Tariff exposure','Lane consolidation'].map(t => (
            <span key={t} style={{fontSize:10,fontWeight:600,color:'#00F0FF',background:'rgba(0,240,255,0.08)',border:'1px solid rgba(0,240,255,0.2)',borderRadius:4,padding:'2px 8px',fontFamily:'Space Grotesk,sans-serif'}}>{t}</span>
          ))}
        </div>
      </div>

      {/* Two-column row: Cadence + Lanes */}
      <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr',gap:14}}>
        <SectionCard title="Monthly shipment cadence" sub="Trailing 12 months · FCL & LCL"
          action={<div style={{display:'flex',gap:4}}>
            <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,color:'#64748B',fontFamily:'DM Sans,sans-serif'}}><span style={{width:8,height:8,borderRadius:2,background:'#3B82F6'}}></span>FCL</span>
            <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,color:'#64748B',fontFamily:'DM Sans,sans-serif',marginLeft:8}}><span style={{width:8,height:8,borderRadius:2,background:'#DBEAFE'}}></span>Prev yr</span>
          </div>}>
          <MiniBar data={monthly} h={92}/>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8,paddingTop:10,borderTop:'1px solid #F1F5F9'}}>
            <div>
              <div style={{fontSize:10,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',letterSpacing:'0.06em',textTransform:'uppercase'}}>Peak month</div>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:14,fontWeight:700,color:'#0F172A'}}>Mar · 103</div>
            </div>
            <div>
              <div style={{fontSize:10,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',letterSpacing:'0.06em',textTransform:'uppercase'}}>Avg / mo</div>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:14,fontWeight:700,color:'#0F172A'}}>67</div>
            </div>
            <div>
              <div style={{fontSize:10,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',letterSpacing:'0.06em',textTransform:'uppercase'}}>YoY</div>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:14,fontWeight:700,color:'#15803D'}}>+12%</div>
            </div>
            <div>
              <div style={{fontSize:10,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',letterSpacing:'0.06em',textTransform:'uppercase'}}>Seasonality</div>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:14,fontWeight:700,color:'#0F172A'}}>Q3–Q4 peak</div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Top trade lanes" sub="By trailing-12m TEU share"
          action={<button style={{background:'none',border:'none',color:'#3b82f6',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>View all →</button>}
          padded={false}>
          <div>
            {SC_LANES.map((lane,i) => (
              <div key={lane.id} style={{padding:'10px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:i<SC_LANES.length-1?'1px solid #F1F5F9':'none'}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:lane.up?'#22C55E':'#EF4444'}}></div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif'}}>
                    {lane.from} <span style={{color:'#94A3B8'}}>→</span> {lane.to}
                    {lane.status==='Primary' && <span style={{fontSize:9,fontWeight:700,color:'#1d4ed8',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:3,padding:'1px 5px',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.04em'}}>Primary</span>}
                    {lane.status==='Emerging' && <span style={{fontSize:9,fontWeight:700,color:'#15803D',background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:3,padding:'1px 5px',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.04em'}}>New</span>}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginTop:3}}>
                    <div style={{flex:1,height:4,background:'#F1F5F9',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:lane.share,background:lane.up?'linear-gradient(90deg,#3B82F6,#6366F1)':'#94A3B8',borderRadius:2}}></div>
                    </div>
                    <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,fontWeight:600,color:'#475569',width:32,textAlign:'right'}}>{lane.share}</span>
                  </div>
                </div>
                <div style={{textAlign:'right',minWidth:60}}>
                  <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,fontWeight:600,color:'#0F172A'}}>{lane.shipments} ship</div>
                  <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'#64748B'}}>{lane.teu} TEU</div>
                </div>
                <span style={{fontSize:10,fontWeight:700,color:lane.up?'#15803D':'#B91C1C',fontFamily:'Space Grotesk,sans-serif',width:46,textAlign:'right'}}>{lane.up?'↑':'↓'} {lane.trend}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Forwarders + Modes */}
      <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr',gap:14}}>
        <SectionCard title="Current forwarders" sub="Carrier mix · trailing 12m share"
          action={<span style={{fontSize:10,fontWeight:600,color:'#64748B',fontFamily:'JetBrains Mono,monospace'}}>5 carriers</span>}
          padded={false}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:'1px solid #F1F5F9',background:'#FAFBFC'}}>
                {['Forwarder','Share','Trend','Status'].map(h=>(
                  <th key={h} style={{textAlign:'left',padding:'8px 16px',fontSize:9,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SC_FORWARDERS.map((f,i) => (
                <tr key={f.name} style={{borderBottom:i<SC_FORWARDERS.length-1?'1px solid #F1F5F9':'none'}}>
                  <td style={{padding:'10px 16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:18,height:18,borderRadius:4,background:f.color+'18',display:'flex',alignItems:'center',justifyContent:'center',color:f.color,fontSize:10,fontWeight:700,fontFamily:'Space Grotesk,sans-serif'}}>{f.name[0]}</div>
                      <span style={{fontSize:12,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif'}}>{f.name}</span>
                    </div>
                  </td>
                  <td style={{padding:'10px 16px',width:140}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{flex:1,height:4,background:'#F1F5F9',borderRadius:2,overflow:'hidden'}}>
                        <div style={{height:'100%',width:f.share,background:f.color,borderRadius:2}}></div>
                      </div>
                      <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,fontWeight:600,color:'#475569',width:38,textAlign:'right'}}>{f.share}</span>
                    </div>
                  </td>
                  <td style={{padding:'10px 16px',width:80}}>
                    <span style={{fontSize:11,fontWeight:600,color:f.up?'#15803D':'#B91C1C',fontFamily:'Space Grotesk,sans-serif'}}>{f.up?'↑':'↓'} {f.trend}</span>
                  </td>
                  <td style={{padding:'10px 16px',width:96}}>
                    <span style={{fontSize:10,fontWeight:600,color:f.status==='Primary'?'#1d4ed8':'#64748B',background:f.status==='Primary'?'#EFF6FF':'#F1F5F9',border:`1px solid ${f.status==='Primary'?'#BFDBFE':'#E2E8F0'}`,borderRadius:4,padding:'2px 7px',fontFamily:'Space Grotesk,sans-serif'}}>{f.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title="Imports by mode" sub="Modal split · 163 shipments">
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {[
              {mode:'Ocean FCL', count:148, pct:91, color:'#3B82F6', icon:'ship'},
              {mode:'Ocean LCL', count:11,  pct:7,  color:'#6366F1', icon:'layers'},
              {mode:'Air',       count:3,   pct:2,  color:'#8B5CF6', icon:'plane'},
              {mode:'Rail',      count:1,   pct:1,  color:'#10B981', icon:'train'},
            ].map(m => (
              <div key={m.mode} style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:24,height:24,borderRadius:6,background:m.color+'18',display:'flex',alignItems:'center',justifyContent:'center',color:m.color,flexShrink:0}}>
                  <i data-lucide={m.icon} style={{width:12,height:12}}></i>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:3}}>
                    <span style={{fontSize:12,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif'}}>{m.mode}</span>
                    <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#475569'}}>{m.count} <span style={{color:'#94A3B8'}}>· {m.pct}%</span></span>
                  </div>
                  <div style={{height:4,background:'#F1F5F9',borderRadius:2,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${m.pct}%`,background:m.color,borderRadius:2}}></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Recent shipments + Suppliers */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <SectionCard title="Recent shipments" sub="Latest 5 of 163 BOL records"
          action={<button style={{background:'none',border:'none',color:'#3b82f6',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>View all →</button>}
          padded={false}>
          {[
            {date:'Mar 11, 2026', from:'Hai Phong, VN', to:'Long Beach, CA', teu:'1.5', mode:'FCL', carrier:'Maersk'},
            {date:'Feb 28, 2026', from:'Ho Chi Minh, VN', to:'Long Beach, CA', teu:'2.0', mode:'FCL', carrier:'CMA CGM'},
            {date:'Feb 14, 2026', from:'Singapore',     to:'Oakland, CA',     teu:'0.8', mode:'LCL', carrier:'ONE'},
            {date:'Jan 30, 2026', from:'Hai Phong, VN',  to:'Long Beach, CA', teu:'1.5', mode:'FCL', carrier:'Maersk'},
            {date:'Jan 15, 2026', from:'Shanghai, CN',   to:'Los Angeles, CA',teu:'1.0', mode:'FCL', carrier:'Hapag-Lloyd'},
          ].map((s,i,arr) => (
            <div key={i} style={{padding:'10px 16px',display:'grid',gridTemplateColumns:'72px 1fr 60px 50px',alignItems:'center',gap:10,borderBottom:i<arr.length-1?'1px solid #F1F5F9':'none'}}>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'#64748B'}}>{s.date}</span>
              <div style={{minWidth:0}}>
                <div style={{fontSize:11,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                  {s.from} <span style={{color:'#94A3B8'}}>→</span> {s.to}
                </div>
                <div style={{fontSize:10,color:'#94A3B8',fontFamily:'DM Sans,sans-serif',marginTop:1}}>{s.carrier}</div>
              </div>
              <span style={{fontSize:9,fontWeight:600,color:s.mode==='FCL'?'#1d4ed8':'#6D28D9',background:s.mode==='FCL'?'#EFF6FF':'#F5F3FF',border:`1px solid ${s.mode==='FCL'?'#BFDBFE':'#DDD6FE'}`,borderRadius:3,padding:'1px 6px',fontFamily:'Space Grotesk,sans-serif',textAlign:'center',width:'fit-content'}}>{s.mode}</span>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,fontWeight:600,color:'#0F172A',textAlign:'right'}}>{s.teu} TEU</span>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Top suppliers" sub="From verified BOL counterparties">
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[
              {name:'Foxconn Vietnam Co. Ltd.', country:'VN', share:46, ship:75},
              {name:'Pegatron Vietnam',         country:'VN', share:22, ship:36},
              {name:'Wistron Singapore',        country:'SG', share:14, ship:23},
              {name:'Compal Electronics',       country:'TW', share:9,  ship:14},
            ].map((s,i) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:24,height:24,borderRadius:6,background:'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#64748B',fontFamily:'JetBrains Mono,monospace',flexShrink:0}}>{s.country}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.name}</div>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                    <div style={{flex:1,height:3,background:'#F1F5F9',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${s.share}%`,background:'#3B82F6',borderRadius:2}}></div>
                    </div>
                    <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'#64748B'}}>{s.share}% · {s.ship} ship</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

Object.assign(window, { CDPSupplyChain });
