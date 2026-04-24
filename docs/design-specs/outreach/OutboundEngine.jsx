// OutboundEngine.jsx — Full campaign composer with sequence editor, templates, schedule
'use strict';

/* ── Email templates ───────────────────────────────── */
const EMAIL_TEMPLATES = {
  cold:     { name:'Cold Outreach',      category:'Prospecting', subject:"Quick question about {{company_name}}'s freight volume",      body:"Hi {{first_name}},\n\nI came across {{company_name}} while analyzing shipment data — you're moving significant volume on the {{trade_lane}} lane, with {{shipment_count}} shipments in the past 12 months.\n\nWe built LIT to help freight sales teams identify, qualify, and close high-value shippers faster using real carrier and shipment data.\n\nWould it make sense to connect for a quick 15-minute call this week?\n\nBest,\n{{sender_name}}\nLogistics Intel" },
  followup: { name:'Follow-Up',          category:'Nurture',     subject:"Following up — {{company_name}} + LIT",                       body:"Hi {{first_name}},\n\nJust following up on my note from earlier this week.\n\n{{company_name}} is showing strong activity on the {{trade_lane}} lane — and we have real-time benchmarks that could help your team negotiate better rates with {{carrier}}.\n\nHappy to do a quick demo — does Thursday or Friday work?\n\nBest,\n{{sender_name}}" },
  final:    { name:'Final Push',         category:'Closing',     subject:"Last note — LIT for {{company_name}}",                        body:"Hi {{first_name}},\n\nI'll keep this short — last note from me.\n\nIf {{company_name}} ever wants real shipment intelligence to accelerate your outbound pipeline, I'd love to connect.\n\nJust reply \"yes\" and I'll send over a 5-minute video walkthrough.\n\n{{sender_name}}" },
  value:    { name:'Value Proposition',  category:'Prospecting', subject:"How {{company_name}} can close more freight deals",            body:"Hi {{first_name}},\n\nMost freight sales teams spend hours manually researching shippers. LIT does it in seconds — pulling real shipment data, carrier preferences, trade lanes, and spend estimates.\n\nThree things we surface instantly for {{company_name}}:\n• {{shipment_count}} shipments in the past 12 months\n• Primary route: {{trade_lane}}\n• Top carrier: {{carrier}}\n\nWorth a quick call?\n\n{{sender_name}}" },
  meeting:  { name:'Meeting Request',    category:'Closing',     subject:"15 min — freight intelligence for {{company_name}}",          body:"Hi {{first_name}},\n\nI'd love to show you how LIT is helping logistics teams find and close high-value shippers faster.\n\nFor {{company_name}}, I can walk through:\n• Your current shipment footprint and spend profile\n• Benchmark rates on the {{trade_lane}} lane\n• 3–5 similar shippers you might not be reaching\n\nDoes Tuesday at 10am or Wednesday at 2pm work?\n\n{{sender_name}}" },
  reengage: { name:'Re-engagement',      category:'Nurture',     subject:"Checking back in — {{company_name}}",                         body:"Hi {{first_name}},\n\nWe last connected a few months back — {{company_name}}'s shipment volume has increased significantly since then.\n\nIf timing is better now, I'd love to reconnect and show you what's new in LIT.\n\nWorth a quick catch-up?\n\n{{sender_name}}" },
};

const VARS = ['{{first_name}}','{{company_name}}','{{trade_lane}}','{{shipment_count}}','{{carrier}}','{{sender_name}}'];

const CAMPAIGN_DATA = [
  { id:'c1', name:'Q2 Top Shippers Push',  status:'active', steps:3, enrolled:1240, opens:'34%', replies:'8.2%', created:'Mar 15' },
  { id:'c2', name:'Carrier Upgrade Seq.',  status:'active', steps:4, enrolled:580,  opens:'41%', replies:'11%',  created:'Mar 28' },
  { id:'c3', name:'Cold Import Re-engage', status:'paused', steps:3, enrolled:890,  opens:'22%', replies:'4.1%', created:'Apr 2'  },
  { id:'c4', name:'NorthAmerica Lane Exp', status:'draft',  steps:2, enrolled:0,    opens:'—',   replies:'—',    created:'Apr 10' },
];

function makeStep(id, tpl, day, waitDays) {
  const t = EMAIL_TEMPLATES[tpl];
  return { id, type:'email', day, waitDays, subject: t.subject, body: t.body, templateKey: tpl };
}

const NEW_CAMPAIGN_STEPS = [
  makeStep('s1','cold',     0, 3),
  makeStep('s2','followup', 3, 5),
  makeStep('s3','final',    8, 0),
];

/* ── Variable highlighter ──────────────────────────── */
function HighlightedBody({ text }) {
  const parts = text.split(/({{[^}]+}})/g);
  return (
    <span style={{whiteSpace:'pre-wrap',fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#374151',lineHeight:1.7}}>
      {parts.map((p,i) =>
        p.startsWith('{{') && p.endsWith('}}')
          ? <mark key={i} style={{background:'rgba(59,130,246,0.1)',color:'#2563EB',borderRadius:3,padding:'0 2px',fontFamily:'Space Grotesk,sans-serif',fontSize:12,fontWeight:600}}>{p}</mark>
          : p
      )}
    </span>
  );
}

/* ── Main OutboundEngine ───────────────────────────── */
function OutboundEngine() {
  const [view, setView]           = React.useState('list'); // 'list' | 'compose'
  const [editCampaign, setEdit]   = React.useState(null);

  function openComposer(campaign) {
    setEdit(campaign || { id:'new', name:'New Campaign', steps:[...NEW_CAMPAIGN_STEPS], status:'draft' });
    setView('compose');
  }

  if (view === 'compose') return <CampaignComposer campaign={editCampaign} onBack={()=>setView('list')} />;
  return <CampaignList campaigns={CAMPAIGN_DATA} onCreate={()=>openComposer(null)} onEdit={openComposer} />;
}

/* ── Campaign list ─────────────────────────────────── */
function CampaignList({ campaigns, onCreate, onEdit }) {
  const sStyle = {
    active: { dot:'#22C55E', color:'#15803d', bg:'#F0FDF4', border:'#BBF7D0' },
    paused: { dot:'#F59E0B', color:'#B45309', bg:'#FFFBEB', border:'#FDE68A' },
    draft:  { dot:'#94A3B8', color:'#64748b', bg:'#F1F5F9', border:'#E2E8F0' },
  };
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#F8FAFC'}}>
      {/* Header */}
      <div style={{padding:'20px 24px 16px',borderBottom:'1px solid #E5E7EB',background:'#FFFFFF',flexShrink:0,display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div>
          <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:20,fontWeight:700,color:'#0F172A',letterSpacing:'-0.02em'}}>Outbound Engine</div>
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#64748b',marginTop:2}}>{campaigns.length} campaigns · Automated freight outreach sequences</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button style={OE.ghostBtn}><i data-lucide="bar-chart-2" style={{width:13,height:13}}></i> Analytics</button>
          <button onClick={onCreate} style={OE.primaryBtn}><i data-lucide="plus" style={{width:13,height:13}}></i> New Campaign</button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',background:'#FFFFFF',borderBottom:'1px solid #E5E7EB',flexShrink:0}}>
        {[{l:'Emails Sent',v:'2,710'},{l:'Avg Open Rate',v:'31%'},{l:'Avg Reply Rate',v:'7.8%'},{l:'Meetings Booked',v:'44'}].map((s,i)=>(
          <div key={s.l} style={{padding:'12px 20px',borderRight:i<3?'1px solid #F1F5F9':'none'}}>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:600,color:'#1d4ed8'}}>{s.v}</div>
            <div style={{fontSize:10,color:'#94a3b8',fontFamily:'Space Grotesk,sans-serif',letterSpacing:'0.04em',marginTop:2,fontWeight:600,textTransform:'uppercase'}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Campaign rows */}
      <div style={{flex:1,overflowY:'auto',padding:'16px 24px',display:'flex',flexDirection:'column',gap:10}}>
        {campaigns.map(c=>{
          const s=sStyle[c.status]||sStyle.draft;
          return(
            <div key={c.id} style={{background:'linear-gradient(180deg,#FFFFFF,#FAFBFC)',border:'1px solid #E5E7EB',borderRadius:12,padding:'16px 20px',display:'flex',alignItems:'center',gap:20,cursor:'pointer',boxShadow:'0 2px 8px rgba(15,23,42,0.04)',transition:'all 150ms'}}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px rgba(15,23,42,0.08)';e.currentTarget.style.borderColor='#CBD5E1';}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 2px 8px rgba(15,23,42,0.04)';e.currentTarget.style.borderColor='#E5E7EB';}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:14,fontWeight:600,color:'#0F172A'}}>{c.name}</div>
                  <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,color:s.color,background:s.bg,border:`1px solid ${s.border}`,borderRadius:9999,padding:'2px 8px',fontFamily:'Space Grotesk,sans-serif',flexShrink:0}}>
                    <span style={{width:5,height:5,borderRadius:'50%',background:s.dot,display:'inline-block'}}></span>{c.status.charAt(0).toUpperCase()+c.status.slice(1)}
                  </span>
                </div>
                <div style={{display:'flex',gap:16}}>
                  <span style={{fontSize:12,color:'#64748b',fontFamily:'DM Sans,sans-serif'}}>{c.steps} steps</span>
                  <span style={{fontSize:12,color:'#64748b',fontFamily:'DM Sans,sans-serif'}}>{c.enrolled.toLocaleString()} enrolled</span>
                  <span style={{fontSize:12,color:'#64748b',fontFamily:'DM Sans,sans-serif'}}>Opens: <strong style={{color:'#374151'}}>{c.opens}</strong></span>
                  <span style={{fontSize:12,color:'#64748b',fontFamily:'DM Sans,sans-serif'}}>Replies: <strong style={{color:'#15803d'}}>{c.replies}</strong></span>
                  <span style={{fontSize:12,color:'#64748b',fontFamily:'DM Sans,sans-serif'}}>Created {c.created}</span>
                </div>
              </div>
              <button onClick={()=>onEdit(c)} style={{...OE.ghostBtn,fontSize:12,padding:'6px 14px'}}>Edit Campaign</button>
              <i data-lucide="chevron-right" style={{width:15,height:15,color:'#CBD5E1',flexShrink:0}}></i>
            </div>
          );
        })}
        {/* Empty state CTA */}
        <div style={{background:'linear-gradient(135deg,#EFF6FF,#F5F3FF)',border:'1px dashed #BFDBFE',borderRadius:12,padding:'28px 24px',display:'flex',flexDirection:'column',alignItems:'center',gap:12,marginTop:4}}>
          <div style={{width:44,height:44,borderRadius:12,background:'#EFF6FF',border:'1px solid #BFDBFE',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <i data-lucide="send" style={{width:20,height:20,color:'#3B82F6'}}></i>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:14,fontWeight:600,color:'#0F172A',marginBottom:4}}>Launch your first campaign</div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',maxWidth:360}}>Build a multi-step outreach sequence targeting high-value shippers from your Command Center</div>
          </div>
          <button onClick={onCreate} style={OE.primaryBtn}><i data-lucide="plus" style={{width:13,height:13}}></i> Create Campaign</button>
        </div>
      </div>
    </div>
  );
}

/* ── Campaign composer ─────────────────────────────── */
function CampaignComposer({ campaign, onBack }) {
  const [name, setName]           = React.useState(campaign.name || 'New Campaign');
  const [steps, setSteps] = React.useState(() => {
    const initial = campaign.steps?.length ? [...campaign.steps] : [...NEW_CAMPAIGN_STEPS];
    return initial;
  });
  const [selectedId, setSelectedId] = React.useState(() => {
    const initial = campaign.steps?.length ? campaign.steps[0]?.id : NEW_CAMPAIGN_STEPS[0]?.id;
    return initial;
  });
  const [showTemplates, setShowTemplates] = React.useState(false);
  const [preview, setPreview]     = React.useState(false);
  const [schedule, setSchedule]   = React.useState({ days:['Mon','Tue','Wed','Thu','Fri'], startTime:'09:00', endTime:'17:00', tz:'America/New_York' });
  const [targetList, setTargetList] = React.useState('command-center');

  const selectedStep = steps.find(s=>s.id===selectedId) || steps[0];

  function updateStep(id, patch) {
    setSteps(prev => prev.map(s => s.id===id ? {...s,...patch} : s));
  }

  function addStep() {
    const lastDay = steps.reduce((mx,s)=>Math.max(mx,s.day+s.waitDays),0);
    const newStep = makeStep(`s${Date.now()}`,'followup', lastDay+3, 3);
    setSteps(prev => [...prev, newStep]);
    setSelectedId(newStep.id);
  }

  function removeStep(id) {
    if (steps.length <= 1) return;
    const idx = steps.findIndex(s=>s.id===id);
    const newSteps = steps.filter(s=>s.id!==id);
    setSteps(newSteps);
    setSelectedId(newSteps[Math.min(idx, newSteps.length-1)]?.id);
  }

  function applyTemplate(tplKey) {
    const t = EMAIL_TEMPLATES[tplKey];
    if (t) { updateStep(selectedId, { subject:t.subject, body:t.body, templateKey:tplKey }); }
    setShowTemplates(false);
  }

  function insertVar(v) {
    updateStep(selectedId, { body: (selectedStep.body||'') + v });
  }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#F8FAFC'}}>
      {/* Composer header */}
      <div style={{background:'#FFFFFF',borderBottom:'1px solid #E5E7EB',padding:'12px 20px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
        <button onClick={onBack} style={{...OE.ghostBtn,padding:'6px 12px',fontSize:12}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Campaigns
        </button>
        <div style={{width:1,height:20,background:'#E5E7EB'}}/>
        <input value={name} onChange={e=>setName(e.target.value)} style={{flex:1,border:'none',outline:'none',fontFamily:'Space Grotesk,sans-serif',fontSize:15,fontWeight:700,color:'#0F172A',background:'transparent',minWidth:0}}/>
        <div style={{display:'flex',gap:6,alignItems:'center',marginLeft:'auto'}}>
          <span style={{fontSize:11,color:'#94A3B8',fontFamily:'DM Sans,sans-serif'}}>{steps.length} steps · {steps.reduce((t,s)=>t+s.waitDays,0)}+ day sequence</span>
          <button style={{...OE.ghostBtn,fontSize:12,padding:'6px 14px'}}><i data-lucide="eye" style={{width:12,height:12}}></i> Preview</button>
          <button style={{...OE.ghostBtn,fontSize:12,padding:'6px 14px'}}><i data-lucide="save" style={{width:12,height:12}}></i> Save Draft</button>
          <button style={{...OE.primaryBtn,fontSize:13,padding:'8px 18px'}}>
            <i data-lucide="zap" style={{width:13,height:13}}></i> Launch Campaign
          </button>
        </div>
      </div>

      {/* 3-column layout */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'260px 1fr 240px',overflow:'hidden'}}>

        {/* ── LEFT: Sequence rail ── */}
        <div style={{background:'#FFFFFF',borderRight:'1px solid #E5E7EB',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid #F1F5F9'}}>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12,fontWeight:700,color:'#374151',letterSpacing:'0.04em',textTransform:'uppercase'}}>Sequence Steps</div>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'12px 10px'}}>
            {steps.map((step, i) => (
              <div key={step.id}>
                {/* Step card */}
                <div onClick={()=>setSelectedId(step.id)} style={{
                  background: selectedId===step.id ? '#EFF6FF' : '#F8FAFC',
                  border: `1px solid ${selectedId===step.id ? '#BFDBFE' : '#E5E7EB'}`,
                  borderLeft: `3px solid ${selectedId===step.id ? '#3B82F6' : '#E5E7EB'}`,
                  borderRadius: 9, padding:'11px 12px', cursor:'pointer', transition:'all 140ms', marginBottom:0,
                }}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                    <div style={{width:22,height:22,borderRadius:'50%',background:selectedId===step.id?'#3B82F6':'#E5E7EB',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:selectedId===step.id?'#fff':'#64748b',fontFamily:'Space Grotesk,sans-serif',flexShrink:0,marginTop:1}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                        <i data-lucide="mail" style={{width:11,height:11,color:selectedId===step.id?'#3B82F6':'#94A3B8',flexShrink:0}}></i>
                        <span style={{fontSize:10,fontWeight:600,color:selectedId===step.id?'#1d4ed8':'#64748b',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.06em'}}>Email · Day {step.day}</span>
                      </div>
                      <div style={{fontSize:12,color:'#374151',fontFamily:'DM Sans,sans-serif',lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:160}}>{step.subject||'No subject'}</div>
                    </div>
                    {steps.length>1&&(
                      <button onClick={e=>{e.stopPropagation();removeStep(step.id);}} style={{background:'none',border:'none',cursor:'pointer',color:'#CBD5E1',padding:2,flexShrink:0,display:'flex',alignItems:'center'}}
                        onMouseEnter={e=>e.currentTarget.style.color='#EF4444'}
                        onMouseLeave={e=>e.currentTarget.style.color='#CBD5E1'}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Wait indicator */}
                {i < steps.length-1 && (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'2px 0',gap:0}}>
                    <div style={{width:1,height:8,borderLeft:'2px dashed #E2E8F0'}}></div>
                    <WaitChip days={step.waitDays} onChange={d=>updateStep(step.id,{waitDays:d,})} />
                    <div style={{width:1,height:8,borderLeft:'2px dashed #E2E8F0'}}></div>
                  </div>
                )}
              </div>
            ))}
            {/* Add step */}
            <button onClick={addStep} style={{width:'100%',marginTop:8,background:'none',border:'2px dashed #E2E8F0',borderRadius:9,padding:'9px',fontSize:12,fontWeight:600,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:5,transition:'all 140ms'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='#BFDBFE';e.currentTarget.style.color='#3B82F6';}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='#E2E8F0';e.currentTarget.style.color='#94A3B8';}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Step
            </button>
          </div>
        </div>

        {/* ── CENTER: Email editor ── */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden',background:'#F8FAFC'}}>
          {selectedStep && (
            <>
              {/* Editor toolbar */}
              <div style={{background:'#FFFFFF',borderBottom:'1px solid #E5E7EB',padding:'10px 20px',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                <div style={{display:'flex',gap:1,background:'#F1F5F9',borderRadius:7,padding:2}}>
                  {['Edit','Preview'].map(m=>(
                    <button key={m} onClick={()=>setPreview(m==='Preview')} style={{fontSize:11,fontWeight:600,background:((m==='Preview')===preview)?'#FFFFFF':'transparent',border:'none',borderRadius:5,padding:'5px 12px',color:((m==='Preview')===preview)?'#0F172A':'#64748b',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',boxShadow:((m==='Preview')===preview)?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>{m}</button>
                  ))}
                </div>
                <button onClick={()=>setShowTemplates(true)} style={{...OE.ghostBtn,fontSize:12,padding:'5px 12px',marginLeft:4}}>
                  <i data-lucide="layout-template" style={{width:12,height:12}}></i> Templates
                </button>
                <span style={{marginLeft:'auto',fontSize:11,color:'#94A3B8',fontFamily:'DM Sans,sans-serif'}}>Step {steps.findIndex(s=>s.id===selectedId)+1} of {steps.length}</span>
              </div>

              {/* Email fields */}
              <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:0}}>
                <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,overflow:'hidden',boxShadow:'0 2px 8px rgba(15,23,42,0.04)'}}>
                  {/* From */}
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 16px',borderBottom:'1px solid #F1F5F9'}}>
                    <span style={{fontSize:11,fontWeight:600,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',width:52,flexShrink:0,textTransform:'uppercase',letterSpacing:'0.06em'}}>From</span>
                    <select style={{flex:1,border:'none',outline:'none',background:'transparent',fontSize:13,fontFamily:'DM Sans,sans-serif',color:'#374151',cursor:'pointer'}}>
                      <option>Jordan Davis &lt;jordan@logisticsintel.com&gt;</option>
                      <option>Sarah Chen &lt;sarah@logisticsintel.com&gt;</option>
                    </select>
                  </div>
                  {/* Subject */}
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 16px',borderBottom:'1px solid #F1F5F9'}}>
                    <span style={{fontSize:11,fontWeight:600,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',width:52,flexShrink:0,textTransform:'uppercase',letterSpacing:'0.06em'}}>Subject</span>
                    {preview
                      ? <div style={{flex:1,fontSize:13,fontFamily:'DM Sans,sans-serif',color:'#374151'}}><HighlightedBody text={selectedStep.subject}/></div>
                      : <input value={selectedStep.subject} onChange={e=>updateStep(selectedId,{subject:e.target.value})}
                          style={{flex:1,border:'none',outline:'none',background:'transparent',fontSize:13,fontFamily:'DM Sans,sans-serif',color:'#0F172A'}}
                          placeholder="Enter subject line…"/>
                    }
                  </div>
                  {/* Body */}
                  <div style={{padding:'16px'}}>
                    {preview
                      ? <div style={{minHeight:320,padding:'4px 0'}}><HighlightedBody text={selectedStep.body}/></div>
                      : <textarea value={selectedStep.body} onChange={e=>updateStep(selectedId,{body:e.target.value})}
                          style={{width:'100%',minHeight:320,border:'none',outline:'none',resize:'vertical',fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#374151',lineHeight:1.7,background:'transparent'}}
                          placeholder="Write your email…"/>
                    }
                  </div>
                  {/* Variable bar */}
                  {!preview && (
                    <div style={{padding:'10px 16px',borderTop:'1px solid #F1F5F9',display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
                      <span style={{fontSize:10,fontWeight:600,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',letterSpacing:'0.06em',textTransform:'uppercase',marginRight:4}}>Insert:</span>
                      {VARS.map(v=>(
                        <button key={v} onClick={()=>insertVar(v)} style={{fontSize:10,fontWeight:600,background:'rgba(59,130,246,0.08)',color:'#2563EB',border:'1px solid rgba(59,130,246,0.2)',borderRadius:4,padding:'2px 8px',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>{v}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Email stats (if not new) */}
                {campaign?.id !== 'new' && (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginTop:14}}>
                    {[{l:'Delivered',v:'1,156',c:'#374151'},{l:'Opened',v:'393',c:'#1d4ed8'},{l:'Replied',v:'95',c:'#15803d'}].map(s=>(
                      <div key={s.l} style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:8,padding:'10px 14px',boxShadow:'0 1px 4px rgba(15,23,42,0.04)'}}>
                        <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:700,color:s.c}}>{s.v}</div>
                        <div style={{fontSize:10,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:2}}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Settings ── */}
        <div style={{background:'#FFFFFF',borderLeft:'1px solid #E5E7EB',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid #F1F5F9'}}>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12,fontWeight:700,color:'#374151',letterSpacing:'0.04em',textTransform:'uppercase'}}>Campaign Settings</div>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'14px 14px'}}>
            {/* Target list */}
            <SettingSection title="Target List" icon="users">
              <select value={targetList} onChange={e=>setTargetList(e.target.value)} style={OE.select}>
                <option value="command-center">All Command Center (34)</option>
                <option value="high-opp">High-Opportunity (12)</option>
                <option value="new-7d">New This Week (8)</option>
                <option value="no-reply">No Reply in 30d (21)</option>
              </select>
              <div style={{fontSize:10,color:'#94A3B8',fontFamily:'DM Sans,sans-serif',marginTop:5}}>34 contacts will be enrolled</div>
            </SettingSection>

            {/* Send window */}
            <SettingSection title="Send Window" icon="clock">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                {['09:00','17:00'].map((t,i)=>(
                  <div key={i}>
                    <div style={{fontSize:9,fontWeight:600,color:'#94A3B8',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:3}}>{i===0?'Start':'End'}</div>
                    <select defaultValue={t} style={OE.select}>
                      {['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'].map(h=><option key={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <select defaultValue="America/New_York" style={{...OE.select,marginTop:6}}>
                <option>America/New_York (EST)</option>
                <option>America/Los_Angeles (PST)</option>
                <option>America/Chicago (CST)</option>
                <option>Europe/London (GMT)</option>
              </select>
            </SettingSection>

            {/* Send days */}
            <SettingSection title="Send Days" icon="calendar">
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>{
                  const active=schedule.days.includes(d);
                  return(
                    <button key={d} onClick={()=>setSchedule(p=>({...p,days:active?p.days.filter(x=>x!==d):[...p.days,d]}))}
                      style={{fontSize:11,fontWeight:600,background:active?'#EFF6FF':'#F8FAFC',color:active?'#3b82f6':'#94A3B8',border:`1px solid ${active?'#BFDBFE':'#E5E7EB'}`,borderRadius:6,padding:'5px 8px',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </SettingSection>

            {/* Goals */}
            <SettingSection title="Goals" icon="target">
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {[{l:'Open Rate Target',v:'35%'},{l:'Reply Rate Target',v:'8%'},{l:'Stop on Reply',v:'Yes'}].map(g=>(
                  <div key={g.l} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:11,color:'#64748b',fontFamily:'DM Sans,sans-serif'}}>{g.l}</span>
                    <span style={{fontSize:11,fontWeight:600,color:'#374151',fontFamily:'Space Grotesk,sans-serif'}}>{g.v}</span>
                  </div>
                ))}
              </div>
            </SettingSection>

            {/* Launch */}
            <div style={{marginTop:8}}>
              <button style={{...OE.primaryBtn,width:'100%',justifyContent:'center',padding:'10px'}}>
                <i data-lucide="zap" style={{width:13,height:13}}></i> Launch Campaign
              </button>
              <button style={{...OE.ghostBtn,width:'100%',justifyContent:'center',marginTop:6,padding:'9px'}}>
                <i data-lucide="save" style={{width:12,height:12}}></i> Save as Draft
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Template modal ── */}
      {showTemplates && <TemplateModal onSelect={applyTemplate} onClose={()=>setShowTemplates(false)} />}
    </div>
  );
}

/* ── Wait chip ─────────────────────────────────────── */
function WaitChip({ days, onChange }) {
  const [editing, setEditing] = React.useState(false);
  return(
    <div style={{display:'flex',alignItems:'center',gap:4,padding:'2px 8px',background:'#F8FAFC',border:'1px solid #E5E7EB',borderRadius:9999,cursor:'pointer'}} onClick={()=>setEditing(p=>!p)}>
      <i data-lucide="clock" style={{width:10,height:10,color:'#94A3B8'}}></i>
      {editing
        ? <input autoFocus type="number" value={days} onChange={e=>onChange(parseInt(e.target.value)||1)} onBlur={()=>setEditing(false)}
            style={{width:28,border:'none',outline:'none',background:'transparent',fontSize:11,fontFamily:'JetBrains Mono,monospace',color:'#374151',textAlign:'center'}}/>
        : <span style={{fontSize:10,fontWeight:600,color:'#64748b',fontFamily:'Space Grotesk,sans-serif'}}>Wait {days}d</span>
      }
    </div>
  );
}

/* ── Settings section ──────────────────────────────── */
function SettingSection({ title, icon, children }) {
  return(
    <div style={{marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:8}}>
        <i data-lucide={icon} style={{width:11,height:11,color:'#94A3B8'}}></i>
        <span style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.08em'}}>{title}</span>
      </div>
      {children}
    </div>
  );
}

/* ── Template modal ────────────────────────────────── */
function TemplateModal({ onSelect, onClose }) {
  const [query, setQuery] = React.useState('');
  const tpls = Object.entries(EMAIL_TEMPLATES).filter(([,t])=>!query||t.name.toLowerCase().includes(query.toLowerCase())||t.category.toLowerCase().includes(query.toLowerCase()));
  const catColor = { Prospecting:'#EFF6FF:#3B82F6:#BFDBFE', Nurture:'#F0FDF4:#15803d:#BBF7D0', Closing:'#FDF4FF:#a21caf:#F0ABFC' };
  return(
    <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.45)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'#FFFFFF',borderRadius:16,width:640,maxHeight:'80vh',overflow:'hidden',boxShadow:'0 24px 60px rgba(15,23,42,0.2)',display:'flex',flexDirection:'column'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',gap:12}}>
          <div style={{flex:1}}>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:15,fontWeight:700,color:'#0F172A'}}>Email Templates</div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#94A3B8',marginTop:1}}>Pre-built outreach templates for freight sales</div>
          </div>
          <div style={{position:'relative',width:200}}>
            <i data-lucide="search" style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',width:12,height:12,color:'#94A3B8'}}></i>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search templates…" style={{width:'100%',background:'#F8FAFC',border:'1px solid #E5E7EB',borderRadius:8,padding:'6px 10px 6px 28px',fontSize:12,fontFamily:'DM Sans,sans-serif',color:'#374151',outline:'none'}}/>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#94A3B8',padding:4,display:'flex',alignItems:'center'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{overflowY:'auto',padding:'14px 16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {tpls.map(([key,t])=>{
            const [bg,color,border]=(catColor[t.category]||'#F1F5F9:#64748b:#E2E8F0').split(':');
            return(
              <div key={key} style={{background:'linear-gradient(180deg,#fff,#FAFBFC)',border:'1px solid #E5E7EB',borderRadius:10,padding:'14px',cursor:'pointer',transition:'all 140ms'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='#BFDBFE';e.currentTarget.style.boxShadow='0 4px 12px rgba(15,23,42,0.08)';}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='#E5E7EB';e.currentTarget.style.boxShadow='none';}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13,fontWeight:600,color:'#0F172A'}}>{t.name}</span>
                  <span style={{fontSize:9,fontWeight:700,color,background:bg,border:`1px solid ${border}`,borderRadius:4,padding:'1px 6px',fontFamily:'Space Grotesk,sans-serif',textTransform:'uppercase',letterSpacing:'0.05em'}}>{t.category}</span>
                </div>
                <div style={{fontSize:11,color:'#94A3B8',fontFamily:'DM Sans,sans-serif',marginBottom:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.subject}</div>
                <div style={{fontSize:11,color:'#64748b',fontFamily:'DM Sans,sans-serif',lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{t.body.substring(0,100)}…</div>
                <button onClick={()=>onSelect(key)} style={{...OE.primaryBtn,marginTop:10,width:'100%',justifyContent:'center',fontSize:11,padding:'6px 10px'}}>
                  Use Template
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Shared styles ─────────────────────────────────── */
const OE = {
  primaryBtn: { display:'flex',alignItems:'center',gap:5,background:'linear-gradient(180deg,#3B82F6,#2563EB)',border:'none',borderRadius:8,padding:'7px 14px',fontSize:12,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',color:'#fff',cursor:'pointer',boxShadow:'0 1px 4px rgba(59,130,246,0.3)' },
  ghostBtn:   { display:'flex',alignItems:'center',gap:5,background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:8,padding:'7px 13px',fontSize:12,fontWeight:600,fontFamily:'Space Grotesk,sans-serif',color:'#374151',cursor:'pointer' },
  select:     { width:'100%',background:'#F8FAFC',border:'1px solid #E5E7EB',borderRadius:7,padding:'7px 10px',fontSize:12,fontFamily:'DM Sans,sans-serif',color:'#374151',outline:'none',cursor:'pointer' },
};

Object.assign(window, { OutboundEngine });
