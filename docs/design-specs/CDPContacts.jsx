// CDPContacts.jsx — Contacts tab (list + card view)
'use strict';

const CDP_CONTACTS = [
  { id:1, name:'Sarah Chen',   title:'VP of Logistics & Supply Chain', dept:'Operations',  seniority:'VP',       location:'San Bernardino, CA', verified:true,  email:'s.chen@hp.com',     phone:'+1 (909) 555-0182', linkedin:true,  source:'BOL+Verified', avatar:'#3B82F6' },
  { id:2, name:'Marcus Reed',  title:'Director of Procurement',         dept:'Procurement', seniority:'Director', location:'Palo Alto, CA',      verified:true,  email:'m.reed@hp.com',     phone:'+1 (650) 555-0341', linkedin:true,  source:'Verified',     avatar:'#6366F1' },
  { id:3, name:'Diana Torres', title:'Senior Supply Chain Manager',     dept:'Operations',  seniority:'Manager',  location:'Houston, TX',         verified:true,  email:'d.torres@hp.com',   phone:null,                linkedin:true,  source:'LinkedIn',     avatar:'#8B5CF6' },
  { id:4, name:'James Waller', title:'Logistics Coordinator',           dept:'Operations',  seniority:'IC',       location:'New York, NY',        verified:false, email:null,                phone:null,                linkedin:true,  source:'Inferred',     avatar:'#0EA5E9' },
  { id:5, name:'Priya Patel',  title:'Head of Trade Compliance',        dept:'Legal',       seniority:'Director', location:'Chicago, IL',         verified:true,  email:'p.patel@hp.com',    phone:'+1 (312) 555-0420', linkedin:true,  source:'Verified',     avatar:'#10B981' },
  { id:6, name:'Tom Iverson',  title:'Global Sourcing Manager',         dept:'Procurement', seniority:'Manager',  location:'Boise, ID',           verified:false, email:'t.iverson@hp.com',  phone:null,                linkedin:true,  source:'Inferred',     avatar:'#F59E0B' },
];

function ContactInitials({ name, color, size=32 }) {
  const initials = (name||'').split(' ').map(s=>s[0]).slice(0,2).join('');
  return (
    <div style={{width:size,height:size,borderRadius:'50%',background:`linear-gradient(135deg,${color},${color}cc)`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:size*0.36,fontWeight:700,fontFamily:'Space Grotesk,sans-serif',flexShrink:0,boxShadow:'inset 0 0 0 1px rgba(255,255,255,0.15)'}}>{initials}</div>
  );
}

function VerifiedBadge({ verified }) {
  if (verified) return (
    <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:9,fontWeight:700,color:'#15803D',background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:3,padding:'1px 6px',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.04em'}}>
      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z"/><path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      Verified
    </span>
  );
  return (
    <span style={{fontSize:9,fontWeight:600,color:'#94A3B8',background:'#F1F5F9',border:'1px solid #E2E8F0',borderRadius:3,padding:'1px 6px',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.04em'}}>Inferred</span>
  );
}

function ContactCard({ c }) {
  return (
    <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:10,padding:'14px',transition:'all 200ms cubic-bezier(0.16,1,0.3,1)',cursor:'pointer'}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor='#CBD5E1';e.currentTarget.style.boxShadow='0 4px 12px rgba(15,23,42,0.06)';}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='#E5E7EB';e.currentTarget.style.boxShadow='none';}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:10}}>
        <ContactInitials name={c.name} color={c.avatar} size={36}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
            <span style={{fontSize:13,fontWeight:700,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif'}}>{c.name}</span>
            <VerifiedBadge verified={c.verified}/>
          </div>
          <div style={{fontSize:11,color:'#475569',fontFamily:'DM Sans,sans-serif',marginBottom:4,lineHeight:1.3}}>{c.title}</div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            <span style={{fontSize:9,fontWeight:600,color:'#64748B',background:'#F1F5F9',borderRadius:3,padding:'1px 6px',fontFamily:'Space Grotesk,sans-serif'}}>{c.dept}</span>
            <span style={{fontSize:9,color:'#94A3B8',display:'inline-flex',alignItems:'center',gap:3,fontFamily:'DM Sans,sans-serif'}}>
              <i data-lucide="map-pin" style={{width:9,height:9}}></i>{c.location}
            </span>
          </div>
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:4,paddingTop:10,borderTop:'1px solid #F1F5F9'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontFamily:'DM Sans,sans-serif',color:c.email?'#475569':'#CBD5E1'}}>
          <i data-lucide="mail" style={{width:11,height:11,flexShrink:0,color:'#94A3B8'}}></i>
          <span style={{fontFamily:c.email?'JetBrains Mono,monospace':'inherit',fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.email || 'Not available'}</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontFamily:'DM Sans,sans-serif',color:c.phone?'#475569':'#CBD5E1'}}>
          <i data-lucide="phone" style={{width:11,height:11,flexShrink:0,color:'#94A3B8'}}></i>
          <span style={{fontFamily:c.phone?'JetBrains Mono,monospace':'inherit',fontSize:10}}>{c.phone || 'Not available'}</span>
        </div>
      </div>

      <div style={{display:'flex',gap:6,marginTop:10}}>
        <button style={{flex:1,fontSize:11,fontWeight:600,background:'linear-gradient(180deg,#3B82F6,#2563EB)',color:'#fff',border:'none',borderRadius:7,padding:'6px 10px',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:4,boxShadow:'0 1px 2px rgba(59,130,246,0.3)'}}>
          <i data-lucide="send" style={{width:10,height:10}}></i>Outreach
        </button>
        <button style={{fontSize:11,fontWeight:600,background:'#F8FAFC',color:'#475569',border:'1px solid #E2E8F0',borderRadius:7,padding:'6px 10px',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',display:'inline-flex',alignItems:'center',gap:4}}>
          <i data-lucide="zap" style={{width:10,height:10}}></i>Enrich
        </button>
        <button style={{width:28,fontSize:11,background:'#F8FAFC',color:'#475569',border:'1px solid #E2E8F0',borderRadius:7,padding:'6px 0',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
          <i data-lucide="bookmark" style={{width:11,height:11}}></i>
        </button>
      </div>
    </div>
  );
}

function ContactRow({ c }) {
  return (
    <tr style={{borderBottom:'1px solid #F1F5F9',transition:'background 120ms'}}
      onMouseEnter={e=>{e.currentTarget.style.background='#FAFBFC';}}
      onMouseLeave={e=>{e.currentTarget.style.background='transparent';}}>
      <td style={{padding:'10px 14px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <ContactInitials name={c.name} color={c.avatar} size={28}/>
          <div style={{minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:12,fontWeight:600,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif'}}>{c.name}</span>
              <VerifiedBadge verified={c.verified}/>
            </div>
            <div style={{fontSize:10,color:'#94A3B8',fontFamily:'DM Sans,sans-serif',marginTop:1}}>{c.location}</div>
          </div>
        </div>
      </td>
      <td style={{padding:'10px 14px',fontSize:11,color:'#475569',fontFamily:'DM Sans,sans-serif'}}>{c.title}</td>
      <td style={{padding:'10px 14px'}}>
        <span style={{fontSize:10,fontWeight:600,color:'#64748B',background:'#F1F5F9',borderRadius:3,padding:'1px 6px',fontFamily:'Space Grotesk,sans-serif'}}>{c.dept}</span>
      </td>
      <td style={{padding:'10px 14px',fontSize:10,color:c.email?'#475569':'#CBD5E1',fontFamily:c.email?'JetBrains Mono,monospace':'DM Sans,sans-serif'}}>{c.email || '—'}</td>
      <td style={{padding:'10px 14px',fontSize:10,color:c.phone?'#475569':'#CBD5E1',fontFamily:c.phone?'JetBrains Mono,monospace':'DM Sans,sans-serif'}}>{c.phone || '—'}</td>
      <td style={{padding:'10px 14px'}}>
        <span style={{fontSize:10,fontWeight:600,color:'#64748B',fontFamily:'Space Grotesk,sans-serif'}}>{c.source}</span>
      </td>
      <td style={{padding:'10px 14px',width:1,whiteSpace:'nowrap'}}>
        <div style={{display:'flex',gap:4}}>
          {[
            {icon:'send',title:'Outreach',primary:true},
            {icon:'zap',title:'Enrich'},
            {icon:'linkedin',title:'LinkedIn'},
            {icon:'more-horizontal',title:'More'},
          ].map((b,i) => (
            <button key={i} title={b.title} style={{width:24,height:24,borderRadius:5,background:b.primary?'#EFF6FF':'#F8FAFC',border:`1px solid ${b.primary?'#BFDBFE':'#E2E8F0'}`,color:b.primary?'#1d4ed8':'#64748B',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
              <i data-lucide={b.icon} style={{width:11,height:11}}></i>
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}

function CDPContacts({ company }) {
  const [view, setView] = React.useState('list');
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState('all');

  const filtered = CDP_CONTACTS.filter(c =>
    (!query || c.name.toLowerCase().includes(query.toLowerCase()) || c.title.toLowerCase().includes(query.toLowerCase())) &&
    (filter==='all' || (filter==='verified' && c.verified) || c.dept.toLowerCase()===filter)
  );
  const verifiedCount = CDP_CONTACTS.filter(c=>c.verified).length;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* Toolbar */}
      <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,padding:'12px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:200,position:'relative'}}>
          <i data-lucide="search" style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',width:13,height:13,color:'#94A3B8'}}></i>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search contacts by name, title, or skill…"
            style={{width:'100%',background:'#F8FAFC',border:'1.5px solid #E2E8F0',borderRadius:8,padding:'7px 12px 7px 32px',fontSize:12,fontFamily:'DM Sans,sans-serif',color:'#0F172A',outline:'none'}}
            onFocus={e=>{e.target.style.borderColor='#3B82F6';e.target.style.boxShadow='0 0 0 3px rgba(59,130,246,0.1)';}}
            onBlur={e=>{e.target.style.borderColor='#E2E8F0';e.target.style.boxShadow='none';}}/>
        </div>
        <div style={{display:'flex',gap:4}}>
          {[
            {k:'all',l:'All'},{k:'verified',l:'Verified'},
            {k:'operations',l:'Operations'},{k:'procurement',l:'Procurement'},{k:'legal',l:'Legal'},
          ].map(f => (
            <button key={f.k} onClick={()=>setFilter(f.k)} style={{fontSize:11,fontWeight:600,background:filter===f.k?'#EFF6FF':'#F8FAFC',color:filter===f.k?'#1d4ed8':'#64748B',border:`1px solid ${filter===f.k?'#BFDBFE':'#E2E8F0'}`,borderRadius:6,padding:'5px 10px',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',whiteSpace:'nowrap'}}>{f.l}</button>
          ))}
        </div>
        {/* View toggle */}
        <div style={{display:'flex',background:'#F1F5F9',borderRadius:7,padding:3}}>
          {[{k:'list',i:'list'},{k:'card',i:'layout-grid'}].map(v => (
            <button key={v.k} onClick={()=>setView(v.k)} style={{padding:'4px 8px',borderRadius:5,background:view===v.k?'#FFFFFF':'transparent',border:'none',cursor:'pointer',color:view===v.k?'#0F172A':'#94A3B8',display:'inline-flex',alignItems:'center',justifyContent:'center',boxShadow:view===v.k?'0 1px 2px rgba(15,23,42,0.05)':'none'}}>
              <i data-lucide={v.i} style={{width:13,height:13}}></i>
            </button>
          ))}
        </div>
        <button style={{display:'inline-flex',alignItems:'center',gap:5,background:'linear-gradient(180deg,#3B82F6,#2563EB)',border:'none',borderRadius:8,padding:'7px 12px',fontSize:11,fontWeight:600,color:'#fff',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',boxShadow:'0 1px 2px rgba(59,130,246,0.3)'}}>
          <i data-lucide="zap" style={{width:11,height:11}}></i>
          Enrich All
        </button>
      </div>

      {/* Result count + actions */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 4px'}}>
        <div style={{fontSize:12,color:'#64748B',fontFamily:'DM Sans,sans-serif'}}>
          <strong style={{color:'#0F172A',fontFamily:'JetBrains Mono,monospace'}}>{filtered.length}</strong> contacts ·
          <strong style={{color:'#15803D',fontFamily:'JetBrains Mono,monospace',marginLeft:4}}>{verifiedCount}</strong> verified ·
          <span style={{color:'#94A3B8',marginLeft:4}}>2 missing target titles</span>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button style={{display:'inline-flex',alignItems:'center',gap:4,background:'none',border:'none',color:'#3b82f6',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>
            <i data-lucide="user-plus" style={{width:11,height:11}}></i>Add contact
          </button>
          <button style={{display:'inline-flex',alignItems:'center',gap:4,background:'none',border:'none',color:'#3b82f6',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>
            <i data-lucide="download" style={{width:11,height:11}}></i>Export CSV
          </button>
        </div>
      </div>

      {/* List or Card */}
      {view==='list' ? (
        <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,overflow:'hidden',boxShadow:'0 1px 2px rgba(15,23,42,0.03)'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:'1px solid #E5E7EB',background:'#FAFBFC'}}>
                {['Contact','Title','Department','Email','Phone','Source','Actions'].map(h => (
                  <th key={h} style={{textAlign:'left',padding:'9px 14px',fontSize:9,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => <ContactRow key={c.id} c={c}/>)}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
          {filtered.map(c => <ContactCard key={c.id} c={c}/>)}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { CDPContacts });
