// SettingsSections.jsx — Major content sections for Settings page
'use strict';

/* ── Section header ─────────────────────────────── */
function SectionHeader({ title, subtitle, right }) {
  return (
    <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:16,marginBottom:16}}>
      <div>
        <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:22,fontWeight:700,color:'#0F172A',letterSpacing:'-0.02em'}}>{title}</div>
        {subtitle && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#64748b',marginTop:4,lineHeight:1.5,maxWidth:680}}>{subtitle}</div>}
      </div>
      {right && <div style={{display:'flex',gap:8,flexShrink:0}}>{right}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   1. PROFILE
   ═════════════════════════════════════════════════ */
function ProfileSection({ state, set, plan }) {
  const p = state.profile;
  const upd = (k,v) => set(s=>({...s, profile:{...s.profile,[k]:v}}));

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Profile" subtitle="Your personal identity across Logistic Intel. Displayed on your outbound sends, comments, and teammate mentions." />

      <SCard title="Identity" subtitle="Public profile details visible to your workspace and in outbound signatures.">
        <div style={{display:'flex',gap:24,alignItems:'flex-start'}}>
          {/* Avatar */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,flexShrink:0}}>
            <div style={{width:104,height:104,borderRadius:'50%',background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Space Grotesk,sans-serif',fontSize:36,fontWeight:700,color:'#fff',letterSpacing:'-0.02em',boxShadow:'0 4px 14px rgba(59,130,246,0.25)'}}>{p.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
            <button style={{...sBtnGhost, fontSize:12, padding:'6px 11px'}}><i data-lucide="upload" style={{width:12,height:12}}></i> Change photo</button>
          </div>
          <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <SField label="Full name" required><SInput value={p.name} onChange={e=>upd('name',e.target.value)} /></SField>
            <SField label="Job title"><SInput value={p.title} onChange={e=>upd('title',e.target.value)} placeholder="e.g. VP of Sales"/></SField>
            <SField label="Email" hint="Primary login email — verified"><SInput value={p.email} onChange={e=>upd('email',e.target.value)} /></SField>
            <SField label="Phone"><SInput value={p.phone} onChange={e=>upd('phone',e.target.value)} placeholder="+1 (555) 000-0000"/></SField>
            <SField label="Location"><SInput value={p.location} onChange={e=>upd('location',e.target.value)} placeholder="City, Country"/></SField>
            <SField label="Timezone">
              <SSelect value={p.tz} onChange={e=>upd('tz',e.target.value)}
                options={['America/Los_Angeles','America/Denver','America/Chicago','America/New_York','Europe/London','Europe/Amsterdam','Asia/Singapore','Asia/Tokyo','Australia/Sydney']} />
            </SField>
            <SField label="Short bio" hint="160 chars max. Shown on your outbound signature and teammate cards." span={2}>
              <STextarea rows={2} value={p.bio} onChange={e=>upd('bio',e.target.value)} placeholder="VP Sales @ Logistic Intel. 12 years closing ocean freight RFPs." maxLength={160}/>
            </SField>
          </div>
        </div>
      </SCard>

      <SCard title="Messaging preferences" subtitle="How teammates and automated systems contact you inside the app.">
        <div className="lit-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <SToggle checked={p.mentions} onChange={v=>upd('mentions',v)} label="@mentions in comments" sub="Email me when teammates tag me."/>
          <SToggle checked={p.digest} onChange={v=>upd('digest',v)} label="Weekly digest" sub="Monday morning summary of pipeline."/>
          <SToggle checked={p.dm} onChange={v=>upd('dm',v)} label="Direct messages" sub="In-app DMs from workspace members."/>
          <SToggle checked={p.assignments} onChange={v=>upd('assignments',v)} label="Assignments" sub="Notify when a deal is routed to me."/>
        </div>
      </SCard>

      <SCard title="Account" subtitle="Session, password, and two-factor security live under Security &amp; API." />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   2. ORGANIZATION / WORKSPACE
   ═════════════════════════════════════════════════ */
function OrganizationSection({ state, set, plan, role }) {
  const o = state.org;
  const upd = (k,v) => set(s=>({...s, org:{...s.org,[k]:v}}));
  const isAdmin = role === 'admin' || role === 'super';

  if (!isAdmin) {
    return (
      <div style={{display:'flex',flexDirection:'column',gap:20}}>
        <SectionHeader title="Organization" subtitle="Workspace settings. Admin access required to edit."/>
        <SCard>
          <div style={{display:'flex',alignItems:'center',gap:14,padding:'12px 0'}}>
            <div style={{width:44,height:44,borderRadius:10,background:'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <i data-lucide="shield-alert" style={{width:18,height:18,color:'#64748b'}}></i>
            </div>
            <div>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:14,fontWeight:700,color:'#0F172A'}}>Admin access required</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#64748b',marginTop:3}}>You're a {role} in this workspace. Ask a workspace admin to adjust organization settings.</div>
            </div>
          </div>
        </SCard>
      </div>
    );
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Organization" subtitle="Workspace identity, teammate visibility, and defaults that apply across every user in your account."
        right={<SBadge tone="blue" icon="shield-check">Admin</SBadge>} />

      <SCard title="Workspace" subtitle="Org-level identity. Shown on invites, shared links, and in outbound signature defaults.">
        <div className="lit-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <SField label="Organization name" required><SInput value={o.name} onChange={e=>upd('name',e.target.value)}/></SField>
          <SField label="Website"><SInput value={o.website} onChange={e=>upd('website',e.target.value)}/></SField>
          <SField label="HQ location"><SInput value={o.hq} onChange={e=>upd('hq',e.target.value)}/></SField>
          <SField label="Primary industry">
            <SSelect value={o.industry} onChange={e=>upd('industry',e.target.value)}
              options={['Freight Forwarder','NVOCC','3PL / 4PL','Customs Broker','Drayage / Trucking','Air Cargo','Shipper','Carrier']}/>
          </SField>
          <SField label="Default signature" hint="Appended to outbound sends unless overridden." span={2}>
            <STextarea rows={3} value={o.signature} onChange={e=>upd('signature',e.target.value)}/>
          </SField>
        </div>
      </SCard>

      <SCard title="Workspace defaults" subtitle="Applied to new teammates and new campaigns unless explicitly overridden.">
        <div className="lit-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <SToggle checked={o.teammateDir} onChange={v=>upd('teammateDir',v)} label="Teammate directory visible" sub="Members can see the full team list."/>
          <SToggle checked={o.sharedPipeline} onChange={v=>upd('sharedPipeline',v)} label="Shared pipeline by default" sub="New deals visible to all teammates."/>
          <SToggle checked={o.sandbox} onChange={v=>upd('sandbox',v)} label="Sandbox mode for new hires" sub="Block sends for the first 7 days."/>
          <SToggle checked={o.enforceSignature} onChange={v=>upd('enforceSignature',v)} label="Enforce default signature" sub="Prevent teammates from overriding."/>
        </div>
      </SCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   3. ACCESS & ROLES  (admin only)
   ═════════════════════════════════════════════════ */
function AccessSection({ state, set, role }) {
  const members = state.members;
  const invites = state.invites;
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [tab, setTab] = React.useState('members');

  const isAdmin = role === 'admin' || role === 'super';

  const updateRole = (id, newRole) => set(s=>({...s, members: s.members.map(m=>m.id===id?{...m,role:newRole}:m)}));
  const removeMember = (id) => set(s=>({...s, members: s.members.filter(m=>m.id!==id)}));
  const revokeInvite = (id) => set(s=>({...s, invites: s.invites.filter(i=>i.id!==id)}));

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Access & roles" subtitle="Teammates, pending invites, and the permissions each role carries across the workspace."
        right={isAdmin && <button style={sBtnPrimary} onClick={()=>setInviteOpen(true)}><i data-lucide="user-plus" style={{width:13,height:13}}></i> Invite teammates</button>}/>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,padding:4,background:'#F1F5F9',borderRadius:10,width:'fit-content'}}>
        {[['members',`Members · ${members.length}`],['invites',`Pending · ${invites.length}`],['roles','Role permissions']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:'7px 14px',borderRadius:7,border:'none',fontFamily:'Space Grotesk,sans-serif',fontSize:12.5,fontWeight:600,cursor:'pointer',background:tab===k?'#fff':'transparent',color:tab===k?'#0F172A':'#64748b',boxShadow:tab===k?'0 1px 3px rgba(0,0,0,0.06)':'none'}}>{l}</button>
        ))}
      </div>

      {tab==='members' && (
        <SCard>
          <div style={{display:'flex',flexDirection:'column'}}>
            {members.map((m,i)=>(
              <div key={m.id} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 4px',borderBottom: i<members.length-1?'1px solid #F1F5F9':'none'}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:m.color,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontFamily:'Space Grotesk,sans-serif',fontSize:12,fontWeight:700,flexShrink:0}}>{m.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13.5,fontWeight:600,color:'#0F172A'}}>{m.name} {m.id==='u-me' && <span style={{color:'#94a3b8',fontWeight:500,fontSize:12}}>(you)</span>}</div>
                  <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:1}}>{m.email} · {m.last}</div>
                </div>
                <SBadge tone={m.status==='active'?'green':'slate'} dot>{m.status==='active'?'Active':'Inactive'}</SBadge>
                {isAdmin ? (
                  <select value={m.role} onChange={e=>updateRole(m.id, e.target.value)} disabled={m.id==='u-me'}
                    style={{...sInputStyle, width:130, padding:'6px 10px', fontSize:12.5, cursor: m.id==='u-me'?'not-allowed':'pointer'}}>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : <SBadge tone="blue">{m.role}</SBadge>}
                {isAdmin && m.id!=='u-me' && (
                  <button onClick={()=>removeMember(m.id)} style={{background:'none',border:'none',padding:6,borderRadius:6,cursor:'pointer',color:'#94a3b8'}}><i data-lucide="trash-2" style={{width:14,height:14}}></i></button>
                )}
              </div>
            ))}
          </div>
        </SCard>
      )}

      {tab==='invites' && (
        <SCard>
          {invites.length===0 ? (
            <div style={{padding:'30px 20px',textAlign:'center',color:'#94a3b8',fontFamily:'DM Sans,sans-serif',fontSize:13}}>No pending invites.</div>
          ) : (
            <div>
              {invites.map((inv,i)=>(
                <div key={inv.id} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 4px',borderBottom:i<invites.length-1?'1px solid #F1F5F9':'none'}}>
                  <div style={{width:36,height:36,borderRadius:'50%',background:'#F1F5F9',border:'1px dashed #CBD5E1',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <i data-lucide="mail" style={{width:15,height:15,color:'#94a3b8'}}></i>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13.5,fontWeight:600,color:'#0F172A'}}>{inv.email}</div>
                    <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:1}}>Invited {inv.sent} by {inv.by} · expires in {inv.expires}</div>
                  </div>
                  <SBadge tone="amber" dot>Pending</SBadge>
                  <SBadge tone="blue">{inv.role}</SBadge>
                  {isAdmin && <>
                    <button style={{...sBtnGhost, padding:'6px 11px', fontSize:12}}><i data-lucide="send" style={{width:12,height:12}}></i> Resend</button>
                    <button onClick={()=>revokeInvite(inv.id)} style={{...sBtnDanger, padding:'6px 11px', fontSize:12}}>Revoke</button>
                  </>}
                </div>
              ))}
            </div>
          )}
        </SCard>
      )}

      {tab==='roles' && <RolesMatrix />}

      {inviteOpen && <InviteModal onClose={()=>setInviteOpen(false)} onSend={(newInvites)=>{set(s=>({...s, invites:[...newInvites,...s.invites]})); setInviteOpen(false);}} />}
    </div>
  );
}

function RolesMatrix() {
  const rows = [
    ['Discover companies', true, true, true, true],
    ['Add to Command Center', true, true, true, false],
    ['Launch Outbound campaigns', true, true, true, false],
    ['Connect inbox / sending accounts', true, true, true, false],
    ['Build and send RFPs', true, true, true, false],
    ['Invite teammates', true, true, false, false],
    ['Manage billing', true, false, false, false],
    ['Manage integrations', true, true, false, false],
    ['Delete workspace', true, false, false, false],
  ];
  const roles = ['Admin','Manager','Member','Viewer'];
  return (
    <SCard>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontFamily:'DM Sans,sans-serif'}}>
          <thead>
            <tr>
              <th style={{textAlign:'left',padding:'8px 12px',fontSize:11,color:'#94a3b8',letterSpacing:'0.06em',textTransform:'uppercase',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,borderBottom:'1px solid #E5E7EB'}}>Permission</th>
              {roles.map(r=><th key={r} style={{textAlign:'center',padding:'8px 12px',fontSize:11,color:'#94a3b8',letterSpacing:'0.06em',textTransform:'uppercase',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,borderBottom:'1px solid #E5E7EB'}}>{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([perm, ...flags],i)=>(
              <tr key={perm} style={{borderBottom: i<rows.length-1?'1px solid #F1F5F9':'none'}}>
                <td style={{padding:'11px 12px',fontSize:13,color:'#0F172A',fontFamily:'Space Grotesk,sans-serif',fontWeight:500}}>{perm}</td>
                {flags.map((f,j)=>(
                  <td key={j} style={{textAlign:'center',padding:'11px 12px'}}>
                    {f
                      ? <i data-lucide="check" style={{width:14,height:14,color:'#22c55e'}}></i>
                      : <i data-lucide="minus" style={{width:14,height:14,color:'#CBD5E1'}}></i>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SCard>
  );
}

function InviteModal({ onClose, onSend }) {
  const [rows, setRows] = React.useState([
    { email:'', role:'member' },
    { email:'', role:'member' },
  ]);
  const [message, setMessage] = React.useState("Hey — adding you to our Logistic Intel workspace so we can share pipeline and coordinate outbound. See you inside.");

  const upd = (i,k,v) => setRows(r => r.map((x,j)=>j===i?{...x,[k]:v}:x));
  const addRow = () => setRows(r => [...r, {email:'',role:'member'}]);
  const rmRow = (i) => setRows(r => r.filter((_,j)=>j!==i));

  const valid = rows.filter(r=>r.email.trim());

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:620,boxShadow:'0 20px 60px rgba(0,0,0,0.3)',display:'flex',flexDirection:'column',maxHeight:'90vh'}}>
        <div style={{padding:'20px 24px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:18,fontWeight:700,color:'#0F172A',letterSpacing:'-0.01em'}}>Invite teammates</div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#64748b',marginTop:3}}>Send Logistic Intel invites with a role and a custom message.</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',padding:6,cursor:'pointer',color:'#64748b'}}><i data-lucide="x" style={{width:18,height:18}}></i></button>
        </div>
        <div style={{padding:'20px 24px',overflowY:'auto',display:'flex',flexDirection:'column',gap:16}}>
          <div>
            <label style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12,fontWeight:600,color:'#334155',display:'block',marginBottom:8}}>Invite by email</label>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {rows.map((r,i)=>(
                <div key={i} style={{display:'flex',gap:8,alignItems:'center'}}>
                  <div style={{flex:1}}><SInput placeholder="teammate@company.com" value={r.email} onChange={e=>upd(i,'email',e.target.value)}/></div>
                  <div style={{width:140}}><SSelect value={r.role} onChange={e=>upd(i,'role',e.target.value)} options={[{value:'admin',label:'Admin'},{value:'manager',label:'Manager'},{value:'member',label:'Member'},{value:'viewer',label:'Viewer'}]}/></div>
                  {rows.length>1 && <button onClick={()=>rmRow(i)} style={{background:'none',border:'none',padding:6,cursor:'pointer',color:'#94a3b8'}}><i data-lucide="x" style={{width:14,height:14}}></i></button>}
                </div>
              ))}
            </div>
            <button onClick={addRow} style={{marginTop:8,background:'none',border:'none',color:'#3b82f6',fontFamily:'Space Grotesk,sans-serif',fontSize:12.5,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:4,padding:'4px 0'}}><i data-lucide="plus" style={{width:13,height:13}}></i> Add another</button>
          </div>
          <SField label="Custom message" hint="Personal note included at the top of each invite email.">
            <STextarea rows={4} value={message} onChange={e=>setMessage(e.target.value)}/>
          </SField>
          <div style={{background:'#F0F9FF',border:'1px solid #BAE6FD',borderRadius:10,padding:'11px 14px',display:'flex',gap:10,alignItems:'flex-start'}}>
            <i data-lucide="info" style={{width:14,height:14,color:'#0369a1',marginTop:2,flexShrink:0}}></i>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#0c4a6e',lineHeight:1.5}}>
              Seats count against your workspace plan. You currently have <strong>3 available seats</strong> on the Growth plan. Adding more will prorate at $59/seat/mo.
            </div>
          </div>
        </div>
        <div style={{padding:'16px 24px',borderTop:'1px solid #F1F5F9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12,color:'#64748b'}}>{valid.length} invite{valid.length===1?'':'s'} ready</div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose} style={sBtnGhost}>Cancel</button>
            <button disabled={valid.length===0} onClick={()=>{
              const now = new Date();
              const newInvites = valid.map((v,i)=>({id:`inv-${Date.now()}-${i}`, email:v.email, role:v.role, sent:'just now', by:'Jordan Davis', expires:'7 days'}));
              onSend(newInvites);
            }} style={{...sBtnPrimary, opacity: valid.length===0?0.5:1}}>
              <i data-lucide="send" style={{width:13,height:13}}></i> Send {valid.length || ''} invite{valid.length===1?'':'s'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SectionHeader, ProfileSection, OrganizationSection, AccessSection });
