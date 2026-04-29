// CompanyDetailPage.jsx — Premium Company Profile (v2)
'use strict';

function CompanyDetailPage({ company, onBack }) {
  const [tab, setTab] = React.useState('supply');
  const [starred, setStarred] = React.useState(true);
  const [panelOpen, setPanelOpen] = React.useState(true);

  const TABS = [
    { id:'supply',   label:'Supply Chain', icon:'workflow' },
    { id:'contacts', label:'Contacts',     icon:'users' },
    { id:'research', label:'AI Research',  icon:'sparkles' },
    { id:'activity', label:'Activity',     icon:'activity' },
  ];

  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); }, [tab, panelOpen]);

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#F8FAFC'}}>
      <CDPHeader company={company} onBack={onBack} starred={starred} onToggleStar={()=>setStarred(s=>!s)} panelOpen={panelOpen} onTogglePanel={()=>setPanelOpen(p=>!p)} />

      {/* Tab bar */}
      <div style={{background:'#FFFFFF',borderBottom:'1px solid #E5E7EB',padding:'0 24px',flexShrink:0,display:'flex',alignItems:'center',gap:0}}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{display:'inline-flex',alignItems:'center',gap:6,background:'none',border:'none',borderBottom:`2px solid ${tab===t.id?'#3B82F6':'transparent'}`,padding:'11px 14px',fontSize:12.5,fontWeight:600,color:tab===t.id?'#1d4ed8':'#64748B',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',transition:'all 150ms',marginBottom:-1,whiteSpace:'nowrap'}}>
            <i data-lucide={t.icon} style={{width:13,height:13}}></i>
            {t.label}
            {t.id==='contacts' && <span style={{fontSize:9,fontWeight:700,color:'#1d4ed8',background:'#EFF6FF',borderRadius:9999,padding:'1px 6px',fontFamily:'JetBrains Mono,monospace'}}>12</span>}
          </button>
        ))}
      </div>

      {/* Body — main + right panel */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        <div style={{flex:1,overflowY:'auto',padding:'18px 24px 32px'}}>
          {tab==='supply'   && <CDPSupplyChain company={company}/>}
          {tab==='contacts' && <CDPContacts    company={company}/>}
          {tab==='research' && <CDPResearch    company={company}/>}
          {tab==='activity' && <CDPActivity    company={company}/>}
        </div>
        {panelOpen && <CDPDetailsPanel company={company}/>}
      </div>
    </div>
  );
}

Object.assign(window, { CompanyDetailPage });
