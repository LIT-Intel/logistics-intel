// AffiliateAdmin.jsx — Internal LIT ops view.
// Access: super_admin users only. Review applications, manage tiers,
// approve commissions, run payouts.
'use strict';

function AffiliateAdmin({ initialTab, onTabChange }) {
  const [tab, setTabState] = React.useState(initialTab || 'applications');
  React.useEffect(() => { if (initialTab && initialTab !== tab) setTabState(initialTab); }, [initialTab]);
  const setTab = (t) => { setTabState(t); if (onTabChange) onTabChange(t); };
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  return (
    <div style={{background:T.bgApp,flex:1,minHeight:'100%',width:'100%',fontFamily:T.ffBody,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{background:'#fff',borderBottom:`1px solid ${T.border}`,padding:'20px 32px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4,flexWrap:'nowrap'}}>
          <div style={{fontFamily:T.ffDisplay,fontSize:20,fontWeight:700,letterSpacing:'-0.02em',color:T.ink,whiteSpace:'nowrap'}}>Partner program · Admin</div>
          <Badge tone="violet" dot>Internal</Badge>
        </div>
        <div style={{fontSize:12.5,color:T.inkSoft}}>Applications, tiers, commissions, payouts. Changes are audit-logged.</div>
        <div style={{display:'flex',gap:4,marginTop:18,marginBottom:-21}}>
          {[
            { k:'applications', l:'Applications', i:'inbox',     b:12 },
            { k:'partners',     l:'Partners',     i:'users',     b:null },
            { k:'commissions',  l:'Commissions',  i:'coins',     b:3 },
            { k:'payouts',      l:'Payout runs',  i:'send',      b:null },
            { k:'tiers',        l:'Tiers',        i:'layers',    b:null },
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
                {t.b != null && <span style={{background:T.brand,color:'#fff',fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:9999}}>{t.b}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{flex:1,padding:'24px 32px',overflowY:'auto',minHeight:0}}>
        {tab==='applications' && <AdminApplications/>}
        {tab==='partners'     && <AdminPartners/>}
        {tab==='commissions'  && <AdminCommissions/>}
        {tab==='payouts'      && <AdminPayouts/>}
        {tab==='tiers'        && <AdminTiers/>}
      </div>
    </div>
  );
}

function AdminApplications() {
  return (
    <div style={{maxWidth:1240,margin:'0 auto',display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
        <Card><StatCell label="Pending review" value="12"/></Card>
        <Card><StatCell label="Approved (30d)" value="34"/></Card>
        <Card><StatCell label="Rejected (30d)" value="8"/></Card>
        <Card><StatCell label="Avg review time" value="18h"/></Card>
      </div>
      <Card padded={false}>
        <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.borderSoft}`,display:'flex',alignItems:'center',gap:10}}>
          <div style={{fontFamily:T.ffDisplay,fontSize:13,fontWeight:700,color:T.ink,flex:1}}>Pending applications</div>
          <input placeholder="Search applicant, email, company…" style={{border:`1px solid ${T.border}`,borderRadius:8,padding:'7px 12px',fontSize:12.5,fontFamily:T.ffBody,width:280}}/>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
          <thead><tr style={{background:T.bgSubtle,textAlign:'left'}}>
            {['Applicant','Audience','Channels','Est. referrals/mo','Submitted','Fit score',''].map(h => (
              <th key={h} style={{padding:'10px 16px',fontSize:10.5,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {[
              { n:'Marcus Chen',    e:'marcus@freightwise.io', aud:'Freight brokers (5k list)', ch:['Newsletter','LinkedIn'],           est:'8–12', when:'2h ago',  fit:92 },
              { n:'Priya Shah',     e:'priya@logistics.day',  aud:'LinkedIn creator · 18k',    ch:['LinkedIn','YouTube'],               est:'4–6',  when:'5h ago',  fit:86 },
              { n:'Jordan Ellis',   e:'jordan@brokerstack.co',aud:'Broker community (Slack)',  ch:['Community','Newsletter'],           est:'15–20',when:'1d ago',  fit:88 },
              { n:'Sam Rivera',     e:'sam@portcast.media',   aud:'Trade intel podcast · 9k',  ch:['Podcast','Newsletter'],             est:'3–5',  when:'2d ago',  fit:74 },
            ].map((r,i,arr) => (
              <tr key={i} style={{borderBottom: i<arr.length-1 ? `1px solid ${T.borderSoft}` : 'none'}}>
                <td style={{padding:'12px 16px'}}>
                  <div style={{fontFamily:T.ffDisplay,fontWeight:600,color:T.ink}}>{r.n}</div>
                  <div style={{fontFamily:T.ffMono,fontSize:11.5,color:T.inkFaint}}>{r.e}</div>
                </td>
                <td style={{padding:'12px 16px',color:T.inkMuted}}>{r.aud}</td>
                <td style={{padding:'12px 16px'}}>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                    {r.ch.map(c => <Badge key={c}>{c}</Badge>)}
                  </div>
                </td>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.ink}}>{r.est}</td>
                <td style={{padding:'12px 16px',color:T.inkSoft,fontFamily:T.ffMono}}>{r.when}</td>
                <td style={{padding:'12px 16px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:44,height:5,background:T.bgSunken,borderRadius:3,overflow:'hidden'}}>
                      <div style={{width:`${r.fit}%`,height:'100%',background: r.fit>=85?T.green : r.fit>=70?T.amber : T.red}}/>
                    </div>
                    <span style={{fontFamily:T.ffMono,fontSize:12,fontWeight:600,color:T.ink}}>{r.fit}</span>
                  </div>
                </td>
                <td style={{padding:'12px 16px'}}>
                  <div style={{display:'flex',gap:6}}>
                    <button style={{...Btn.ghost,padding:'5px 10px',fontSize:11.5}}>Review</button>
                    <button style={{...Btn.primary,padding:'5px 10px',fontSize:11.5}}>Approve</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function AdminPartners() {
  return (
    <Card padded={false} style={{maxWidth:1240,margin:'0 auto'}}>
      <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.borderSoft}`,fontFamily:T.ffDisplay,fontSize:13,fontWeight:700}}>Active partners · 184</div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
        <thead><tr style={{background:T.bgSubtle,textAlign:'left'}}>
          {['Partner','Tier','Referrals','MRR driven','LTV earned','Status',''].map(h => (
            <th key={h} style={{padding:'10px 16px',fontSize:10.5,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {[
            { n:'Marcus Chen',    t:'Elite',   r:128,  mrr:'$42K',  ltv:'$18,420', s:'active' },
            { n:'Priya Shah',     t:'Growth',  r:64,   mrr:'$19K',  ltv:'$8,240',  s:'active' },
            { n:'Jordan Ellis',   t:'Starter', r:22,   mrr:'$6.6K', ltv:'$1,980',  s:'active' },
            { n:'Sam Rivera',     t:'Starter', r:8,    mrr:'$2.4K', ltv:'$720',    s:'active' },
            { n:'Kira Mendoza',   t:'Growth',  r:41,   mrr:'$12K',  ltv:'$5,160',  s:'suspended' },
          ].map((r,i,arr) => (
            <tr key={i} style={{borderBottom: i<arr.length-1 ? `1px solid ${T.borderSoft}` : 'none'}}>
              <td style={{padding:'12px 16px',fontFamily:T.ffDisplay,fontWeight:600,color:T.ink}}>{r.n}</td>
              <td style={{padding:'12px 16px'}}><Badge tone={r.t==='Elite'?'violet':r.t==='Growth'?'brand':'neutral'}>{r.t}</Badge></td>
              <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.ink}}>{r.r}</td>
              <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.brandDeep,fontWeight:600}}>{r.mrr}</td>
              <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.ink}}>{r.ltv}</td>
              <td style={{padding:'12px 16px'}}><Badge tone={r.s==='active'?'success':'danger'} dot>{r.s}</Badge></td>
              <td style={{padding:'12px 16px'}}><button style={{...Btn.ghost,padding:'5px 10px',fontSize:11.5}}>Manage</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function AdminCommissions() {
  return (
    <div style={{maxWidth:1240,margin:'0 auto',display:'flex',flexDirection:'column',gap:16}}>
      <Card>
        <div style={{display:'flex',gap:14,alignItems:'center'}}>
          <i data-lucide="alert-circle" style={{width:18,height:18,color:T.amber,flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontFamily:T.ffDisplay,fontSize:13.5,fontWeight:700,color:T.ink}}>3 commissions flagged for review</div>
            <div style={{fontSize:12.5,color:T.inkSoft,marginTop:2}}>Unusual attribution patterns — review before next payout run.</div>
          </div>
          <button style={Btn.primary}>Review flagged</button>
        </div>
      </Card>
      <Card padded={false}>
        <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.borderSoft}`,fontFamily:T.ffDisplay,fontSize:13,fontWeight:700}}>Commission ledger</div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
          <thead><tr style={{background:T.bgSubtle,textAlign:'left'}}>
            {['Created','Partner','Referred customer','Invoice','Amount','Clears','Status'].map(h => (
              <th key={h} style={{padding:'10px 16px',fontSize:10.5,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {[
              { d:'Apr 22', p:'Marcus Chen',  c:'Meridian Cargo', inv:'INV-8402', a:'$29.70', cl:'May 22', s:'pending',  tone:'warn' },
              { d:'Apr 21', p:'Priya Shah',   c:'Harbor Logistics',inv:'INV-8398',a:'$89.70', cl:'May 21', s:'pending',  tone:'warn' },
              { d:'Apr 19', p:'Jordan Ellis', c:'Blue Ocean',     inv:'INV-8390', a:'$29.70', cl:'—',      s:'flagged',  tone:'danger' },
              { d:'Apr 01', p:'Marcus Chen',  c:'Vanguard Trade', inv:'INV-8210', a:'$59.40', cl:'—',      s:'earned',   tone:'success' },
              { d:'Mar 28', p:'Priya Shah',   c:'Pacific Freight',inv:'INV-8180', a:'$29.70', cl:'—',      s:'voided',   tone:'danger' },
            ].map((r,i,arr) => (
              <tr key={i} style={{borderBottom: i<arr.length-1 ? `1px solid ${T.borderSoft}` : 'none'}}>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.inkSoft}}>{r.d}</td>
                <td style={{padding:'12px 16px',fontFamily:T.ffDisplay,fontWeight:600,color:T.ink}}>{r.p}</td>
                <td style={{padding:'12px 16px',color:T.inkMuted}}>{r.c}</td>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.inkSoft}}>{r.inv}</td>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,fontWeight:600,color:T.ink}}>{r.a}</td>
                <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.inkSoft}}>{r.cl}</td>
                <td style={{padding:'12px 16px'}}><Badge tone={r.tone} dot>{r.s}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function AdminPayouts() {
  return (
    <Card padded={false} style={{maxWidth:1240,margin:'0 auto'}}>
      <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.borderSoft}`,display:'flex',alignItems:'center',gap:10}}>
        <div style={{fontFamily:T.ffDisplay,fontSize:13,fontWeight:700,color:T.ink,flex:1}}>Payout runs</div>
        <button style={Btn.ghost}><i data-lucide="play" style={{width:12,height:12}}/>Dry-run next batch</button>
        <button style={Btn.primary}><i data-lucide="send" style={{width:12,height:12}}/>Run April payout</button>
      </div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
        <thead><tr style={{background:T.bgSubtle,textAlign:'left'}}>
          {['Period','Partners','Commissions','Amount','Stripe batch','Run at','Status'].map(h => (
            <th key={h} style={{padding:'10px 16px',fontSize:10.5,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:T.inkFaint,fontFamily:T.ffDisplay}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {[
            { p:'Apr 2026', ppl:184, c:842,   amt:'$42,180', b:'batch_1Or…', r:'Scheduled May 1', s:'queued', tone:'warn' },
            { p:'Mar 2026', ppl:172, c:790,   amt:'$38,220', b:'batch_1Oq…', r:'Apr 1, 09:02 UTC',s:'paid',   tone:'success' },
            { p:'Feb 2026', ppl:158, c:702,   amt:'$34,910', b:'batch_1On…', r:'Mar 1, 09:01 UTC',s:'paid',   tone:'success' },
          ].map((r,i,arr) => (
            <tr key={i} style={{borderBottom: i<arr.length-1 ? `1px solid ${T.borderSoft}` : 'none'}}>
              <td style={{padding:'12px 16px',fontFamily:T.ffDisplay,fontWeight:600,color:T.ink}}>{r.p}</td>
              <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.ink}}>{r.ppl}</td>
              <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.inkMuted}}>{r.c}</td>
              <td style={{padding:'12px 16px',fontFamily:T.ffMono,fontWeight:600,color:T.brandDeep}}>{r.amt}</td>
              <td style={{padding:'12px 16px',fontFamily:T.ffMono,color:T.inkSoft}}>{r.b}</td>
              <td style={{padding:'12px 16px',color:T.inkSoft,fontFamily:T.ffMono}}>{r.r}</td>
              <td style={{padding:'12px 16px'}}><Badge tone={r.tone} dot>{r.s}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function AdminTiers() {
  return (
    <div style={{maxWidth:1240,margin:'0 auto',display:'flex',flexDirection:'column',gap:16}}>
      <Card>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
          <i data-lucide="info" style={{width:14,height:14,color:T.brand}}/>
          <div style={{fontSize:12.5,color:T.inkMuted}}>Tier rates are applied at time of earn and snapshotted on each commission row. Changes do not retroactively affect cleared commissions.</div>
        </div>
      </Card>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
        {[
          { n:'Starter', rate:'20%', mo:12, min:'$50',  c:'neutral', count:142 },
          { n:'Growth',  rate:'30%', mo:12, min:'$50',  c:'brand',   count:36 },
          { n:'Elite',   rate:'40%', mo:12, min:'$100', c:'violet',  count:6  },
        ].map(t => (
          <Card key={t.n}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
              <Badge tone={t.c}>{t.n}</Badge>
              <div style={{flex:1}}/>
              <button style={{...Btn.quiet}}><i data-lucide="pencil" style={{width:11,height:11}}/>Edit</button>
            </div>
            <div style={{fontFamily:T.ffMono,fontSize:32,fontWeight:600,color:T.brandDeep,lineHeight:1}}>{t.rate}</div>
            <div style={{fontSize:12,color:T.inkSoft,marginTop:4}}>recurring for {t.mo} months</div>
            <div style={{height:1,background:T.borderSoft,margin:'14px 0'}}/>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:T.inkMuted}}><span>Min payout</span><span style={{fontFamily:T.ffMono,color:T.ink,fontWeight:600}}>{t.min}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:T.inkMuted,marginTop:6}}><span>Partners</span><span style={{fontFamily:T.ffMono,color:T.ink,fontWeight:600}}>{t.count}</span></div>
          </Card>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { AffiliateAdmin });
