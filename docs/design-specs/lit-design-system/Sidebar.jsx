// Sidebar.jsx — Dark intelligence shell
'use strict';

const LIT_ICON = () => (
  <svg width="20" height="20" viewBox="0 0 64 64" fill="none">
    <path d="M14 14v36h20" stroke="#00F0FF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M30 14h22" stroke="#00F0FF" strokeWidth="6" strokeLinecap="round"/>
    <path d="M30 28h9" stroke="#00F0FF" strokeWidth="6" strokeLinecap="round"/>
    <path d="M44 28v22" stroke="#00F0FF" strokeWidth="6" strokeLinecap="round"/>
    <path d="M30 50h14" stroke="#00F0FF" strokeWidth="6" strokeLinecap="round"/>
  </svg>
);

const NAV_ITEMS = [
  { id: 'dashboard',label: 'Dashboard',      icon: 'layout-dashboard' },
  { id: 'discover', label: 'Discover',       icon: 'search'           },
  { id: 'command',  label: 'Command Center', icon: 'database'         },
  { id: 'outbound', label: 'Outbound Engine',icon: 'send'             },
  { id: 'deals',    label: 'Deal Builder',   icon: 'file-text'        },
];

function Sidebar({ active, onNav }) {
  return (
    <aside style={S.aside}>
      {/* Wordmark */}
      <div style={S.logo}>
        <div style={S.logoIcon}><LIT_ICON /></div>
        <div>
          <div style={S.logoText}>Logistic Intel</div>
          <div style={S.logoTag}>Revenue Intelligence</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={S.nav}>
        <div style={S.navGroup}>
          {NAV_ITEMS.map(item => {
            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => onNav(item.id)}
                style={{...S.navItem, ...(isActive ? S.navActive : {})}}>
                <i data-lucide={item.icon} style={{width:15,height:15,flexShrink:0,color: isActive ? '#60a5fa' : '#4B5563'}}></i>
                <span style={{color: isActive ? '#e2e8f0' : '#6B7280'}}>{item.label}</span>
                {isActive && <div style={S.activeDot}/>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div style={S.footer}>
        <div style={S.divider}/>
        <button onClick={() => onNav('settings')} style={{...S.navItem, ...(active==='settings'?S.navActive:{})}}>
          <i data-lucide="settings" style={{width:15,height:15,color: active==='settings' ? '#60a5fa' : '#4B5563'}}></i>
          <span style={{color: active==='settings' ? '#e2e8f0' : '#6B7280'}}>Settings</span>
          {active==='settings' && <div style={S.activeDot}/>}
        </button>
        <div style={S.userRow}>
          <div style={S.avatar}>JD</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:600,color:'#D1D5DB',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Jordan Davis</div>
            <div style={{fontSize:11,color:'#4B5563',fontFamily:'DM Sans,sans-serif'}}>Admin · LIT</div>
          </div>
          <i data-lucide="chevrons-up-down" style={{width:13,height:13,color:'#374151',flexShrink:0}}></i>
        </div>
      </div>
    </aside>
  );
}

const S = {
  aside: { width:224, minWidth:224, background:'#081225', borderRight:'1px solid #0F1F35', display:'flex', flexDirection:'column', height:'100vh', flexShrink:0 },
  logo: { display:'flex', alignItems:'center', gap:10, padding:'18px 16px 14px', borderBottom:'1px solid #0F1F35' },
  logoIcon: { width:34, height:34, background:'#020617', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 12px rgba(0,240,255,0.25)', flexShrink:0 },
  logoText: { fontFamily:'Space Grotesk,sans-serif', fontSize:13, fontWeight:700, color:'#E2E8F0', letterSpacing:'-0.01em', lineHeight:1.2 },
  logoTag: { fontFamily:'DM Sans,sans-serif', fontSize:9, fontWeight:500, color:'#374151', letterSpacing:'0.06em', textTransform:'uppercase', marginTop:1 },
  nav: { flex:1, padding:'10px 10px 0', overflowY:'auto' },
  navGroup: { display:'flex', flexDirection:'column', gap:1 },
  navItem: { display:'flex', alignItems:'center', gap:9, padding:'8px 11px', borderRadius:7, fontSize:13, fontWeight:500, fontFamily:'Space Grotesk,sans-serif', background:'none', border:'none', cursor:'pointer', textAlign:'left', width:'100%', transition:'all 140ms', position:'relative' },
  navActive: { background:'rgba(59,130,246,0.12)', borderLeft:'2px solid #3b82f6', paddingLeft:9 },
  activeDot: { position:'absolute', right:10, width:4, height:4, borderRadius:'50%', background:'#60a5fa', boxShadow:'0 0 5px rgba(96,165,250,0.7)' },
  footer: { padding:'0 10px 14px' },
  divider: { height:1, background:'#0F1F35', margin:'8px 2px 10px' },
  userRow: { display:'flex', alignItems:'center', gap:9, padding:'9px 11px', borderRadius:7, cursor:'pointer' },
  avatar: { width:28, height:28, borderRadius:'50%', background:'rgba(59,130,246,0.18)', border:'1px solid rgba(59,130,246,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#60a5fa', fontFamily:'Space Grotesk,sans-serif', flexShrink:0 },
};

Object.assign(window, { Sidebar });
