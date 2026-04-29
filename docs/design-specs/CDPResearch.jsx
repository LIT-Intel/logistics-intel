// CDPResearch.jsx — AI Research / Pulse Enriched intelligence brief
'use strict';

function BriefSection({ idx, title, icon, children, accent }) {
  return (
    <section style={{padding:'18px 20px',borderBottom:'1px solid #F1F5F9',position:'relative'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        {idx !== undefined && <span style={{width:20,height:20,borderRadius:5,background:accent?'#0F172A':'#F1F5F9',color:accent?'#00F0FF':'#64748B',fontSize:10,fontWeight:700,fontFamily:'JetBrains Mono,monospace',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{idx}</span>}
        {icon && <i data-lucide={icon} style={{width:14,height:14,color:accent?'#1d4ed8':'#64748B'}}></i>}
        <h3 style={{fontFamily:'Space Grotesk,sans-serif',fontSize:14,fontWeight:700,color:'#0F172A',margin:0,letterSpacing:'-0.01em'}}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function CDPResearch({ company }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 280px',gap:14,alignItems:'start'}}>
      {/* Brief — main column */}
      <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,boxShadow:'0 1px 2px rgba(15,23,42,0.03)',overflow:'hidden'}}>
        {/* Brief header */}
        <div style={{background:'linear-gradient(135deg,#0B1736 0%,#0F1D38 60%,#102240 100%)',padding:'18px 20px',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:-40,right:-40,width:200,height:200,background:'radial-gradient(circle,rgba(0,240,255,0.18) 0%,transparent 60%)',pointerEvents:'none'}}></div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,position:'relative'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:24,height:24,borderRadius:6,background:'rgba(0,240,255,0.12)',border:'1px solid rgba(0,240,255,0.25)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <i data-lucide="sparkles" style={{width:13,height:13,color:'#00F0FF'}}></i>
              </div>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#00F0FF',fontFamily:'Space Grotesk,sans-serif'}}>Pulse · Account Intelligence Brief</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:10,fontWeight:600,color:'#94A3B8',fontFamily:'JetBrains Mono,monospace'}}>v2.4 · Apr 27, 2026</span>
            </div>
          </div>
          <h2 style={{fontFamily:'Space Grotesk,sans-serif',fontSize:22,fontWeight:700,color:'#F8FAFC',letterSpacing:'-0.02em',margin:0,position:'relative',lineHeight:1.2}}>{company.company_name}</h2>
          <div style={{fontSize:13,color:'#CBD5E1',fontFamily:'DM Sans,sans-serif',marginTop:4,position:'relative'}}>
            <strong style={{color:'#F8FAFC'}}>NYSE: HPQ</strong> · San Bernardino, CA · ~241 TEU/yr · Computing & peripherals (laptops, monitors, accessories)
          </div>
          <div style={{display:'flex',gap:8,marginTop:12,position:'relative'}}>
            <button style={{display:'inline-flex',alignItems:'center',gap:5,background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:7,padding:'5px 10px',fontSize:10,fontWeight:600,color:'#F8FAFC',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',backdropFilter:'blur(6px)'}}>
              <i data-lucide="copy" style={{width:11,height:11}}></i>Copy brief
            </button>
            <button style={{display:'inline-flex',alignItems:'center',gap:5,background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:7,padding:'5px 10px',fontSize:10,fontWeight:600,color:'#F8FAFC',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer'}}>
              <i data-lucide="share-2" style={{width:11,height:11}}></i>Share
            </button>
            <button style={{display:'inline-flex',alignItems:'center',gap:5,background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:7,padding:'5px 10px',fontSize:10,fontWeight:600,color:'#F8FAFC',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer'}}>
              <i data-lucide="download" style={{width:11,height:11}}></i>Export PDF
            </button>
            <button style={{display:'inline-flex',alignItems:'center',gap:5,background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:7,padding:'5px 10px',fontSize:10,fontWeight:600,color:'#F8FAFC',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer'}}>
              <i data-lucide="refresh-cw" style={{width:11,height:11}}></i>Re-run
            </button>
          </div>
        </div>

        {/* 1. Executive summary */}
        <BriefSection idx="01" title="Executive Account Summary" icon="file-text">
          <p style={{fontSize:13,color:'#374151',fontFamily:'DM Sans,sans-serif',lineHeight:1.65,margin:0,textWrap:'pretty'}}>
            HP is a US computing OEM importing finished goods and components across a Vietnam-led supply chain at ~241 TEU annually. Trade volume is structurally rising: <strong style={{color:'#0F172A'}}>+12% YoY</strong> with peak activity in Q1 2026 (103 shipments in March). The forwarder relationship is in active transition: <strong style={{color:'#B91C1C'}}>China lane dropped 22% in 2026</strong>, while Vietnam grew to <strong style={{color:'#15803D'}}>74% of total volume</strong>. Hapag-Lloyd entered as a new carrier in 2026, suggesting active rebalancing.
          </p>
        </BriefSection>

        {/* 2. Trade snapshot */}
        <BriefSection idx="02" title="Trade Activity Snapshot" icon="bar-chart-3">
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[
              {l:'12m Volume',v:'241 TEU',sub:'+12% YoY',up:true},
              {l:'Shipments',v:'163',sub:'BOL records',up:null},
              {l:'Active Lanes',v:'8',sub:'4 reachable',up:null},
              {l:'Lane concentration',v:'74%',sub:'VN → US',up:true},
            ].map(s => (
              <div key={s.l} style={{background:'#FAFBFC',border:'1px solid #F1F5F9',borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif'}}>{s.l}</div>
                <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:700,color:'#0F172A',marginTop:3}}>{s.v}</div>
                <div style={{fontSize:10,color:s.up?'#15803D':'#64748B',fontFamily:'DM Sans,sans-serif',marginTop:1}}>{s.up?'↑ ':''}{s.sub}</div>
              </div>
            ))}
          </div>
        </BriefSection>

        {/* 3. Top lanes */}
        <BriefSection idx="03" title="Top Lanes & Lane Movement" icon="trending-up">
          <table style={{width:'100%',borderCollapse:'collapse',fontFamily:'DM Sans,sans-serif'}}>
            <thead>
              <tr style={{borderBottom:'1px solid #F1F5F9'}}>
                <th style={{textAlign:'left',padding:'6px 8px',fontSize:9,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif'}}>Lane</th>
                <th style={{textAlign:'right',padding:'6px 8px',fontSize:9,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif'}}>2026 Share</th>
                <th style={{textAlign:'right',padding:'6px 8px',fontSize:9,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif'}}>YoY</th>
                <th style={{textAlign:'left',padding:'6px 8px',fontSize:9,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif'}}>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                {lane:'Hai Phong → Long Beach',share:'58.2%',yoy:'+24%',up:true,status:'Surge'},
                {lane:'Ho Chi Minh → Long Beach',share:'15.8%',yoy:'+8%',up:true,status:'Active'},
                {lane:'Singapore → Oakland',share:'16.0%',yoy:'+4%',up:true,status:'Active'},
                {lane:'Shanghai → Los Angeles',share:'8.0%',yoy:'-22%',up:false,status:'Declining'},
                {lane:'Kaohsiung → LA',share:'2.0%',yoy:'New \u201926',up:true,status:'Emerging'},
              ].map((r,i) => (
                <tr key={i} style={{borderBottom:i<4?'1px solid #F8FAFC':'none'}}>
                  <td style={{padding:'7px 8px',fontSize:11,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif'}}>{r.lane}</td>
                  <td style={{padding:'7px 8px',fontSize:11,fontFamily:'JetBrains Mono,monospace',color:'#0F172A',textAlign:'right'}}>{r.share}</td>
                  <td style={{padding:'7px 8px',fontSize:11,fontFamily:'JetBrains Mono,monospace',color:r.up?'#15803D':'#B91C1C',fontWeight:600,textAlign:'right'}}>{r.yoy}</td>
                  <td style={{padding:'7px 8px'}}>
                    <span style={{fontSize:9,fontWeight:600,color:r.status==='Declining'?'#B91C1C':r.status==='Surge'?'#15803D':r.status==='Emerging'?'#1d4ed8':'#64748B',background:r.status==='Declining'?'#FEF2F2':r.status==='Surge'?'#F0FDF4':r.status==='Emerging'?'#EFF6FF':'#F1F5F9',border:`1px solid ${r.status==='Declining'?'#FECACA':r.status==='Surge'?'#BBF7D0':r.status==='Emerging'?'#BFDBFE':'#E2E8F0'}`,borderRadius:3,padding:'1px 6px',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.04em'}}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </BriefSection>

        {/* 4. Opportunity signals */}
        <BriefSection idx="04" title="Opportunity Signals" icon="target" accent>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {[
              {label:'Forwarder displacement',color:'#15803D',bg:'#F0FDF4',bd:'#BBF7D0',body:'DSV Ocean dropped 64% (1,894 → 684 TEU, 2024→2025) while Maersk rose to 835 TEU. Power Query surfaces this exact pattern — accounts where a named incumbent shows declining concentration.'},
              {label:'Tariff exposure',color:'#1d4ed8',bg:'#EFF6FF',bd:'#BFDBFE',body:'145% on Chinese LFP batteries, 25% on auto components. November 27, 2026 deadline before rare earth export controls may resume. LIT pre-qualifies importers via FTZ + duty drawback flags.'},
              {label:'Lane consolidation',color:'#6D28D9',bg:'#F5F3FF',bd:'#DDD6FE',body:'Hai Phong → Long Beach grew +24% YoY at 58% of volume. Concentration risk + capacity exposure suggests appetite for diversified routing or 2nd-source forwarder.'},
            ].map((s,i) => (
              <div key={i} style={{background:s.bg,border:`1px solid ${s.bd}`,borderRadius:8,padding:'10px 12px'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                  <span style={{fontSize:10,fontWeight:700,color:s.color,fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.06em'}}>{s.label}</span>
                </div>
                <p style={{fontSize:12,color:'#374151',fontFamily:'DM Sans,sans-serif',lineHeight:1.55,margin:0,textWrap:'pretty'}}>{s.body}</p>
              </div>
            ))}
          </div>
        </BriefSection>

        {/* 5. Risk lanes */}
        <BriefSection idx="05" title="Risk & Problem Lanes" icon="alert-triangle">
          <ul style={{margin:0,padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:8}}>
            {[
              'Shanghai → LA dropped 22% YoY — likely tied to OEM tariff exposure and supplier shift to VN.',
              'JAS Worldwide exited entirely in 2026 — gap in air capacity for high-priority components.',
              'Ho Chi Minh → Long Beach LCL rate volatility +18% in last 90 days.',
            ].map((r,i) => (
              <li key={i} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:'#EF4444',marginTop:8,flexShrink:0}}></span>
                <span style={{fontSize:12,color:'#374151',fontFamily:'DM Sans,sans-serif',lineHeight:1.55}}>{r}</span>
              </li>
            ))}
          </ul>
        </BriefSection>

        {/* 6. Outreach hook */}
        <BriefSection idx="06" title="Suggested Outreach Hook" icon="send" accent>
          <div style={{background:'linear-gradient(135deg,#EFF6FF 0%,#F5F3FF 100%)',border:'1px solid #BFDBFE',borderRadius:8,padding:'12px 14px'}}>
            <div style={{fontSize:10,fontWeight:700,color:'#1d4ed8',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Opening angle</div>
            <p style={{fontSize:13,color:'#1E293B',fontFamily:'DM Sans,sans-serif',lineHeight:1.6,margin:0,fontStyle:'italic'}}>
              "Saw HP's Hai Phong → Long Beach lane grew 24% in Q1 while Shanghai dropped 22%. With Maersk now carrying 42% of your VN volume and Hapag entering this year, there's a clear 2nd-source story for your VN/SG capacity. Worth 15 minutes?"
            </p>
            <div style={{display:'flex',gap:6,marginTop:10}}>
              <button style={{display:'inline-flex',alignItems:'center',gap:4,background:'#FFFFFF',border:'1px solid #BFDBFE',borderRadius:6,padding:'4px 10px',fontSize:10,fontWeight:600,color:'#1d4ed8',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>
                <i data-lucide="copy" style={{width:10,height:10}}></i>Copy
              </button>
              <button style={{display:'inline-flex',alignItems:'center',gap:4,background:'linear-gradient(180deg,#3B82F6,#2563EB)',border:'none',borderRadius:6,padding:'4px 10px',fontSize:10,fontWeight:600,color:'#fff',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>
                <i data-lucide="zap" style={{width:10,height:10}}></i>Use in campaign
              </button>
            </div>
          </div>
        </BriefSection>

        {/* Feedback */}
        <div style={{padding:'12px 20px',background:'#FAFBFC',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
          <span style={{fontSize:11,color:'#64748B',fontFamily:'DM Sans,sans-serif'}}>Was this brief useful?</span>
          <div style={{display:'flex',gap:6}}>
            <button title="Yes" style={{width:26,height:26,borderRadius:6,background:'#FFFFFF',border:'1px solid #E2E8F0',cursor:'pointer',color:'#64748B',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><i data-lucide="thumbs-up" style={{width:12,height:12}}></i></button>
            <button title="No" style={{width:26,height:26,borderRadius:6,background:'#FFFFFF',border:'1px solid #E2E8F0',cursor:'pointer',color:'#64748B',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><i data-lucide="thumbs-down" style={{width:12,height:12}}></i></button>
            <button style={{display:'inline-flex',alignItems:'center',gap:4,background:'#FFFFFF',border:'1px solid #E2E8F0',borderRadius:6,padding:'4px 10px',fontSize:10,fontWeight:600,color:'#475569',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>
              <i data-lucide="message-square" style={{width:10,height:10}}></i>Feedback
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar — supporting data */}
      <aside style={{display:'flex',flexDirection:'column',gap:10,position:'sticky',top:0}}>
        <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,padding:'12px 14px'}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',marginBottom:8}}>Brief Outline</div>
          <ol style={{margin:0,padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:5,counterReset:'a'}}>
            {['Executive Summary','Trade Snapshot','Lane Movement','Opportunity Signals','Risk Lanes','Outreach Hook'].map((s,i) => (
              <li key={s} style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#475569',fontFamily:'DM Sans,sans-serif'}}>
                <span style={{width:18,height:18,borderRadius:4,background:'#F1F5F9',color:'#94A3B8',fontSize:9,fontWeight:700,fontFamily:'JetBrains Mono,monospace',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>0{i+1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>

        <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,padding:'12px 14px'}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',marginBottom:8}}>Supporting Data</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {[
              {l:'BOL records',v:'163',i:'file-text'},
              {l:'AMS manifest',v:'141',i:'file-text'},
              {l:'Customs entries',v:'127',i:'shield-check'},
              {l:'Last update',v:'2h ago',i:'clock'},
            ].map(d => (
              <div key={d.l} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid #F1F5F9'}}>
                <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,color:'#475569',fontFamily:'DM Sans,sans-serif'}}>
                  <i data-lucide={d.i} style={{width:11,height:11,color:'#94A3B8'}}></i>{d.l}
                </span>
                <span style={{fontSize:11,fontFamily:'JetBrains Mono,monospace',color:'#0F172A',fontWeight:600}}>{d.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,padding:'12px 14px'}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',marginBottom:8}}>Confidence</div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <div style={{flex:1,height:6,background:'#F1F5F9',borderRadius:3,overflow:'hidden'}}>
              <div style={{height:'100%',width:'82%',background:'linear-gradient(90deg,#10B981,#22C55E)',borderRadius:3}}></div>
            </div>
            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,fontWeight:700,color:'#15803D'}}>82%</span>
          </div>
          <div style={{fontSize:10,color:'#64748B',fontFamily:'DM Sans,sans-serif',lineHeight:1.5}}>
            Based on 4 verified sources. Some lane attribution inferred from carrier mix.
          </div>
        </div>
      </aside>
    </div>
  );
}

Object.assign(window, { CDPResearch });
