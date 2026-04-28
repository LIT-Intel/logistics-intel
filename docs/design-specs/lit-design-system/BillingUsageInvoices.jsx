// BillingUsageInvoices.jsx — Usage meters + Invoices table + Payment method + Enterprise + Affiliate + Trust footer
'use strict';

/* ══ USAGE ══════════════════════════════════════ */
function BillingUsage({ usage, hasData, onUpgrade, canManage }) {
  if (!hasData) {
    return (
      <div>
        <BSectionTitle overline="Usage" title="Usage & limits"
          subtitle="Live utilization of plan-capped resources. Resets automatically at the start of each billing cycle."/>
        <EmptyState
          icon="gauge"
          title="Usage data not available yet"
          body="We couldn't load your usage from the backend. Once the metering pipeline is connected, detailed meters will appear here."
          cta={canManage ? { label:'Open Stripe portal', action:()=>{} } : null}
        />
      </div>
    );
  }
  return (
    <div>
      <BSectionTitle overline="Usage" title="Usage & limits"
        subtitle="Live utilization of plan-capped resources. Resets automatically at the start of each billing cycle."
        right={<BBadge tone="slate" icon="refresh-cw">Synced 2 min ago</BBadge>}/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
        {usage.map((u,i)=><BMeter key={i} {...u}/>)}
      </div>
      {usage.some(u=>u.limit !== Infinity && (u.used/u.limit) >= 0.8) && canManage && (
        <div style={{marginTop:14,background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <i data-lucide="trending-up" style={{width:16,height:16,color:'#d97706',flexShrink:0}}></i>
          <div style={{flex:1,minWidth:200,fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#92400e'}}>
            You're approaching plan limits on some resources. Upgrade to avoid interruptions.
          </div>
          <button onClick={onUpgrade} style={{...bBtnGhost,border:'1px solid #FDE68A',color:'#92400e',padding:'6px 12px'}}>Compare plans</button>
        </div>
      )}
    </div>
  );
}

/* ══ INVOICES ══════════════════════════════════════ */
function BillingInvoices({ invoices, hasData, onPortal, canManage }) {
  if (!hasData || !invoices || invoices.length===0) {
    return (
      <div>
        <BSectionTitle overline="History" title="Invoices & payment history"
          subtitle="Every charge, retry, and refund. Downloadable PDFs served by Stripe."/>
        <EmptyState
          icon="receipt"
          title="Invoices are managed in Stripe"
          body="Open your Stripe Customer Portal to view, download, or dispute every invoice. The portal also handles refunds and tax receipts."
          cta={canManage ? { label:'Open Stripe billing portal', action:onPortal, icon:'external-link' } : null}
        />
      </div>
    );
  }
  return (
    <div>
      <BSectionTitle overline="History" title="Invoices & payment history"
        subtitle="Every charge, retry, and refund. Downloadable PDFs served by Stripe."
        right={canManage && <button onClick={onPortal} style={bBtnGhost}><i data-lucide="external-link" style={{width:13,height:13}}></i> All invoices in Stripe</button>}/>
      <BCard padding={0}>
        <div style={{display:'grid',gridTemplateColumns:'140px 140px 1fr 120px 100px 100px',gap:12,padding:'14px 20px',borderBottom:'1px solid #F1F5F9',background:'#FAFBFF'}}>
          {['Date','Invoice #','Description','Amount','Status',''].map(h=>(
            <div key={h} style={{fontFamily:'Space Grotesk,sans-serif',fontSize:10.5,fontWeight:700,color:'#94a3b8',letterSpacing:'0.1em',textTransform:'uppercase'}}>{h}</div>
          ))}
        </div>
        {invoices.map((inv,i)=>(
          <InvoiceRow key={inv.id} inv={inv} last={i===invoices.length-1}/>
        ))}
      </BCard>
    </div>
  );
}

function InvoiceRow({ inv, last }) {
  const [hover, setHover] = React.useState(false);
  const statusMap = {
    paid:     { tone:'green',  label:'Paid' },
    open:     { tone:'blue',   label:'Open' },
    failed:   { tone:'red',    label:'Failed' },
    refunded: { tone:'slate',  label:'Refunded' },
    void:     { tone:'slate',  label:'Void' },
  };
  const s = statusMap[inv.status] || statusMap.open;
  return (
    <div
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      style={{
        display:'grid',gridTemplateColumns:'140px 140px 1fr 120px 100px 100px',gap:12,
        padding:'14px 20px',
        borderBottom: last?'none':'1px solid #F1F5F9',
        alignItems:'center',
        background: hover ? '#FAFBFF' : '#fff',
        transition:'background 120ms',
      }}>
      <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#0F172A',fontWeight:500}}>{inv.date}</div>
      <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11.5,color:'#64748b'}}>{inv.number}</div>
      <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#475569'}}>{inv.description}</div>
      <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:13.5,fontWeight:700,color:'#0F172A'}}>${inv.amount.toFixed(2)}</div>
      <BBadge tone={s.tone} dot>{s.label}</BBadge>
      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
        {inv.status !== 'void' && (
          <>
            <button style={{background:'transparent',border:'1px solid #E5E7EB',borderRadius:7,padding:'5px 8px',cursor:'pointer',color:'#64748b',fontFamily:'Space Grotesk,sans-serif',fontSize:11,fontWeight:600,display:'inline-flex',alignItems:'center',gap:4}}>
              <i data-lucide="eye" style={{width:11,height:11}}></i>
            </button>
            <button style={{background:'transparent',border:'1px solid #E5E7EB',borderRadius:7,padding:'5px 8px',cursor:'pointer',color:'#64748b',fontFamily:'Space Grotesk,sans-serif',fontSize:11,fontWeight:600,display:'inline-flex',alignItems:'center',gap:4}}>
              <i data-lucide="download" style={{width:11,height:11}}></i>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ══ PAYMENT METHOD ══════════════════════════════════════ */
function PaymentMethodCard({ pm, email, onPortal, canManage, status }) {
  const hasCard = pm && pm.last4;
  const brandIcon = {
    visa:'credit-card', mastercard:'credit-card', amex:'credit-card', discover:'credit-card'
  }[pm?.brand?.toLowerCase?.()] || 'credit-card';

  return (
    <BCard padding={0} style={{overflow:'hidden'}}>
      <div style={{display:'grid',gridTemplateColumns:'1.1fr 1fr',gap:0}}>
        {/* Left: visual card */}
        <div style={{position:'relative',padding:'22px 22px 20px',background:'linear-gradient(135deg,#0F172A 0%, #1e293b 55%, #1e3a8a 100%)',color:'#fff',overflow:'hidden',minHeight:180}}>
          <div style={{position:'absolute',top:-40,right:-40,width:160,height:160,borderRadius:'50%',background:'radial-gradient(circle, rgba(0,240,255,0.22), transparent 65%)'}}/>
          <div style={{position:'absolute',bottom:-30,left:-30,width:120,height:120,borderRadius:'50%',background:'radial-gradient(circle, rgba(59,130,246,0.25), transparent 70%)'}}/>
          <div style={{position:'relative',display:'flex',alignItems:'center',gap:8,marginBottom:22}}>
            <i data-lucide={brandIcon} style={{width:18,height:18,color:'#00F0FF'}}></i>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:11,fontWeight:700,color:'#94a3b8',letterSpacing:'0.14em',textTransform:'uppercase'}}>Payment method</div>
            <div style={{flex:1}}/>
            {hasCard
              ? <BBadge tone="green" dot size="sm">Active</BBadge>
              : <BBadge tone="amber" dot size="sm">Missing</BBadge>}
          </div>
          <div style={{position:'relative',fontFamily:'JetBrains Mono,monospace',fontSize:22,fontWeight:700,letterSpacing:'0.18em',color:hasCard?'#f1f5f9':'#64748b'}}>
            {hasCard ? `•••• •••• •••• ${pm.last4}` : 'No card on file'}
          </div>
          <div style={{position:'relative',display:'flex',gap:24,marginTop:18,fontFamily:'Space Grotesk,sans-serif',fontSize:11}}>
            <div>
              <div style={{color:'#64748b',letterSpacing:'0.08em',textTransform:'uppercase',fontSize:9.5,fontWeight:700}}>Brand</div>
              <div style={{color:'#E2E8F0',fontWeight:600,marginTop:3}}>{pm?.brand || '—'}</div>
            </div>
            <div>
              <div style={{color:'#64748b',letterSpacing:'0.08em',textTransform:'uppercase',fontSize:9.5,fontWeight:700}}>Expires</div>
              <div style={{color:'#E2E8F0',fontWeight:600,marginTop:3}}>{pm?.expiry || '—'}</div>
            </div>
            <div>
              <div style={{color:'#64748b',letterSpacing:'0.08em',textTransform:'uppercase',fontSize:9.5,fontWeight:700}}>Country</div>
              <div style={{color:'#E2E8F0',fontWeight:600,marginTop:3}}>{pm?.country || '—'}</div>
            </div>
          </div>
        </div>
        {/* Right: meta + CTA */}
        <div style={{padding:'22px 24px',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
          <div>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:14,fontWeight:700,color:'#0F172A'}}>
              {hasCard ? 'Card on file' : 'Add a payment method'}
            </div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#64748b',marginTop:6,lineHeight:1.55}}>
              {hasCard
                ? 'All charges route through Stripe. Update your card, billing address, or tax ID from the portal.'
                : 'LIT never stores raw card data. Payment collection and updates happen in Stripe Checkout.'}
            </div>
            <div style={{marginTop:14,padding:'10px 12px',background:'#F8FAFC',border:'1px solid #F1F5F9',borderRadius:10,display:'flex',alignItems:'center',gap:10}}>
              <i data-lucide="mail" style={{width:14,height:14,color:'#64748b'}}></i>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:10.5,fontWeight:700,color:'#94a3b8',letterSpacing:'0.08em',textTransform:'uppercase'}}>Billing email</div>
                <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#0F172A',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{email || 'Not set'}</div>
              </div>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:16}}>
            <button onClick={onPortal} disabled={!canManage}
              style={{...bBtnPrimary,justifyContent:'center',padding:'10px 14px',opacity:canManage?1:0.5,cursor:canManage?'pointer':'not-allowed'}}>
              <i data-lucide={hasCard?'credit-card':'plus-circle'} style={{width:13,height:13}}></i>
              {hasCard ? 'Manage payment method' : 'Add payment method'}
            </button>
            <button onClick={onPortal} disabled={!canManage}
              style={{...bBtnGhost,justifyContent:'center',padding:'9px 14px',opacity:canManage?1:0.5,cursor:canManage?'pointer':'not-allowed'}}>
              <i data-lucide="external-link" style={{width:13,height:13}}></i> Open Stripe portal
            </button>
          </div>
        </div>
      </div>
    </BCard>
  );
}

/* ══ ENTERPRISE / SALES ══════════════════════════════════════ */
function EnterpriseCard({ onContact }) {
  return (
    <BCard style={{padding:0,overflow:'hidden',background:'linear-gradient(135deg,#0F172A 0%, #1e1b4b 60%, #312e81 100%)',border:'1px solid #1e293b',color:'#fff'}}>
      <div style={{position:'relative',padding:'28px 32px',overflow:'hidden'}}>
        <div style={{position:'absolute',top:-80,right:-40,width:260,height:260,borderRadius:'50%',background:'radial-gradient(circle, rgba(139,92,246,0.35), transparent 65%)',pointerEvents:'none'}}/>
        <div style={{position:'absolute',bottom:-80,left:-60,width:220,height:220,borderRadius:'50%',background:'radial-gradient(circle, rgba(0,240,255,0.18), transparent 65%)',pointerEvents:'none'}}/>

        <div style={{position:'relative',display:'grid',gridTemplateColumns:'1.3fr 1fr',gap:28,alignItems:'center'}}>
          <div>
            <BBadge tone="dark" icon="building-2">Enterprise</BBadge>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:28,fontWeight:700,letterSpacing:'-0.02em',marginTop:14,lineHeight:1.15,maxWidth:460}}>
              Built for teams closing eight-figure freight contracts.
            </div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13.5,color:'#cbd5e1',marginTop:10,lineHeight:1.6,maxWidth:520}}>
              Custom seat pools, pooled credits, SSO/SAML, a dedicated CSM, and contract-based billing. No Stripe Checkout — your account team handles it end-to-end.
            </div>
            <div style={{display:'flex',gap:10,marginTop:18,flexWrap:'wrap'}}>
              <button onClick={onContact} style={{...bBtnPrimary,background:'linear-gradient(180deg,#00F0FF,#06b6d4)',border:'1px solid #06b6d4',color:'#0F172A',boxShadow:'0 0 16px rgba(0,240,255,0.35)'}}>
                <i data-lucide="calendar" style={{width:13,height:13}}></i> Contact sales
              </button>
              <button onClick={onContact} style={{...bBtnGhost,background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.15)',color:'#E2E8F0'}}>
                <i data-lucide="video" style={{width:13,height:13}}></i> Book a demo
              </button>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {[
              ['Custom pricing','receipt'],
              ['Unlimited seats','users'],
              ['Full API access','code'],
              ['Dedicated CSM','life-buoy'],
              ['SSO/SAML, SCIM','shield-check'],
              ['99.9% uptime SLA','activity'],
            ].map(([l,ic])=>(
              <div key={l} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,padding:'11px 12px',display:'flex',alignItems:'center',gap:9}}>
                <i data-lucide={ic} style={{width:14,height:14,color:'#00F0FF'}}></i>
                <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12.5,fontWeight:600,color:'#E2E8F0'}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BCard>
  );
}

/* ══ AFFILIATE TIE-IN ══════════════════════════════════════ */
function AffiliateTieIn({ affiliateRole, onApply, onDashboard, onAdmin }) {
  const config = {
    none:       { title:'Earn credits and commission with LIT Partners',
                  body:'Refer freight teams you already know. Get 20% recurring commission for 12 months — paid monthly via Stripe Connect.',
                  cta:'Apply to become an affiliate', icon:'sparkles', action:onApply },
    affiliate:  { title:'You\u2019re a LIT affiliate',
                  body:'Track referrals, payouts, and conversion rate. Share your link and earn recurring revenue on every paid workspace you send.',
                  cta:'Open affiliate dashboard', icon:'bar-chart-3', action:onDashboard },
    admin:      { title:'Affiliate program admin',
                  body:'Review partner applications, approve payouts, and manage commission rules across the program.',
                  cta:'Open partner admin', icon:'shield-check', action:onAdmin },
  }[affiliateRole] || { title:'', body:'', cta:'', icon:'', action:()=>{} };

  return (
    <BCard padding={0} style={{overflow:'hidden'}}>
      <div style={{display:'grid',gridTemplateColumns:'auto 1fr auto',gap:18,alignItems:'center',padding:'20px 24px',background:'linear-gradient(90deg,#FFFFFF 0%, #FFF7ED 60%, #FEF3C7 100%)'}}>
        <div style={{width:48,height:48,borderRadius:12,background:'linear-gradient(135deg,#f59e0b,#f97316)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(245,158,11,0.3)',flexShrink:0}}>
          <i data-lucide="gift" style={{width:22,height:22,color:'#fff'}}></i>
        </div>
        <div>
          <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:15,fontWeight:700,color:'#0F172A',letterSpacing:'-0.01em'}}>{config.title}</div>
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#78350f',marginTop:3,lineHeight:1.5,maxWidth:560}}>{config.body}</div>
        </div>
        <button onClick={config.action} style={{...bBtnPrimary,background:'linear-gradient(180deg,#f59e0b,#d97706)',border:'1px solid #d97706',boxShadow:'0 2px 8px rgba(245,158,11,0.3)'}}>
          <i data-lucide={config.icon} style={{width:13,height:13}}></i> {config.cta}
        </button>
      </div>
    </BCard>
  );
}

/* ══ TRUST FOOTER ══════════════════════════════════════ */
function TrustFooter() {
  return (
    <div style={{marginTop:8,padding:'18px 22px',background:'#F8FAFC',border:'1px solid #E5E7EB',borderRadius:14,display:'flex',alignItems:'center',gap:22,flexWrap:'wrap',justifyContent:'space-between'}}>
      <div style={{display:'flex',alignItems:'center',gap:22,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:5,background:'#fff',border:'1px solid #E5E7EB',borderRadius:8,padding:'5px 10px',fontFamily:'Space Grotesk,sans-serif',fontSize:11.5,fontWeight:700,color:'#635BFF'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path fill="#635BFF" d="M13.5 9c0-.7.6-1 1.6-1 1.5 0 3.3.4 4.7 1.2V4.7C18.3 4.1 16.8 3.8 15 3.8c-4.1 0-6.9 2.2-6.9 5.8 0 5.6 7.5 4.7 7.5 7.1 0 .9-.8 1.2-1.8 1.2-1.7 0-3.8-.7-5.4-1.6v4.5c1.6.7 3.5 1 5.4 1 4.2 0 7-2.1 7-5.8 0-6-7.3-4.9-7.3-7z"/></svg>
            Powered by Stripe
          </div>
          {[
            ['lock','Secure checkout'],
            ['users','Role-based access'],
            ['file-text','Invoices managed securely'],
            ['shield-check','SOC 2 Type II'],
          ].map(([ic,l])=>(
            <div key={l} style={{display:'flex',alignItems:'center',gap:6,fontFamily:'Space Grotesk,sans-serif',fontSize:11.5,fontWeight:600,color:'#64748b'}}>
              <i data-lucide={ic} style={{width:12,height:12}}></i> {l}
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:14,fontFamily:'DM Sans,sans-serif',fontSize:11.5,color:'#94a3b8'}}>
          <a href="#" style={{color:'#64748b',textDecoration:'none'}}>Billing terms</a>
          <a href="#" style={{color:'#64748b',textDecoration:'none'}}>Tax & VAT</a>
          <a href="#" style={{color:'#64748b',textDecoration:'none'}}>Refund policy</a>
        </div>
      </div>
    </div>
  );
}

/* ══ EMPTY STATE ══════════════════════════════════════ */
function EmptyState({ icon, title, body, cta }) {
  return (
    <BCard style={{padding:'38px 28px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
      <div style={{width:48,height:48,borderRadius:12,background:'linear-gradient(135deg,#F1F5F9,#E2E8F0)',border:'1px solid #E5E7EB',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <i data-lucide={icon} style={{width:22,height:22,color:'#64748b'}}></i>
      </div>
      <div>
        <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:15,fontWeight:700,color:'#0F172A'}}>{title}</div>
        <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#64748b',marginTop:6,maxWidth:480,lineHeight:1.55}}>{body}</div>
      </div>
      {cta && (
        <button onClick={cta.action} style={{...bBtnPrimary,marginTop:6}}>
          {cta.icon && <i data-lucide={cta.icon} style={{width:13,height:13}}></i>}
          {cta.label}
        </button>
      )}
    </BCard>
  );
}

/* ══ STRIPE HANDOFF MODAL ══════════════════════════════════════ */
function StripeHandoffModal({ action, onClose, onConfirm, plan, cycle }) {
  if (!action) return null;
  const config = {
    checkout: {
      title:'Opening Stripe Checkout',
      body:`We'll redirect you to Stripe's hosted checkout to subscribe to the ${plan||'Pro'} plan, billed ${cycle||'monthly'}. LIT never sees your card details.`,
      icon:'shopping-cart',
      cta:'Continue to Stripe',
    },
    portal: {
      title:'Opening Stripe Customer Portal',
      body:'Manage your payment method, tax details, billing history, and subscription from Stripe\u2019s secure portal.',
      icon:'external-link',
      cta:'Open portal',
    },
    contact: {
      title:'Contact the LIT sales team',
      body:'Our team will reach out within one business day. You can also book time directly on our calendar.',
      icon:'calendar',
      cta:'Book a meeting',
    },
  }[action];

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(3px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:18,width:'100%',maxWidth:460,boxShadow:'0 24px 60px rgba(0,0,0,0.3)',overflow:'hidden'}}>
        <div style={{position:'relative',padding:'24px 28px 20px',borderBottom:'1px solid #F1F5F9',background:'linear-gradient(180deg,#FAFBFF,#FFFFFF)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:40,height:40,borderRadius:10,background:'linear-gradient(135deg,#635BFF,#8B7EFF)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 3px 10px rgba(99,91,255,0.35)'}}>
              <i data-lucide={config.icon} style={{width:18,height:18,color:'#fff'}}></i>
            </div>
            <div>
              <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:16,fontWeight:700,color:'#0F172A'}}>{config.title}</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:2}}>Secure handoff · LIT never stores card data</div>
            </div>
          </div>
          <button onClick={onClose} style={{position:'absolute',top:16,right:16,background:'none',border:'none',padding:6,cursor:'pointer',color:'#94a3b8'}}>
            <i data-lucide="x" style={{width:16,height:16}}></i>
          </button>
        </div>
        <div style={{padding:'20px 28px 24px'}}>
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13.5,color:'#475569',lineHeight:1.6}}>{config.body}</div>
          <div style={{marginTop:16,padding:'10px 12px',background:'#F8FAFC',border:'1px solid #F1F5F9',borderRadius:10,display:'flex',alignItems:'center',gap:10}}>
            <i data-lucide="lock" style={{width:13,height:13,color:'#64748b'}}></i>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11.5,color:'#64748b'}}>Redirect uses PCI-DSS Level 1 infrastructure. Returns you to LIT on completion.</div>
          </div>
        </div>
        <div style={{padding:'16px 28px',borderTop:'1px solid #F1F5F9',display:'flex',justifyContent:'flex-end',gap:8,background:'#FAFBFF'}}>
          <button onClick={onClose} style={bBtnGhost}>Cancel</button>
          <button onClick={onConfirm} style={bBtnPrimary}>
            <i data-lucide="arrow-right" style={{width:13,height:13}}></i> {config.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BillingUsage, BillingInvoices, PaymentMethodCard, EnterpriseCard, AffiliateTieIn, TrustFooter, EmptyState, StripeHandoffModal });
