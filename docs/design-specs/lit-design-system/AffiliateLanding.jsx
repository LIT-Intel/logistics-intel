// AffiliateLanding.jsx — Public marketing page
// Shown to anyone (logged in or out). Only CTA: apply.
'use strict';

function AffiliateLanding({ onApply }) {
  const [volume, setVolume] = React.useState(10);
  const monthly = volume * 99; // assumed $99 ARPU — program setting, shown in UI as editable
  const commissionPct = 30;     // starter tier — shown as "Program setting"
  const monthsRecurring = 12;
  const monthlyEarn = Math.round(monthly * commissionPct / 100);
  const yearlyEarn = monthlyEarn * monthsRecurring;

  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  return (
    <div style={{background:T.bgApp,fontFamily:T.ffBody,color:T.ink,minHeight:'100%'}}>
      {/* Nav */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 40px',borderBottom:`1px solid ${T.border}`,background:'#fff'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:30,height:30,borderRadius:8,background:'#020617',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="16" height="16" viewBox="0 0 64 64" fill="none"><path d="M14 14v36h20" stroke="#00F0FF" strokeWidth="7" strokeLinecap="round"/><path d="M30 14h22M30 50h14M44 28v22M30 28h9" stroke="#00F0FF" strokeWidth="7" strokeLinecap="round"/></svg>
          </div>
          <div style={{fontFamily:T.ffDisplay,fontSize:14,fontWeight:700}}>Logistic Intel</div>
          <span style={{...Btn.quiet,padding:'2px 8px',fontSize:11,background:T.brandSoft,color:T.brand,borderRadius:9999,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>Partners</span>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <button style={Btn.quiet}>Sign in</button>
          <button style={Btn.primary} onClick={onApply}>Apply to the program</button>
        </div>
      </div>

      {/* Hero */}
      <div style={{position:'relative',padding:'72px 40px 56px',textAlign:'center',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.10), transparent 55%)',pointerEvents:'none'}}/>
        <div style={{position:'relative',maxWidth:780,margin:'0 auto'}}>
          <Badge tone="brand" dot>LIT Partner Program · Invitation-based</Badge>
          <h1 style={{fontFamily:T.ffDisplay,fontSize:56,fontWeight:700,letterSpacing:'-0.03em',lineHeight:1.05,marginTop:22,textWrap:'balance'}}>
            Earn <span style={{background:'linear-gradient(95deg,#3b82f6,#7c3aed,#06b6d4)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>recurring revenue</span> by introducing LIT to logistics teams.
          </h1>
          <p style={{fontSize:17,color:T.inkSoft,marginTop:16,lineHeight:1.55,maxWidth:620,marginLeft:'auto',marginRight:'auto'}}>
            A high-trust partner program for consultants, advisors, and operators in freight and logistics.
            Transparent payouts via Stripe, monthly reporting, and a real account manager.
          </p>
          <div style={{display:'flex',gap:10,justifyContent:'center',marginTop:26}}>
            <button style={{...Btn.primary,padding:'12px 22px',fontSize:14}} onClick={onApply}>
              <i data-lucide="arrow-right" style={{width:14,height:14}}/> Apply to the program
            </button>
            <button style={{...Btn.ghost,padding:'12px 20px',fontSize:14}}>
              <i data-lucide="file-text" style={{width:14,height:14}}/> Read program terms
            </button>
          </div>
          <div style={{display:'flex',gap:26,justifyContent:'center',marginTop:32,fontSize:12.5,color:T.inkSoft}}>
            <span style={{display:'flex',alignItems:'center',gap:6}}><i data-lucide="shield-check" style={{width:13,height:13,color:T.green}}/> Stripe Connect payouts</span>
            <span style={{display:'flex',alignItems:'center',gap:6}}><i data-lucide="lock" style={{width:13,height:13,color:T.green}}/> SOC 2 Type II</span>
            <span style={{display:'flex',alignItems:'center',gap:6}}><i data-lucide="globe" style={{width:13,height:13,color:T.green}}/> 40+ payout countries</span>
          </div>
        </div>
      </div>

      {/* Commission tiers */}
      <div style={{padding:'40px 40px 24px',maxWidth:1100,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>Commission tiers</div>
          <h2 style={{fontFamily:T.ffDisplay,fontSize:28,fontWeight:700,letterSpacing:'-0.02em',marginTop:6}}>Paid per subscription. Paid every month.</h2>
          <div style={{fontSize:13,color:T.inkFaint,marginTop:6}}>Program settings · finalized at application approval</div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
          {[
            { name:'Starter',       pct:30, months:12, note:'Default tier for approved partners', active:true },
            { name:'Launch Promo',  pct:40, months:12, note:'Limited 30-day activation window',   badge:'Promo'  },
            { name:'Partner',       pct:'—', months:'—', note:'Custom rate for strategic partners',  badge:'By invite' },
          ].map(t => (
            <Card key={t.name} style={{padding:22, borderColor: t.active ? T.brand : T.border, boxShadow: t.active ? '0 6px 20px rgba(59,130,246,0.12)' : T.shadowSm}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div style={{fontFamily:T.ffDisplay,fontSize:13,fontWeight:700,letterSpacing:'-0.01em'}}>{t.name}</div>
                {t.active ? <Badge tone="brand">Current default</Badge> : <Badge tone="neutral">{t.badge}</Badge>}
              </div>
              <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                <span style={{fontFamily:T.ffDisplay,fontSize:42,fontWeight:700,letterSpacing:'-0.03em',color:T.ink}}>{t.pct}{typeof t.pct === 'number' && '%'}</span>
                <span style={{fontSize:13,color:T.inkSoft}}>commission</span>
              </div>
              <div style={{fontSize:12.5,color:T.inkSoft,marginTop:4}}>Recurring for {t.months}{typeof t.months==='number' && ' months'}</div>
              <div style={{height:1,background:T.borderSoft,margin:'16px 0'}}/>
              <div style={{fontSize:12.5,color:T.inkMuted,lineHeight:1.5}}>{t.note}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div style={{padding:'48px 40px',background:'#fff',borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,marginTop:40}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:32}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>How it works</div>
            <h2 style={{fontFamily:T.ffDisplay,fontSize:28,fontWeight:700,letterSpacing:'-0.02em',marginTop:6}}>Four steps. Paid monthly.</h2>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
            {[
              { n:'01', t:'Apply',           d:'Submit a short application. Reviewed within 2 business days.', i:'file-check' },
              { n:'02', t:'Share your link', d:'90-day attribution window. Tracks signups automatically.',   i:'link' },
              { n:'03', t:'Connect Stripe',  d:'Express onboarding. Verification handled by Stripe.',         i:'shield-check' },
              { n:'04', t:'Get paid',        d:'Monthly payouts. $50 minimum. Full ledger in-app.',           i:'wallet' },
            ].map(s => (
              <Card key={s.n}>
                <div style={{width:30,height:30,borderRadius:8,background:T.brandSoft,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:12}}>
                  <i data-lucide={s.i} style={{width:15,height:15,color:T.brand}}/>
                </div>
                <div style={{fontFamily:T.ffMono,fontSize:11,color:T.inkFaint,marginBottom:4}}>{s.n}</div>
                <div style={{fontFamily:T.ffDisplay,fontSize:15,fontWeight:700,color:T.ink,letterSpacing:'-0.01em'}}>{s.t}</div>
                <div style={{fontSize:12.5,color:T.inkSoft,marginTop:6,lineHeight:1.5}}>{s.d}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Calculator */}
      <div style={{padding:'56px 40px',maxWidth:1100,margin:'0 auto'}}>
        <div style={{display:'grid',gridTemplateColumns:'1.1fr 1fr',gap:32,alignItems:'center'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>Earnings estimator</div>
            <h2 style={{fontFamily:T.ffDisplay,fontSize:28,fontWeight:700,letterSpacing:'-0.02em',marginTop:6,lineHeight:1.15}}>See what recurring commission looks like at your referral volume.</h2>
            <p style={{fontSize:14,color:T.inkSoft,marginTop:12,lineHeight:1.55}}>
              Estimates based on LIT's $99/mo starter plan. Your actual rate is set at application approval — see your partner agreement for final terms.
            </p>
            <div style={{display:'flex',gap:10,marginTop:22}}>
              <button style={Btn.primary} onClick={onApply}><i data-lucide="arrow-right" style={{width:13,height:13}}/> Apply now</button>
              <button style={Btn.ghost}>Talk to partnerships</button>
            </div>
          </div>
          <Card style={{padding:28}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:12,color:T.inkSoft,fontFamily:T.ffDisplay,fontWeight:600}}>Referred customers / month</span>
              <span style={{fontFamily:T.ffMono,fontSize:13,fontWeight:600,color:T.brandDeep}}>{volume}</span>
            </div>
            <input type="range" min="1" max="40" value={volume} onChange={e=>setVolume(+e.target.value)} style={{width:'100%',accentColor:T.brand}}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:22}}>
              <div style={{background:T.bgSubtle,borderRadius:10,padding:14}}>
                <div style={{fontSize:10.5,fontWeight:600,letterSpacing:'0.07em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>Monthly earnings</div>
                <div style={{fontFamily:T.ffMono,fontSize:26,fontWeight:600,color:T.brandDeep,marginTop:4}}>${monthlyEarn.toLocaleString()}</div>
              </div>
              <div style={{background:T.bgSubtle,borderRadius:10,padding:14}}>
                <div style={{fontSize:10.5,fontWeight:600,letterSpacing:'0.07em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>12-month value</div>
                <div style={{fontFamily:T.ffMono,fontSize:26,fontWeight:600,color:T.green,marginTop:4}}>${yearlyEarn.toLocaleString()}</div>
              </div>
            </div>
            <div style={{fontSize:11,color:T.inkFaint,marginTop:12,fontFamily:T.ffDisplay,letterSpacing:'0.02em'}}>
              Assumes {commissionPct}% recurring for {monthsRecurring} months on $99/mo plan · program settings
            </div>
          </Card>
        </div>
      </div>

      {/* FAQ */}
      <div style={{padding:'40px 40px 72px',maxWidth:860,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>FAQ</div>
          <h2 style={{fontFamily:T.ffDisplay,fontSize:24,fontWeight:700,letterSpacing:'-0.02em',marginTop:6}}>Program details</h2>
        </div>
        {[
          { q:'Who qualifies as a partner?',         a:'Consultants, advisors, industry analysts, SaaS companies with logistics-adjacent audiences, and operators with credibility in freight. All applications reviewed.' },
          { q:'How is attribution tracked?',          a:'Each partner link carries a unique code. We store a cookie + fingerprint at landing and attribute signups within a 90-day window.' },
          { q:'When do I get paid?',                  a:'Commissions clear 30 days after invoice payment (refund window). Payouts batched monthly via Stripe Connect once the $50 minimum is met.' },
          { q:'What happens on refunds or chargebacks?', a:'Any commission tied to a refunded invoice is reversed — voided if pending, or debited from the next payout if already paid.' },
          { q:'Can I run paid ads on LIT terms?',      a:'No. Brand-bidding and paid search on "LIT", "Logistic Intel", or close variants is prohibited. Full terms in the partner agreement.' },
        ].map(f => (
          <div key={f.q} style={{padding:'16px 0',borderBottom:`1px solid ${T.borderSoft}`}}>
            <div style={{fontFamily:T.ffDisplay,fontSize:14,fontWeight:600,color:T.ink}}>{f.q}</div>
            <div style={{fontSize:13,color:T.inkSoft,marginTop:6,lineHeight:1.6}}>{f.a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { AffiliateLanding });
