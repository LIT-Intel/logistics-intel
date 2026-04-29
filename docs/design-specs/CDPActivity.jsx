// CDPActivity.jsx — Activity timeline tab
'use strict';

const ACTIVITY = [
  { type:'shipment',  icon:'ship',         color:'#3B82F6', title:'New shipment recorded',          sub:'Hai Phong → Long Beach · 1.5 TEU · Maersk',          actor:'BOL feed',           when:'2h ago',  date:'Mar 11, 2026' },
  { type:'enrich',    icon:'zap',          color:'#8B5CF6', title:'Contacts enriched',              sub:'+3 verified contacts (Sarah Chen, Marcus Reed, Priya Patel)', actor:'Pulse',         when:'1d ago',  date:'Mar 10, 2026' },
  { type:'note',      icon:'message-square',color:'#64748B',title:'Note added by Valesco Raymond',  sub:'"Met team at TPM 2026 — interested in 2nd-source on VN lane. Follow up Q2."', actor:'Valesco Raymond', when:'3d ago',  date:'Mar 8, 2026' },
  { type:'campaign',  icon:'send',         color:'#10B981', title:'Added to campaign',              sub:'Q2 Outbound — VN · Sequence: 5 steps · Owner: Valesco',  actor:'Valesco Raymond', when:'5d ago',  date:'Mar 6, 2026' },
  { type:'list',      icon:'folder-plus',  color:'#0EA5E9', title:'Added to list',                  sub:'VN→US Top 250 Importers',                                actor:'Valesco Raymond', when:'1w ago',  date:'Mar 4, 2026' },
  { type:'research',  icon:'sparkles',     color:'#F59E0B', title:'AI Research brief generated',    sub:'Pulse v2.4 · 6 sections · 82% confidence',                actor:'Pulse',           when:'1w ago',  date:'Mar 4, 2026' },
  { type:'crm',       icon:'briefcase',    color:'#3B82F6', title:'CRM stage changed',              sub:'Prospect → Active',                                       actor:'Valesco Raymond', when:'2w ago',  date:'Feb 26, 2026' },
  { type:'export',    icon:'download',     color:'#64748B', title:'Profile exported',               sub:'PDF · 4 pages · shared via Slack',                        actor:'Marcus Reed (teammate)', when:'2w ago', date:'Feb 24, 2026' },
];

function CDPActivity({ company }) {
  const [filter, setFilter] = React.useState('all');
  const filtered = filter==='all' ? ACTIVITY : ACTIVITY.filter(a => a.type === filter);

  return (
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 240px',gap:14,alignItems:'start'}}>
      <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,boxShadow:'0 1px 2px rgba(15,23,42,0.03)',overflow:'hidden'}}>
        {/* Header */}
        <div style={{padding:'12px 16px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif'}}>Activity Timeline</div>
            <div style={{fontSize:11,color:'#94A3B8',fontFamily:'DM Sans,sans-serif',marginTop:1}}>Account events, enrichment, and engagement history</div>
          </div>
          <div style={{display:'flex',gap:4}}>
            {[
              {k:'all',l:'All'},{k:'shipment',l:'Shipments'},{k:'enrich',l:'Enrichment'},
              {k:'campaign',l:'Campaigns'},{k:'note',l:'Notes'},
            ].map(f => (
              <button key={f.k} onClick={()=>setFilter(f.k)} style={{fontSize:10,fontWeight:600,background:filter===f.k?'#EFF6FF':'#F8FAFC',color:filter===f.k?'#1d4ed8':'#64748B',border:`1px solid ${filter===f.k?'#BFDBFE':'#E2E8F0'}`,borderRadius:6,padding:'4px 9px',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>{f.l}</button>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div style={{padding:'4px 0'}}>
          {filtered.map((a,i,arr) => (
            <div key={i} style={{padding:'12px 16px',display:'grid',gridTemplateColumns:'28px 1fr auto',gap:12,position:'relative',borderBottom:i<arr.length-1?'1px solid #F8FAFC':'none'}}>
              {/* Connector line */}
              {i<arr.length-1 && <div style={{position:'absolute',left:30,top:36,bottom:0,width:1,background:'#F1F5F9'}}></div>}
              {/* Icon */}
              <div style={{width:28,height:28,borderRadius:7,background:a.color+'15',border:`1px solid ${a.color}25`,display:'flex',alignItems:'center',justifyContent:'center',color:a.color,zIndex:1,position:'relative'}}>
                <i data-lucide={a.icon} style={{width:13,height:13}}></i>
              </div>
              {/* Body */}
              <div style={{minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif',marginBottom:2}}>{a.title}</div>
                <div style={{fontSize:11,color:'#475569',fontFamily:'DM Sans,sans-serif',lineHeight:1.5}}>{a.sub}</div>
                <div style={{fontSize:10,color:'#94A3B8',fontFamily:'DM Sans,sans-serif',marginTop:3}}>by <span style={{fontWeight:600,color:'#64748B'}}>{a.actor}</span></div>
              </div>
              {/* Time */}
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontSize:11,fontWeight:600,color:'#475569',fontFamily:'Space Grotesk,sans-serif'}}>{a.when}</div>
                <div style={{fontSize:10,color:'#94A3B8',fontFamily:'JetBrains Mono,monospace',marginTop:1}}>{a.date}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{padding:'10px 16px',borderTop:'1px solid #F1F5F9',background:'#FAFBFC',textAlign:'center'}}>
          <button style={{background:'none',border:'none',color:'#3b82f6',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>Load older activity →</button>
        </div>
      </div>

      {/* Sidebar — quick stats */}
      <aside style={{display:'flex',flexDirection:'column',gap:10}}>
        <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,padding:'12px 14px'}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',marginBottom:8}}>30-day activity</div>
          {[
            {l:'New shipments',v:14},
            {l:'Contacts enriched',v:6},
            {l:'Notes added',v:3},
            {l:'Campaign sends',v:11},
          ].map(d => (
            <div key={d.l} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid #F1F5F9'}}>
              <span style={{fontSize:11,color:'#475569',fontFamily:'DM Sans,sans-serif'}}>{d.l}</span>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,fontWeight:700,color:'#0F172A'}}>{d.v}</span>
            </div>
          ))}
        </div>

        <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,padding:'12px 14px'}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',marginBottom:8}}>Add note</div>
          <textarea placeholder="Drop a note for the team…" style={{width:'100%',background:'#F8FAFC',border:'1.5px solid #E2E8F0',borderRadius:8,padding:'8px 10px',fontSize:11,fontFamily:'DM Sans,sans-serif',color:'#0F172A',outline:'none',resize:'none',minHeight:60}}></textarea>
          <button style={{marginTop:6,width:'100%',background:'linear-gradient(180deg,#3B82F6,#2563EB)',border:'none',borderRadius:7,padding:'6px 10px',fontSize:11,fontWeight:600,color:'#fff',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',boxShadow:'0 1px 2px rgba(59,130,246,0.3)'}}>Save note</button>
        </div>
      </aside>
    </div>
  );
}

Object.assign(window, { CDPActivity });
