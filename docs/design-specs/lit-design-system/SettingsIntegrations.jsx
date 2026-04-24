// SettingsIntegrations.jsx — Integrations, outreach accounts, billing, affiliate, alerts, security
'use strict';

/* ═══════════════════════════════════════════════════
   4. INTEGRATIONS
   ═════════════════════════════════════════════════ */
function IntegrationsSection({ state, set, role }) {
  const ints = state.integrations;
  const toggleInt = (k, connected) => set(s=>({...s, integrations:{...s.integrations, [k]:{...s.integrations[k], connected, connectedAt: connected?'just now':null }}}));
  const isAdmin = role === 'admin' || role === 'super';

  const providers = [
    { key:'gmail', name:'Gmail', cat:'Inbox / Sending', icon:'mail', desc:'Send outbound directly from your Gmail account. Required to launch campaigns.', critical:true, account:ints.gmail.account },
    { key:'outlook', name:'Outlook', cat:'Inbox / Sending', icon:'inbox', desc:'Send outbound directly from your Outlook / Microsoft 365 account.', critical:true, account:ints.outlook.account },
    { key:'linkedin', name:'LinkedIn (via PhantomBuster)', cat:'Social Engagement', icon:'linkedin', desc:'Sync connection requests, InMail sends, and reply signals to the pipeline.', account:ints.linkedin.account },
    { key:'apollo', name:'Apollo', cat:'Contact Enrichment', icon:'user-search', desc:'Resolve contact details for shipper decision-makers surfaced in Discover.', account:ints.apollo.account },
    { key:'importyeti', name:'ImportYeti', cat:'Shipment Data', icon:'ship', desc:'Cross-reference US customs data with LIT shipment intelligence.', adminOnly:true, account:ints.importyeti.account },
    { key:'webhook', name:'Outbound webhook', cat:'Automation', icon:'webhook', desc:'Receive POST events when deals change stage, replies come in, or campaigns finish.', adminOnly:true, account:ints.webhook.account },
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Integrations" subtitle="Connect your inboxes, enrichment providers, and data sources. Inbox connections power the Outbound Engine." />

      {/* Critical banner if no inbox connected */}
      {!ints.gmail.connected && !ints.outlook.connected && (
        <div style={{background:'linear-gradient(180deg,#FEF2F2,#FFFBFA)',border:'1px solid #FECACA',borderRadius:12,padding:'14px 18px',display:'flex',gap:12,alignItems:'flex-start'}}>
          <div style={{width:32,height:32,borderRadius:8,background:'#FEE2E2',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <i data-lucide="alert-triangle" style={{width:15,height:15,color:'#b91c1c'}}></i>
          </div>
          <div style={{flex:1}}>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13.5,fontWeight:700,color:'#7f1d1d'}}>No inbox connected</div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#991b1b',marginTop:3}}>Campaigns can't send until you connect Gmail or Outlook. This is the #1 blocker for outreach launches.</div>
          </div>
          <button style={sBtnDark} onClick={()=>toggleInt('gmail',true)}><i data-lucide="mail" style={{width:13,height:13}}></i> Connect Gmail</button>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(420px,1fr))',gap:14}}>
        {providers.filter(p => !p.adminOnly || isAdmin).map(p => (
          <IntegrationCard key={p.key} provider={p} connected={ints[p.key].connected} onConnect={()=>toggleInt(p.key, !ints[p.key].connected)} />
        ))}
      </div>
    </div>
  );
}

function IntegrationCard({ provider, connected, onConnect }) {
  return (
    <div style={{background:'#fff',border: connected?'1px solid #BBF7D0':'1px solid #E5E7EB',borderRadius:12,padding:18,display:'flex',flexDirection:'column',gap:14,boxShadow:'0 1px 3px rgba(15,23,42,0.04)',transition:'all 160ms'}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
        <div style={{width:40,height:40,borderRadius:10,background: connected?'#F0FDF4':'#F1F5F9',border:`1px solid ${connected?'#BBF7D0':'#E5E7EB'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <i data-lucide={provider.icon} style={{width:18,height:18,color: connected?'#15803d':'#64748b'}}></i>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:14,fontWeight:700,color:'#0F172A'}}>{provider.name}</div>
            {provider.critical && <SBadge tone="blue">Required for sending</SBadge>}
            {provider.adminOnly && <SBadge tone="violet" icon="shield">Admin</SBadge>}
          </div>
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#94a3b8',marginTop:2,letterSpacing:'0.05em',textTransform:'uppercase',fontWeight:600}}>{provider.cat}</div>
        </div>
        <SBadge tone={connected?'green':'slate'} dot>{connected?'Connected':'Not connected'}</SBadge>
      </div>
      <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#475569',lineHeight:1.55}}>{provider.desc}</div>
      {connected && provider.account && (
        <div style={{background:'#F8FAFC',border:'1px solid #E5E7EB',borderRadius:8,padding:'10px 12px',display:'flex',alignItems:'center',gap:10}}>
          <i data-lucide="check-circle-2" style={{width:14,height:14,color:'#22c55e'}}></i>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,fontWeight:600,color:'#0F172A',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{provider.account}</div>
          </div>
        </div>
      )}
      <div style={{display:'flex',gap:8,marginTop:'auto'}}>
        {connected ? (
          <>
            <button style={{...sBtnGhost, flex:1, justifyContent:'center'}}><i data-lucide="refresh-cw" style={{width:12,height:12}}></i> Reconnect</button>
            <button style={{...sBtnDanger, flex:1, justifyContent:'center'}} onClick={onConnect}><i data-lucide="unplug" style={{width:12,height:12}}></i> Disconnect</button>
          </>
        ) : (
          <button style={{...sBtnPrimary, flex:1, justifyContent:'center'}} onClick={onConnect}><i data-lucide="link" style={{width:13,height:13}}></i> Connect {provider.name.split(' ')[0]}</button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   5. OUTREACH ACCOUNTS — Deep inbox/sending config
   ═════════════════════════════════════════════════ */
function OutreachSection({ state, set }) {
  const o = state.outreach;
  const ints = state.integrations;
  const upd = (k,v) => set(s=>({...s, outreach:{...s.outreach, [k]:v}}));

  const anyInbox = ints.gmail.connected || ints.outlook.connected;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Outreach accounts" subtitle="Sender identity, inbox configuration, and sending eligibility. What Outbound Engine reads when launching a campaign."/>

      {/* Campaign-readiness stoplight */}
      <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:'18px 20px',display:'flex',alignItems:'center',gap:20,boxShadow:'0 1px 3px rgba(15,23,42,0.04)'}}>
        <div style={{width:52,height:52,borderRadius:12,background: anyInbox?'linear-gradient(135deg,#DCFCE7,#BBF7D0)':'linear-gradient(135deg,#FEE2E2,#FECACA)',border:`1px solid ${anyInbox?'#BBF7D0':'#FECACA'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <i data-lucide={anyInbox?'rocket':'alert-triangle'} style={{width:22,height:22,color: anyInbox?'#15803d':'#b91c1c'}}></i>
        </div>
        <div style={{flex:1}}>
          <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:15,fontWeight:700,color:'#0F172A',letterSpacing:'-0.01em'}}>
            Campaign sending: {anyInbox ? <span style={{color:'#15803d'}}>Ready</span> : <span style={{color:'#b91c1c'}}>Blocked</span>}
          </div>
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#64748b',marginTop:3}}>
            {anyInbox
              ? `${[ints.gmail.connected&&'Gmail',ints.outlook.connected&&'Outlook'].filter(Boolean).join(' + ')} connected. Daily send cap: ${o.dailyCap}. Warmup: ${o.warmup?'on':'off'}.`
              : 'Connect Gmail or Outlook to enable outbound sends. Campaigns will stay in draft until an inbox is linked.'}
          </div>
        </div>
        <div style={{display:'flex',gap:12,flexShrink:0}}>
          <ReadinessDot ok={anyInbox} label="Inbox"/>
          <ReadinessDot ok={!!o.senderName} label="Identity"/>
          <ReadinessDot ok={!!o.signature} label="Signature"/>
          <ReadinessDot ok={o.dnsVerified} label="SPF/DKIM"/>
        </div>
      </div>

      <SCard title="Default sender identity" subtitle="Used on new campaigns unless a different sender is picked at send time.">
        <div className="lit-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <SField label="Sender name"><SInput value={o.senderName} onChange={e=>upd('senderName',e.target.value)} placeholder="Jordan Davis"/></SField>
          <SField label="Sending account">
            <SSelect value={o.senderAccount} onChange={e=>upd('senderAccount',e.target.value)}
              options={[
                { value:'gmail', label: ints.gmail.connected ? `Gmail · ${ints.gmail.account}` : 'Gmail (not connected)' },
                { value:'outlook', label: ints.outlook.connected ? `Outlook · ${ints.outlook.account}` : 'Outlook (not connected)' },
              ]}/>
          </SField>
          <SField label="Reply-to" hint="Where replies route. Defaults to sending account."><SInput value={o.replyTo} onChange={e=>upd('replyTo',e.target.value)}/></SField>
          <SField label="Tracking domain" hint="Custom domain for open &amp; click tracking (CNAME required)."><SInput value={o.trackingDomain} onChange={e=>upd('trackingDomain',e.target.value)}/></SField>
          <SField label="Outbound signature" hint="Appended to every campaign send. Merge tags supported." span={2}>
            <STextarea rows={4} value={o.signature} onChange={e=>upd('signature',e.target.value)}/>
          </SField>
        </div>
      </SCard>

      <SCard title="Sending preferences" subtitle="Velocity, quiet hours, and deliverability guardrails. Applied at the account level across all campaigns.">
        <div className="lit-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <SField label="Daily send cap" hint="Max new outbound per day across campaigns.">
            <SInput type="number" value={o.dailyCap} onChange={e=>upd('dailyCap', Number(e.target.value))}/>
          </SField>
          <SField label="Min gap between sends (sec)" hint="Throttle to look human.">
            <SInput type="number" value={o.minGap} onChange={e=>upd('minGap', Number(e.target.value))}/>
          </SField>
          <SField label="Quiet hours start"><SSelect value={o.quietStart} onChange={e=>upd('quietStart',e.target.value)} options={['18:00','19:00','20:00','21:00','22:00']}/></SField>
          <SField label="Quiet hours end"><SSelect value={o.quietEnd} onChange={e=>upd('quietEnd',e.target.value)} options={['06:00','07:00','08:00','09:00','10:00']}/></SField>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:14}}>
          <SToggle checked={o.warmup} onChange={v=>upd('warmup',v)} label="Inbox warmup" sub="Auto-reply network to build sender reputation."/>
          <SToggle checked={o.skipWeekends} onChange={v=>upd('skipWeekends',v)} label="Skip weekends" sub="Pause sends Saturday &amp; Sunday."/>
          <SToggle checked={o.autoUnsubscribe} onChange={v=>upd('autoUnsubscribe',v)} label="Auto-unsubscribe link" sub="Append compliant one-click unsubscribe."/>
          <SToggle checked={o.dnsVerified} onChange={v=>upd('dnsVerified',v)} label="SPF / DKIM verified" sub="Domain authentication confirmed."/>
        </div>
      </SCard>
    </div>
  );
}

function ReadinessDot({ ok, label }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <span style={{width:8,height:8,borderRadius:'50%',background: ok?'#22c55e':'#CBD5E1',boxShadow: ok?'0 0 6px rgba(34,197,94,0.5)':'none'}}/>
      <span style={{fontFamily:'Space Grotesk,sans-serif',fontSize:11.5,fontWeight:600,color: ok?'#15803d':'#94a3b8'}}>{label}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   6. BILLING & PLANS
   ═════════════════════════════════════════════════ */
function BillingSection({ state, set, plan, role, onPlanChange }) {
  const isAdmin = role === 'admin' || role === 'super';
  const b = state.billing;

  const PLANS = [
    { id:'free',    name:'Free',       price:'$0',  period:'/mo',    seats:'1 seat',    features:['1,000 company discoveries/mo','Basic Intelligence Panel','Email support'] },
    { id:'growth',  name:'Growth',     price:'$149', period:'/seat/mo', seats:'Up to 10 seats', features:['Unlimited Discover','Outbound Engine (3 inboxes)','Command Center CRM','Deal Builder'] },
    { id:'scale',   name:'Scale',      price:'$349', period:'/seat/mo', features:['Everything in Growth','Unlimited inboxes + warmup','API access','Custom tracking domain','Dedicated CSM'], highlighted:true },
    { id:'enterprise', name:'Enterprise', price:'Custom', features:['SSO / SAML','Data residency controls','Private deployments','SLA + security review'] },
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Plan & billing" subtitle="Subscription, seat count, credit balance, invoices. Source of truth is Stripe — changes sync back within a minute." right={isAdmin && <button style={sBtnGhost}><i data-lucide="external-link" style={{width:13,height:13}}></i> Open billing portal</button>}/>

      {/* Current plan overview */}
      <div style={{background:'linear-gradient(180deg,#0F172A,#1e293b)',borderRadius:14,padding:'22px 24px',color:'#fff',display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:24,alignItems:'center',border:'1px solid #0F172A',boxShadow:'0 6px 20px rgba(15,23,42,0.3)'}}>
        <div>
          <div style={{fontSize:11,fontFamily:'Space Grotesk,sans-serif',fontWeight:600,color:'#60a5fa',letterSpacing:'0.08em',textTransform:'uppercase'}}>Current plan</div>
          <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:28,fontWeight:700,letterSpacing:'-0.02em',marginTop:4}}>
            {PLANS.find(p=>p.id===plan)?.name || 'Growth'} <span style={{color:'#94a3b8',fontSize:16,fontWeight:500}}>· billed monthly</span>
          </div>
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#cbd5e1',marginTop:6}}>Renews May 18, 2026 · auto-renew on · {b.seatsUsed} of {b.seats} seats active</div>
        </div>
        <BillingStat label="Monthly spend" value={`$${b.mrr.toLocaleString()}`}/>
        <BillingStat label="Seats" value={`${b.seatsUsed} / ${b.seats}`}/>
        <BillingStat label="Credits" value={b.credits.toLocaleString()}/>
      </div>

      {/* Plan selector */}
      <SCard title="Available plans" subtitle="Billed through Stripe. Plan changes take effect immediately — prorated against your current period.">
        <div className="lit-grid-4" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
          {PLANS.map(p => (
            <div key={p.id} style={{border: plan===p.id?'2px solid #3b82f6':(p.highlighted?'1.5px solid #BFDBFE':'1px solid #E5E7EB'),borderRadius:12,padding:16,background: plan===p.id?'#EFF6FF':'#fff',position:'relative',display:'flex',flexDirection:'column',gap:10}}>
              {p.highlighted && plan!==p.id && <div style={{position:'absolute',top:-9,left:12,background:'#3b82f6',color:'#fff',fontFamily:'Space Grotesk,sans-serif',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:999,letterSpacing:'0.04em'}}>RECOMMENDED</div>}
              <div>
                <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:14,fontWeight:700,color:'#0F172A'}}>{p.name}</div>
                <div style={{display:'flex',alignItems:'baseline',gap:3,marginTop:4}}>
                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:22,fontWeight:700,color:'#0F172A',letterSpacing:'-0.02em'}}>{p.price}</div>
                  {p.period && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11.5,color:'#94a3b8'}}>{p.period}</div>}
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:5,flex:1}}>
                {p.features.map(f=>(
                  <div key={f} style={{display:'flex',gap:6,alignItems:'flex-start'}}>
                    <i data-lucide="check" style={{width:12,height:12,color:'#22c55e',marginTop:3,flexShrink:0}}></i>
                    <span style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#475569',lineHeight:1.5}}>{f}</span>
                  </div>
                ))}
              </div>
              <button
                disabled={plan===p.id || !isAdmin}
                onClick={()=>onPlanChange(p.id)}
                style={plan===p.id ? {...sBtnGhost, justifyContent:'center', opacity:0.6, cursor:'default'} : {...sBtnPrimary, justifyContent:'center'}}>
                {plan===p.id ? 'Current plan' : (p.id==='enterprise' ? 'Contact sales' : 'Switch plan')}
              </button>
            </div>
          ))}
        </div>
      </SCard>

      {/* Credits + invoices */}
      <div className="lit-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <SCard title="Workspace credits" subtitle="Used for AI enrichment, contact resolution, and email validation." right={isAdmin && <button style={{...sBtnGhost,padding:'6px 11px',fontSize:12}}>Buy more</button>}>
          <div style={{display:'flex',alignItems:'baseline',gap:8}}>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:32,fontWeight:700,color:'#0F172A'}}>{b.credits.toLocaleString()}</div>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12,color:'#94a3b8'}}>of {b.creditsMax.toLocaleString()} remaining</div>
          </div>
          <div style={{height:8,background:'#F1F5F9',borderRadius:99,marginTop:10,overflow:'hidden'}}>
            <div style={{width:`${(b.credits/b.creditsMax)*100}%`,height:'100%',background:'linear-gradient(90deg,#3b82f6,#06b6d4)',borderRadius:99}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:14,fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b'}}>
            <span>Resets May 18</span>
            <span style={{fontFamily:'JetBrains Mono,monospace',fontWeight:600,color:'#0F172A'}}>{(b.creditsMax - b.credits).toLocaleString()} used this cycle</span>
          </div>
        </SCard>

        <SCard title="Recent invoices" right={<button style={{...sBtnGhost,padding:'6px 11px',fontSize:12}}><i data-lucide="download" style={{width:12,height:12}}></i> All invoices</button>}>
          <div>
            {b.invoices.map((inv,i)=>(
              <div key={inv.id} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 0',borderBottom: i<b.invoices.length-1?'1px solid #F1F5F9':'none'}}>
                <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11.5,color:'#94a3b8',width:96}}>{inv.id}</div>
                <div style={{flex:1,fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#0F172A'}}>{inv.date}</div>
                <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:13,fontWeight:600,color:'#0F172A'}}>${inv.amount.toLocaleString()}</div>
                <SBadge tone={inv.status==='paid'?'green':'amber'} dot>{inv.status==='paid'?'Paid':'Due'}</SBadge>
              </div>
            ))}
          </div>
        </SCard>
      </div>
    </div>
  );
}

function BillingStat({ label, value }) {
  return (
    <div>
      <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:22,fontWeight:700,color:'#fff'}}>{value}</div>
      <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:10,fontWeight:600,color:'#60a5fa',letterSpacing:'0.08em',textTransform:'uppercase',marginTop:3}}>{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   7. ALERTS & NOTIFICATIONS
   ═════════════════════════════════════════════════ */
function AlertsSection({ state, set }) {
  const n = state.notifications;
  const upd = (k,v) => set(s=>({...s, notifications:{...s.notifications,[k]:v}}));

  const rows = [
    { k:'replyReceived', label:'Reply received', sub:'A prospect replies to a campaign email.' },
    { k:'meetingBooked', label:'Meeting booked', sub:'A prospect books a slot on your calendar.' },
    { k:'stageChanged', label:'Deal stage changed', sub:'Someone moves a deal in Command Center.' },
    { k:'campaignFinished', label:'Campaign finished', sub:'All prospects in a sequence have completed.' },
    { k:'rfpDue', label:'RFP due within 48h', sub:'Deal Builder items approaching deadline.' },
    { k:'weeklyDigest', label:'Weekly pipeline digest', sub:'Monday morning summary.' },
    { k:'billingAlerts', label:'Billing alerts', sub:'Invoice failures, credit exhaustion.' },
    { k:'securityEvents', label:'Security events', sub:'New device login, password changes.' },
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Alerts & notifications" subtitle="Route the signals you care about to email, in-app, or Slack. Everything else stays quiet."/>
      <SCard>
        <div style={{display:'grid',gridTemplateColumns:'1fr 80px 80px 80px',gap:8,padding:'0 0 10px 4px',borderBottom:'1px solid #E5E7EB'}}>
          <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:11,fontWeight:600,color:'#94a3b8',letterSpacing:'0.06em',textTransform:'uppercase'}}>Event</div>
          {['Email','In-app','Slack'].map(h=><div key={h} style={{fontFamily:'Space Grotesk,sans-serif',fontSize:11,fontWeight:600,color:'#94a3b8',letterSpacing:'0.06em',textTransform:'uppercase',textAlign:'center'}}>{h}</div>)}
        </div>
        {rows.map((r,i)=>(
          <div key={r.k} style={{display:'grid',gridTemplateColumns:'1fr 80px 80px 80px',gap:8,padding:'12px 4px',alignItems:'center',borderBottom:i<rows.length-1?'1px solid #F1F5F9':'none'}}>
            <div>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:600,color:'#0F172A'}}>{r.label}</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:2}}>{r.sub}</div>
            </div>
            {['email','inapp','slack'].map(ch=>{
              const on = n[r.k]?.[ch];
              return (
                <div key={ch} style={{display:'flex',justifyContent:'center'}}>
                  <div onClick={()=>upd(r.k,{...n[r.k],[ch]:!on})} style={{width:32,height:18,borderRadius:10,background:on?'#3b82f6':'#CBD5E1',position:'relative',cursor:'pointer',transition:'all 160ms'}}>
                    <div style={{position:'absolute',top:2,left:on?16:2,width:14,height:14,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 2px rgba(0,0,0,0.2)',transition:'all 160ms'}}/>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </SCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   8. SECURITY & API
   ═════════════════════════════════════════════════ */
function SecuritySection({ state, set, plan }) {
  const s = state.security;
  const upd = (k,v) => set(st=>({...st, security:{...st.security,[k]:v}}));
  const apiAllowed = plan==='scale' || plan==='enterprise';

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Security & API" subtitle="Password, two-factor, active sessions, and developer API keys."/>

      <div className="lit-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <SCard title="Password" subtitle="Last changed 82 days ago.">
          <button style={sBtnGhost}><i data-lucide="key-round" style={{width:13,height:13}}></i> Change password</button>
        </SCard>
        <SCard title="Two-factor authentication" subtitle={s.twoFactor ? 'Enforced for all sign-ins to this account.' : 'Add a second step at sign-in. Recommended.'}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <SBadge tone={s.twoFactor?'green':'amber'} dot>{s.twoFactor?'Enabled · Authenticator app':'Not enabled'}</SBadge>
            <button style={sBtnGhost} onClick={()=>upd('twoFactor',!s.twoFactor)}>{s.twoFactor?'Manage':'Set up 2FA'}</button>
          </div>
        </SCard>
      </div>

      <SCard title="Active sessions" subtitle="Devices currently signed into your Logistic Intel account.">
        {s.sessions.map((ss,i)=>(
          <div key={ss.id} style={{display:'flex',alignItems:'center',gap:14,padding:'11px 0',borderBottom:i<s.sessions.length-1?'1px solid #F1F5F9':'none'}}>
            <div style={{width:34,height:34,borderRadius:8,background:'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <i data-lucide={ss.type==='desktop'?'monitor':'smartphone'} style={{width:15,height:15,color:'#64748b'}}></i>
            </div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:600,color:'#0F172A'}}>{ss.device} {ss.current && <SBadge tone="green">This device</SBadge>}</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:2}}>{ss.location} · {ss.lastActive}</div>
            </div>
            {!ss.current && <button style={{...sBtnDanger,padding:'6px 11px',fontSize:12}}>Revoke</button>}
          </div>
        ))}
      </SCard>

      <SCard title="API keys" subtitle="Programmatic access to company intelligence, pipeline, and outbound events." danger={!apiAllowed}
        right={apiAllowed && <button style={sBtnPrimary}><i data-lucide="plus" style={{width:13,height:13}}></i> New key</button>}>
        {!apiAllowed ? (
          <div style={{display:'flex',alignItems:'center',gap:14,padding:'8px 0'}}>
            <div style={{width:36,height:36,borderRadius:10,background:'#EFF6FF',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <i data-lucide="lock" style={{width:15,height:15,color:'#3b82f6'}}></i>
            </div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:700,color:'#0F172A'}}>API access is on Scale + Enterprise</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#64748b',marginTop:2}}>Upgrade to programmatically access company intelligence, pipeline, and outbound events.</div>
            </div>
          </div>
        ) : (
          <div>
            {s.apiKeys.map((k,i)=>(
              <div key={k.id} style={{display:'flex',alignItems:'center',gap:14,padding:'10px 0',borderBottom:i<s.apiKeys.length-1?'1px solid #F1F5F9':'none'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:600,color:'#0F172A'}}>{k.name}</div>
                  <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11.5,color:'#64748b',marginTop:2}}>{k.prefix}···{k.suffix} · created {k.created}</div>
                </div>
                <SBadge tone={k.scope==='read'?'blue':'violet'}>{k.scope}</SBadge>
                <button style={{...sBtnDanger,padding:'6px 11px',fontSize:12}}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </SCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   9. AFFILIATE PROGRAM
   ═════════════════════════════════════════════════ */
function AffiliateSection({ state, set }) {
  const a = state.affiliate;
  const [copied, setCopied] = React.useState(false);
  const [inviteSent, setInviteSent] = React.useState(false);
  const [emails, setEmails] = React.useState('');
  const [msg, setMsg] = React.useState(`I've been using Logistic Intel to source high-value shippers using real shipment data. Thought it might be useful for you — sign up through my link and we both get a credit bonus.`);

  function copyLink() {
    navigator.clipboard && navigator.clipboard.writeText(a.link);
    setCopied(true); setTimeout(()=>setCopied(false), 1500);
  }

  if (!a.enrolled) {
    return (
      <div style={{display:'flex',flexDirection:'column',gap:20}}>
        <SectionHeader title="Affiliate program" subtitle="Earn 20% recurring commission for 12 months on any paid workspace you refer."/>
        <div style={{background:'linear-gradient(135deg,#0F172A,#1e293b)',borderRadius:16,padding:'36px 40px',color:'#fff',position:'relative',overflow:'hidden',border:'1px solid #1e293b'}}>
          <div style={{position:'absolute',top:-60,right:-60,width:240,height:240,borderRadius:'50%',background:'radial-gradient(circle,rgba(0,240,255,0.18),transparent 70%)'}}/>
          <div style={{position:'relative',zIndex:1,maxWidth:560}}>
            <SBadge tone="cyan">Partner program</SBadge>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:32,fontWeight:700,letterSpacing:'-0.02em',marginTop:14,lineHeight:1.15}}>Get paid to refer the freight teams you already talk to.</div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:14,color:'#cbd5e1',marginTop:10,lineHeight:1.55}}>20% recurring commission for 12 months. Payout every month via Stripe. Works for brokers, forwarders, and 3PL teams.</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginTop:22}}>
              {[['20%','Recurring rate'],['12 mo','Payout window'],['$0','To join']].map(([v,l])=>(
                <div key={l} style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,padding:'12px 14px'}}>
                  <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:22,fontWeight:700,color:'#00F0FF'}}>{v}</div>
                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:10.5,fontWeight:600,color:'#94a3b8',letterSpacing:'0.06em',textTransform:'uppercase',marginTop:4}}>{l}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>set(s=>({...s, affiliate:{...s.affiliate, enrolled:true}}))} style={{marginTop:22,...sBtnPrimary,padding:'10px 18px',fontSize:14}}>
              <i data-lucide="sparkles" style={{width:14,height:14}}></i> Join the affiliate program
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Affiliate program" subtitle="Your referral link, earnings, and referred workspaces." right={<SBadge tone="green" dot>Enrolled</SBadge>}/>

      {/* Stats */}
      <div className="lit-grid-4" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
        {[
          { l:'Lifetime earnings', v:`$${a.earnings.toLocaleString()}`, icon:'dollar-sign', tone:'green' },
          { l:'Pending payout', v:`$${a.pending.toLocaleString()}`, icon:'clock', tone:'amber' },
          { l:'Referrals', v:a.referrals, icon:'users', tone:'blue' },
          { l:'Conversion rate', v:`${a.conversion}%`, icon:'trending-up', tone:'violet' },
        ].map(s=>(
          <div key={s.l} style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:'16px 18px',boxShadow:'0 1px 3px rgba(15,23,42,0.04)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:30,height:30,borderRadius:8,background:'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <i data-lucide={s.icon} style={{width:14,height:14,color:'#64748b'}}></i>
              </div>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:10.5,fontWeight:600,color:'#94a3b8',letterSpacing:'0.06em',textTransform:'uppercase'}}>{s.l}</div>
            </div>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:24,fontWeight:700,color:'#0F172A',marginTop:10}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Referral link */}
      <SCard title="Your referral link" subtitle="Share anywhere. Paid workspaces referred through this link earn you 20% for 12 months.">
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{flex:1,background:'#0F172A',borderRadius:10,padding:'11px 14px',fontFamily:'JetBrains Mono,monospace',fontSize:13,color:'#E2E8F0',display:'flex',alignItems:'center',gap:10,border:'1px solid #1e293b'}}>
            <i data-lucide="link" style={{width:13,height:13,color:'#60a5fa'}}></i>
            <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.link}</span>
          </div>
          <button onClick={copyLink} style={sBtnDark}>
            <i data-lucide={copied?'check':'copy'} style={{width:13,height:13}}></i> {copied?'Copied':'Copy link'}
          </button>
          <button style={sBtnGhost}><i data-lucide="qr-code" style={{width:13,height:13}}></i> QR</button>
        </div>
      </SCard>

      {/* Send with link */}
      <SCard title="Send invites with your affiliate link" subtitle="We'll email each recipient a personalized message including your referral link.">
        <SField label="Recipient emails" hint="Comma-separated. Up to 20 at a time."><SInput placeholder="ops@company.com, revops@another.co" value={emails} onChange={e=>setEmails(e.target.value)}/></SField>
        <div style={{height:14}}/>
        <SField label="Personal message"><STextarea rows={4} value={msg} onChange={e=>setMsg(e.target.value)}/></SField>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:14}}>
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b'}}>{emails.split(',').filter(e=>e.trim()).length} recipient{emails.split(',').filter(e=>e.trim()).length===1?'':'s'}</div>
          <button onClick={()=>{setInviteSent(true); setTimeout(()=>setInviteSent(false),2000);}} style={sBtnPrimary}>
            <i data-lucide={inviteSent?'check':'send'} style={{width:13,height:13}}></i> {inviteSent?'Invites queued':'Send invites with referral link'}
          </button>
        </div>
      </SCard>

      {/* Referred workspaces */}
      <SCard title="Referred workspaces" subtitle="Status and revenue for every workspace you've referred.">
        {a.referred.map((r,i)=>(
          <div key={r.id} style={{display:'flex',alignItems:'center',gap:14,padding:'11px 0',borderBottom:i<a.referred.length-1?'1px solid #F1F5F9':'none'}}>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#94a3b8',width:64}}>{r.id}</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:600,color:'#0F172A'}}>{r.workspace}</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:1}}>Signed up {r.signedUp} · {r.plan}</div>
            </div>
            <SBadge tone={r.status==='active'?'green':(r.status==='trial'?'amber':'slate')} dot>{r.status}</SBadge>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:13,fontWeight:600,color:'#0F172A',width:80,textAlign:'right'}}>${r.mrr}/mo</div>
          </div>
        ))}
      </SCard>
    </div>
  );
}

Object.assign(window, { IntegrationsSection, OutreachSection, BillingSection, AlertsSection, SecuritySection, AffiliateSection });
