// SettingsPrefs.jsx — Campaign/Pipeline prefs, Team subs, Feature flags
'use strict';

function CampaignPrefsSection({ state, set }) {
  const c = state.campaignPrefs;
  const upd = (k,v)=>set(s=>({...s, campaignPrefs:{...s.campaignPrefs,[k]:v}}));
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Campaign preferences" subtitle="Defaults that the Outbound Engine uses when you spin up a new campaign."/>
      <SCard title="Sequence defaults">
        <div className="lit-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <SField label="Default steps per sequence"><SInput type="number" value={c.defaultSteps} onChange={e=>upd('defaultSteps',Number(e.target.value))}/></SField>
          <SField label="Default gap between steps (days)"><SInput type="number" value={c.defaultGap} onChange={e=>upd('defaultGap',Number(e.target.value))}/></SField>
          <SField label="Default template">
            <SSelect value={c.defaultTemplate} onChange={e=>upd('defaultTemplate',e.target.value)} options={['Cold Outreach','Value Proposition','Meeting Request','Re-engagement']}/>
          </SField>
          <SField label="A/B test subject lines" hint="Auto-variant split on every new campaign.">
            <SSelect value={c.abTest} onChange={e=>upd('abTest',e.target.value)} options={['On · 50/50','On · 70/30','Off']}/>
          </SField>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:14}}>
          <SToggle checked={c.stopOnReply} onChange={v=>upd('stopOnReply',v)} label="Stop sequence on reply" sub="Pause follow-ups the moment a prospect replies."/>
          <SToggle checked={c.stopOnMeeting} onChange={v=>upd('stopOnMeeting',v)} label="Stop sequence on meeting" sub="Pause when a meeting is booked."/>
          <SToggle checked={c.trackOpens} onChange={v=>upd('trackOpens',v)} label="Track opens" sub="Pixel-based open tracking."/>
          <SToggle checked={c.trackClicks} onChange={v=>upd('trackClicks',v)} label="Track clicks" sub="Rewrite links for click attribution."/>
        </div>
      </SCard>
    </div>
  );
}

function PipelinePrefsSection({ state, set }) {
  const p = state.pipelinePrefs;
  const upd = (k,v)=>set(s=>({...s, pipelinePrefs:{...s.pipelinePrefs,[k]:v}}));
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="RFP & pipeline preferences" subtitle="How Command Center and Deal Builder behave for you by default."/>
      <SCard title="Pipeline stages" subtitle="Rename or reorder. Applies across the workspace.">
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {p.stages.map((st,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#F8FAFC',border:'1px solid #E5E7EB',borderRadius:10}}>
              <i data-lucide="grip-vertical" style={{width:14,height:14,color:'#94a3b8',cursor:'grab'}}></i>
              <div style={{width:10,height:10,borderRadius:'50%',background:st.color}}/>
              <div style={{flex:1,fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:600,color:'#0F172A'}}>{st.name}</div>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'#64748b'}}>{st.count} deals</div>
              <button style={{background:'none',border:'none',padding:4,cursor:'pointer',color:'#94a3b8'}}><i data-lucide="pencil" style={{width:12,height:12}}></i></button>
            </div>
          ))}
        </div>
      </SCard>
      <SCard title="RFP defaults" subtitle="Applied to new RFPs in Deal Builder.">
        <div className="lit-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <SField label="Default response window"><SSelect value={p.rfpWindow} onChange={e=>upd('rfpWindow',e.target.value)} options={['3 days','5 days','7 days','10 days','14 days']}/></SField>
          <SField label="Auto-assign to"><SSelect value={p.autoAssign} onChange={e=>upd('autoAssign',e.target.value)} options={['Round robin','Deal owner','Account owner','Me']}/></SField>
          <SField label="Lane benchmark source"><SSelect value={p.benchmark} onChange={e=>upd('benchmark',e.target.value)} options={['LIT shipment index','Xeneta','Freightos','Custom carrier RFQs']}/></SField>
          <SField label="Currency"><SSelect value={p.currency} onChange={e=>upd('currency',e.target.value)} options={['USD','EUR','GBP','SGD','JPY']}/></SField>
        </div>
      </SCard>
    </div>
  );
}

function TeamSubsSection({ state, plan }) {
  const b = state.billing;
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Team subscriptions" subtitle="Who's using what seat. Used for license allocation and billing attribution."/>
      <SCard title={`${b.seatsUsed} of ${b.seats} seats in use`} subtitle="Allocate seats per teammate. Unused seats free up at renewal.">
        {state.members.map((m,i)=>(
          <div key={m.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:i<state.members.length-1?'1px solid #F1F5F9':'none'}}>
            <div style={{width:32,height:32,borderRadius:'50%',background:m.color,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontFamily:'Space Grotesk,sans-serif',fontSize:11,fontWeight:700}}>{m.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:600,color:'#0F172A'}}>{m.name}</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11.5,color:'#64748b'}}>{m.email}</div>
            </div>
            <SBadge tone={m.seatTier==='scale'?'violet':'blue'}>{m.seatTier||'growth'} seat</SBadge>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:12.5,fontWeight:600,color:'#0F172A',width:80,textAlign:'right'}}>${m.seatTier==='scale'?349:149}/mo</div>
          </div>
        ))}
      </SCard>
    </div>
  );
}

function FlagsSection({ state, set, role }) {
  if (role !== 'super') {
    return (
      <div style={{display:'flex',flexDirection:'column',gap:20}}>
        <SectionHeader title="Feature flags" subtitle="Internal-only controls for Logistic Intel staff."/>
        <SCard>
          <div style={{display:'flex',alignItems:'center',gap:14,padding:'8px 0'}}>
            <div style={{width:36,height:36,borderRadius:10,background:'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <i data-lucide="shield-x" style={{width:15,height:15,color:'#64748b'}}></i>
            </div>
            <div>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:14,fontWeight:700,color:'#0F172A'}}>Superadmin only</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#64748b',marginTop:2}}>This module is restricted to Logistic Intel internal staff.</div>
            </div>
          </div>
        </SCard>
      </div>
    );
  }
  const f = state.flags;
  const upd = (k,v)=>set(s=>({...s, flags:{...s.flags,[k]:v}}));
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionHeader title="Feature flags" subtitle="Internal override controls. Changes are workspace-scoped and logged." right={<SBadge tone="violet" icon="shield-check">Superadmin</SBadge>}/>
      <SCard title="Experimental modules" subtitle="Unreleased features that can be toggled on for this workspace.">
        <div className="lit-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <SToggle checked={f.aiInsights} onChange={v=>upd('aiInsights',v)} label="AI shipper insights" sub="LLM-generated company summaries in Intelligence Panel."/>
          <SToggle checked={f.predictiveScore} onChange={v=>upd('predictiveScore',v)} label="Predictive fit score" sub="ML ranking for shipper match quality."/>
          <SToggle checked={f.multiInbox} onChange={v=>upd('multiInbox',v)} label="Multi-inbox rotation" sub="Round-robin sends across connected inboxes."/>
          <SToggle checked={f.webhookV2} onChange={v=>upd('webhookV2',v)} label="Webhook v2 schema" sub="New event payload shape with richer metadata."/>
          <SToggle checked={f.newDashboard} onChange={v=>upd('newDashboard',v)} label="Dashboard v2" sub="Redesigned dashboard with live shipment map."/>
          <SToggle checked={f.dealExports} onChange={v=>upd('dealExports',v)} label="Deal Builder CSV exports" sub="Export RFP batches to CSV."/>
        </div>
      </SCard>
      <SCard title="Overrides" subtitle="Force-enable entitlements regardless of plan. For support &amp; QA only." danger>
        <div className="lit-grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <SToggle checked={f.forceEnterprise} onChange={v=>upd('forceEnterprise',v)} label="Force enterprise entitlements" sub="Unlock all enterprise-gated modules."/>
          <SToggle checked={f.unlimitedCredits} onChange={v=>upd('unlimitedCredits',v)} label="Unlimited credits" sub="Bypass credit consumption caps."/>
        </div>
      </SCard>
    </div>
  );
}

Object.assign(window, { CampaignPrefsSection, PipelinePrefsSection, TeamSubsSection, FlagsSection });
