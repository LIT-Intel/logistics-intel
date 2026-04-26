// AffiliateDashboard.jsx — In-app dashboard for approved affiliates.
// Gated: visible to pending | active | suspended (read-only) affiliates + super admins.
// 4 tabs: Overview, Referrals, Payouts, Tools
'use strict';

function AffiliateDashboard({ affiliateStatus='active', stripeStatus='payouts_enabled' }) {
  const [tab, setTab] = React.useState('overview');
  const readOnly = affiliateStatus === 'suspended';
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  return (
    <div style={{background:T.bgApp,minHeight:'100%',fontFamily:T.ffBody,display:'flex',flexDirection:'column'}}>
      {/* Header */}
      <div style={{background:'#fff',borderBottom:`1px solid ${T.border}`,padding:'20px 32px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <div style={{fontFamily:T.ffDisplay,fontSize:20,fontWeight:700,letterSpacing:'-0.02em',color:T.ink}}>Partner dashboard</div>
              <StatusBadgeAff status={affiliateStatus}/>
            </div>
            <div style={{fontSize:12.5,color:T.inkSoft}}>Partner ID <span style={{fontFamily:T.ffMono,color:T.ink}}>AFF-0412</span> · Starter tier · 30% recurring / 12 mo</div>
          </div>
          {readOnly && <Badge tone="warn" dot>Read-only · suspended</Badge>}
          {!readOnly && <div style={{display:'flex',gap:8}}>
            <button style={Btn.ghost}><i data-lucide="book-open" style={{width:13,height:13}}/>Partner handbook</button>
            <button style={Btn.primary}><i data-lucide="link" style={{width:13,height:13}}/>New referral link</button>
          </div>}
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:4,marginTop:18,marginBottom:-21}}>
          {[
            { k:'overview', l:'Overview', i:'layout-dashboard' },
            { k:'referrals',l:'Referrals',i:'users' },
            { k:'payouts',  l:'Payouts',  i:'wallet' },
            { k:'tools',    l:'Tools',    i:'wrench' },
          ].map(t => {
            const active = tab === t.k;
            return (
              <button key={t.k} onClick={()=>setTab(t.k)} style={{
                background:'none',border:'none',padding:'10px 14px',fontSize:13,fontWeight:600,
                fontFamily:T.ffDisplay,color: active ? T.brand : T.inkSoft,cursor:'pointer',
                borderBottom: active ? `2px solid ${T.brand}` : '2px solid transparent',
                display:'flex',alignItems:'center',gap:6
              }}>
                <i data-lucide={t.i} style={{width:13,height:13}}/>{t.l}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{flex:1,padding:'24px 32px',overflowY:'auto'}}>
        {tab==='overview'  && <OverviewTab readOnly={readOnly} stripeStatus={stripeStatus}/>}
        {tab==='referrals' && <ReferralsTab readOnly={readOnly}/>}
        {tab==='payouts'   && <PayoutsTab stripeStatus={stripeStatus}/>}
        {tab==='tools'     && <ToolsTab readOnly={readOnly}/>}
      </div>
    </div>
  );
}

function StatusBadgeAff({ status }) {
  const map = { pending:{t:'warn',l:'Pending review'}, active:{t:'success',l:'Active'}, suspended:{t:'danger',l:'Suspended'} };
  const s = map[status] || map.active;
  return <Badge tone={s.t} dot>{s.l}</Badge>;
}

/* ── Overview ─────────────────────────────────── */
function OverviewTab({ readOnly, stripeStatus }) {
  const needsStripe = stripeStatus !== 'payouts_enabled';
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16,maxWidth:1240,margin:'0 auto'}}>
      {needsStripe && <StripeConnectBanner status={stripeStatus}/>}

      {/* KPI row */}
      <Card>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:24}}>
          <StatCell label="Lifetime earnings" value="$18,420" delta="+$2,140" />
          <StatCell label="Available to pay out" value="$1,840" delta="vs $50 min" />
          <StatCell label="Pending (clears in 30d)" value="$960" />
          <StatCell label="Active referrals" value="42" delta="+6 this mo" />
        </div>
      </Card>

      {/* Chart + breakdown */}
      <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:16}}>
        <Card>
          <SectionHeader icon="trending-up" label="Earnings, last 12 months" subtitle="Monthly cleared commissions"/>
          <EarningsChart/>
        </Card>
        <Card>
          <SectionHeader icon="pie-chart" label="Commission status"/>
          {[
            { l:'Earned (awaiting payout)', v:'$1,840', tone:'success', pct:62 },
            { l:'Pending (refund window)',   v:'$960',   tone:'warn',    pct:32 },
            { l:'Voided (refunds)',          v:'$180',   tone:'danger',  pct:6 },
          ].map(r => (
            <div key={r.l} style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                <span style={{fontSize:12.5,color:T.inkMuted,fontFamily:T.ffDisplay,fontWeight:500}}>{r.l}</span>
                <span style={{fontFamily:T.ffMono,fontSize:13,fontWeight:600,color:T.ink}}>{r.v}</span>
              </div>
              <div style={{height:6,background:T.bgSunken,borderRadius:3,overflow:'hidden'}}>
                <div style={{width:`${r.pct}%`,height:'100%',background: r.tone==='success'?T.green : r.tone==='warn'?T.amber : T.red}}/>
              </div>
            </div>
          ))}
          <div style={{height:1,background:T.borderSoft,margin:'14px 0 12px'}}/>
          <div style={{fontSize:11.5,color:T.inkFaint,lineHeight:1.55}}>Commissions clear 30 days after invoice payment. Refunds within this window void the commission.</div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card padded={false}>
        <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.borderSoft}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontFamily:T.ffDisplay,fontSize:13,fontWeight:700,color:T.ink}}>Recent activity</div>
          <button style={Btn.quiet}>View all</button>
        </div>
        {[
          { t:'Commission earned',   d:'Meridian Cargo · invoice INV-8402',   amt:'+$29.70', tone:'success', time:'2h ago' },
          { t:'New referral signup', d:'pacificfreight.co joined via aff-0412', amt:'—', tone:'neutral', time:'1d ago' },
          { t:'Commission pending',  d:'Harbor Logistics · clears May 21',    amt:'$29.70', tone:'warn', time:'3d ago' },
          { t:'Payout paid',         d:'April batch · Stripe tr_1Oq…',        amt:'$1,240.80', tone:'brand', time:'Apr 1' },
          { t:'Commission voided',   d:'Summit Shipping · invoice refunded',  amt:'−$29.70', tone:'danger', time:'Mar 28' },
        ].map((r,i) => (
          <div key={i} style={{padding:'14px 20px',borderBottom: i<4 ? `1px solid ${T.borderSoft}` : 'none',display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:30,height:30,borderRadius:7,background: r.tone==='success'?T.greenBg : r.tone==='warn'?T.amberBg : r.tone==='danger'?T.redBg : T.brandSoft, display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <i data-lucide={r.tone==='success'?'check': r.tone==='warn'?'clock': r.tone==='danger'?'x': r.t.includes('Payout')?'wallet':'user-plus'} style={{width:13,height:13,color: r.tone==='success'?T.green : r.tone==='warn'?T.amber : r.tone==='danger'?T.red : T.brand}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:T.ffDisplay,fontSize:13,fontWeight:600,color:T.ink}}>{r.t}</div>
              <div style={{fontSize:12,color:T.inkSoft,marginTop:2}}>{r.d}</div>
            </div>
            <div style={{fontFamily:T.ffMono,fontSize:13,fontWeight:600,color: r.tone==='success'?T.green : r.tone==='danger'?T.red : T.ink}}>{r.amt}</div>
            <div style={{fontSize:11.5,color:T.inkFaint,fontFamily:T.ffDisplay,width:64,textAlign:'right'}}>{r.time}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function StripeConnectBanner({ status }) {
  const map = {
    not_connected:     { tone:'warn',   t:'Connect Stripe to receive payouts',        d:'Finish Stripe Connect Express onboarding to unlock monthly payouts.', cta:'Connect Stripe' },
    onboarding_started:{ tone:'warn',   t:'Stripe onboarding in progress',            d:'Complete the remaining Stripe steps to enable payouts.',             cta:'Resume onboarding' },
    verification_required:{ tone:'warn',t:'Stripe needs additional verification',     d:'Upload requested documents in Stripe to continue.',                    cta:'Open Stripe' },
    restricted:        { tone:'danger', t:'Payouts restricted',                        d:'Your Stripe account is restricted. Contact partnerships.',            cta:'Contact support' },
  }[status];
  if (!map) return null;
  return (
    <div style={{background:map.tone==='danger'?T.redBg:T.amberBg,border:`1px solid ${map.tone==='danger'?T.redBorder:T.amberBorder}`,borderRadius:12,padding:'14px 18px',display:'flex',alignItems:'center',gap:14}}>
      <i data-lucide="alert-triangle" style={{width:18,height:18,color:map.tone==='danger'?T.red:T.amber,flexShrink:0}}/>
      <div style={{flex:1}}>
        <div style={{fontFamily:T.ffDisplay,fontSize:13.5,fontWeight:700,color:T.ink}}>{map.t}</div>
        <div style={{fontSize:12.5,color:T.inkMuted,marginTop:2}}>{map.d}</div>
      </div>
      <button style={Btn.primary}>{map.cta}<i data-lucide="arrow-right" style={{width:13,height:13}}/></button>
    </div>
  );
}

function EarningsChart() {
  const data = [420, 680, 540, 910, 1120, 980, 1340, 1260, 1490, 1780, 1640, 1840];
  const max = Math.max(...data);
  const months = ['May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr'];
  return (
    <div>
      <svg viewBox="0 0 600 180" style={{width:'100%',height:180}}>
        <defs>
          <linearGradient id="aff-earn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0.25,0.5,0.75,1].map(p => <line key={p} x1="0" x2="600" y1={180-p*160-10} y2={180-p*160-10} stroke={T.borderSoft} strokeDasharray="3,3"/>)}
        {(() => {
          const pts = data.map((v,i) => `${(i/(data.length-1))*580+10},${170-(v/max)*150}`).join(' ');
          const area = `10,170 ${pts} 590,170`;
          return <>
            <polygon points={area} fill="url(#aff-earn)"/>
            <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            {data.map((v,i) => (
              <circle key={i} cx={(i/(data.length-1))*580+10} cy={170-(v/max)*150} r="3" fill="#fff" stroke="#3b82f6" strokeWidth="2"/>
            ))}
          </>;
        })()}
      </svg>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:10.5,color:T.inkFaint,fontFamily:T.ffDisplay}}>
        {months.map(m => <span key={m}>{m}</span>)}
      </div>
    </div>
  );
}

/* ── Referrals tab ─────────────────────────────── */
function ReferralsTab({ readOnly }) {
  const [copied, setCopied] = React.useState(false);
  const link = 'https://logisticintel.com/?ref=aff-0412';

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16,maxWidth:1240,margin:'0 auto'}}>
      <Card>
        <SectionHeader icon="link" label="Your default referral link" subtitle="90-day attribution. Tracks signups and subscriptions."
          right={!readOnly && <button style={Btn.ghost}><i data-lucide="plus" style={{width:13,height:13}}/>New link</button>}/>
        <div style={{display:'flex',gap:8,alignItems:'center',background:T.bgSubtle,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px'}}>
          <i data-lucide="link-2" style={{width:14,height:14,color:T.inkFaint}}/>
          <span style={{flex:1,fontFamily:T.ffMono,fontSize:13,color:T.ink}}>{link}</span>
          <button style={{...Btn.ghost,padding:'6px 10px',fontSize:12}} onClick={()=>{setCopied(true); setTimeout(()=>setCopied(false),1500);}} disabled={readOnly}>
            <i data-lucide={copied?'check':'copy'} style={{width:12,height:12}}/>{copied?'Copied':'Copy'}
          </button>
          <button style={{...Btn.ghost,padding:'6px 10px',fontSize:12}} disabled={readOnly}><i data-lucide="qr-code" style={{width:12,height:12}}/>QR</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:20,marginTop:18,paddingTop:16,borderTop:`1px solid ${T.borderSoft}`}}>
          <StatCell label="Clicks (90d)"    value="1,240"/>
          <StatCell label="Signups (90d)"   value="58"/>
          <StatCell label="Paying"          value="42"/>
          <StatCell label="Conversion"      value="3.4%"/>
        </div>
      </Card>

      <Card padded={false}>
        <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.borderSoft}`,display:'flex',alignItems:'center',gap:12}}>
          <div style={{fontFamily:T.ffDisplay,fontSize:13,fontWeight:700,color:T.ink,flex:1}}>Referred customers</div>
          {['All','Paying','Trialing','Churned'].map((f,i) => (
            <button key={f} style={{...Btn.quiet, padding:'5px 10px', background:i===0?T.brandSoft:'transparent', color:i===0?T.brand:T.inkSoft}}>{f}</button>
          ))}
          <button style={Btn.ghost}><i data-lucide="download" style={{width:12,height:12}}/>Export CSV</button>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
          <thead>
            <tr style={{background:T.bgSubtle,textAlign:'left'}}>
              {['Customer','Plan','Signed up','Status','MRR','Earned','Next pays out'].map(h => (
                <th key={h} style={{padding:'10px 16px',fontSize:10.5,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { n:'Meridian Cargo Partners',  plan:'Growth · $299',  signed:'Apr 18', st:'Paying',   mrr:'$299', earn:'$29.70', pay:'May 21' },
              { n:'Harbor Logistics Group',   plan:'Growth · $299',  signed:'Apr 12', st:'Paying',   mrr:'$299', earn:'$89.70', pay:'May 1' },
              { n:'Pacific Freight Co.',      plan:'Starter · $99',  signed:'Apr 09', st:'Trialing', mrr:'—',    earn:'—',      pay:'—' },
              { n:'Blue Ocean Express',       plan:'Growth · $299',  signed:'Mar 28', st:'Paying',   mrr:'$299', earn:'$89.70', pay:'May 1' },
              { n:'Vanguard Trade Group',     plan:'Starter · $99',  signed:'Mar 14', st:'Churned',  mrr:'—',    earn:'$59.40', pay:'—' },
              { n:'Summit Shipping Ltd',      plan:'Growth · $299',  signed:'Feb 22', st:'Paying',   mrr:'$299', earn:'$179.40',pay:'May 1' },
            ].map((r,i,arr) => (
              <tr key={i} style={{borderBottom: i<arr.length-1 ? `1px solid ${T.borderSoft}` : 'none'}}>
                <td style={{padding:'12px 16px',fontFamily:T.ffDisplay,fontWeight:600,color:T.ink}}>{r.n}</td>
                <td style={{padding:'12px 16px',color:T.inkMuted}}>{r.plan}</td>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.inkSoft}}>{r.signed}</td>
                <td style={{padding:'12px 16px'}}><Badge tone={r.st==='Paying'?'success':r.st==='Trialing'?'warn':'neutral'} dot>{r.st}</Badge></td>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.ink}}>{r.mrr}</td>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.brandDeep,fontWeight:600}}>{r.earn}</td>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.inkSoft}}>{r.pay}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ── Payouts tab ─────────────────────────────── */
function PayoutsTab({ stripeStatus }) {
  const connected = stripeStatus === 'payouts_enabled';
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16,maxWidth:1240,margin:'0 auto'}}>
      <Card>
        <div style={{display:'flex',gap:20,alignItems:'center'}}>
          <div style={{width:52,height:52,borderRadius:12,background:connected?T.greenBg:T.amberBg,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <i data-lucide={connected?'shield-check':'shield-alert'} style={{width:22,height:22,color:connected?T.green:T.amber}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{fontFamily:T.ffDisplay,fontSize:15,fontWeight:700,color:T.ink}}>Stripe Connect · Express</div>
              <Badge tone={connected?'success':'warn'} dot>{connected?'Payouts enabled':'Verification required'}</Badge>
            </div>
            <div style={{fontSize:12.5,color:T.inkSoft,marginTop:3}}>Account <span style={{fontFamily:T.ffMono,color:T.ink}}>acct_1NXxz…</span> · USD · Monthly schedule · $50 minimum</div>
          </div>
          <button style={Btn.ghost}><i data-lucide="external-link" style={{width:13,height:13}}/>Open Stripe dashboard</button>
        </div>
      </Card>

      <Card padded={false}>
        <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.borderSoft}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontFamily:T.ffDisplay,fontSize:13,fontWeight:700,color:T.ink}}>Payout history</div>
          <button style={Btn.ghost}><i data-lucide="download" style={{width:12,height:12}}/>Download 1099 report</button>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
          <thead><tr style={{background:T.bgSubtle,textAlign:'left'}}>
            {['Period','Paid on','Amount','Commissions','Stripe transfer','Status'].map(h => (
              <th key={h} style={{padding:'10px 16px',fontSize:10.5,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {[
              { p:'Apr 2026', d:'May 01, 2026', a:'$1,840.00', c:'24', tr:'tr_1Or4h…', s:'Scheduled', tone:'warn'  },
              { p:'Mar 2026', d:'Apr 01, 2026', a:'$1,640.20', c:'22', tr:'tr_1Oq2s…', s:'Paid',      tone:'success' },
              { p:'Feb 2026', d:'Mar 01, 2026', a:'$1,480.60', c:'19', tr:'tr_1On9c…', s:'Paid',      tone:'success' },
              { p:'Jan 2026', d:'Feb 01, 2026', a:'$1,210.40', c:'16', tr:'tr_1Om0a…', s:'Paid',      tone:'success' },
            ].map((r,i,arr) => (
              <tr key={i} style={{borderBottom: i<arr.length-1 ? `1px solid ${T.borderSoft}` : 'none'}}>
                <td style={{padding:'12px 16px',fontFamily:T.ffDisplay,fontWeight:600,color:T.ink}}>{r.p}</td>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.inkMuted}}>{r.d}</td>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,fontWeight:600,color:T.brandDeep}}>{r.a}</td>
                <td style={{padding:'12px 16px',color:T.inkMuted}}>{r.c}</td>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.inkSoft}}>{r.tr}</td>
                <td style={{padding:'12px 16px'}}><Badge tone={r.tone} dot>{r.s}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ── Tools tab ─────────────────────────────── */
function ToolsTab({ readOnly }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'1.1fr 1fr',gap:16,maxWidth:1240,margin:'0 auto'}}>
      <Card>
        <SectionHeader icon="mail" label="Outreach templates" subtitle="Copy-paste. Variables are auto-filled with your link and name."/>
        {[
          { name:'Cold intro email',      ch:'Email',    lines:3 },
          { name:'Warm intro email',      ch:'Email',    lines:3 },
          { name:'LinkedIn message',      ch:'LinkedIn', lines:2 },
          { name:'LinkedIn post caption', ch:'LinkedIn', lines:4 },
          { name:'Newsletter blurb',      ch:'Newsletter',lines:3 },
        ].map((r,i) => (
          <div key={r.name} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom: i<4?`1px solid ${T.borderSoft}`:'none'}}>
            <div style={{width:32,height:32,borderRadius:8,background:T.brandSoft,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <i data-lucide={r.ch==='Email'?'mail':r.ch==='LinkedIn'?'linkedin':'newspaper'} style={{width:14,height:14,color:T.brand}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontFamily:T.ffDisplay,fontSize:13,fontWeight:600,color:T.ink}}>{r.name}</div>
              <div style={{fontSize:11.5,color:T.inkFaint,fontFamily:T.ffDisplay,letterSpacing:'0.04em'}}>{r.ch.toUpperCase()} · {r.lines} variants</div>
            </div>
            <button style={{...Btn.ghost,padding:'6px 10px',fontSize:12}} disabled={readOnly}><i data-lucide="copy" style={{width:12,height:12}}/>Copy</button>
            <button style={{...Btn.ghost,padding:'6px 10px',fontSize:12}} disabled={readOnly}><i data-lucide="eye" style={{width:12,height:12}}/>Preview</button>
          </div>
        ))}
      </Card>

      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <Card>
          <SectionHeader icon="image" label="Brand assets" subtitle="Logos, banners, product shots. Follow brand guidelines."/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
            {['Logo kit','Banners','Screenshots','Icon set','One-pager','Pitch deck'].map(a => (
              <button key={a} style={{...Btn.ghost,padding:'18px 10px',flexDirection:'column',gap:6,fontSize:12}}>
                <i data-lucide="file-down" style={{width:16,height:16}}/>{a}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <SectionHeader icon="life-buoy" label="Need a hand?"/>
          <div style={{fontSize:12.5,color:T.inkSoft,lineHeight:1.6,marginBottom:14}}>Your account manager is <strong style={{color:T.ink}}>Kira Mendoza</strong>. Expect replies within one business day.</div>
          <div style={{display:'flex',gap:8}}>
            <button style={Btn.primary}><i data-lucide="calendar" style={{width:13,height:13}}/>Book 1:1</button>
            <button style={Btn.ghost}><i data-lucide="mail" style={{width:13,height:13}}/>Email Kira</button>
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { AffiliateDashboard });
