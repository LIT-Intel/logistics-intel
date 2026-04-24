// BillingHero.jsx — Billing overview hero + state banners
'use strict';

/* ══ HERO ══════════════════════════════════════════ */
function BillingHero({ state, cycle, setCycle, onUpgrade, onPortal, onContact, canManage }) {
  const s = state;

  // State-based CTAs
  const ctaConfig = (() => {
    if (!canManage) return { primary:null };
    if (s.status === 'free')       return { primary:{label:'Start subscription', icon:'sparkles',    action:onUpgrade, style:bBtnPrimary} };
    if (s.status === 'trial')      return { primary:{label:'Upgrade now',         icon:'arrow-up-circle', action:onUpgrade, style:bBtnPrimary} };
    if (s.status === 'pastdue')    return { primary:{label:'Update payment',      icon:'credit-card', action:onPortal,  style:{...bBtnPrimary,background:'linear-gradient(180deg,#ef4444,#dc2626)',border:'1px solid #dc2626',boxShadow:'0 2px 6px rgba(239,68,68,0.3)'}} };
    if (s.status === 'canceled')   return { primary:{label:'Reactivate plan',     icon:'refresh-cw',  action:onUpgrade, style:bBtnPrimary} };
    if (s.status === 'enterprise') return { primary:{label:'Contact account exec',icon:'life-buoy',   action:onContact, style:bBtnDark} };
    return { primary:{label:'Manage in Stripe', icon:'external-link', action:onPortal, style:bBtnDark} };
  })();

  const planName = { free:'Free', pro:'Pro', enterprise:'Enterprise' }[s.plan] || s.plan;
  const showToggle = s.plan !== 'free' && s.plan !== 'enterprise' && s.status !== 'canceled' && s.status !== 'pastdue';

  return (
    <div style={{
      position:'relative',
      borderRadius:18,
      padding:'28px 32px',
      overflow:'hidden',
      background:'linear-gradient(135deg, #FFFFFF 0%, #F8FAFF 55%, #EEF4FF 100%)',
      border:'1px solid #E0E7FF',
      boxShadow:'0 2px 4px rgba(15,23,42,0.04), 0 18px 40px rgba(59,130,246,0.08)',
    }}>
      {/* ambient glow */}
      <div style={{position:'absolute',top:-120,right:-120,width:380,height:380,borderRadius:'50%',background:'radial-gradient(circle, rgba(0,240,255,0.16), transparent 65%)',pointerEvents:'none'}}/>
      <div style={{position:'absolute',bottom:-140,left:-80,width:340,height:340,borderRadius:'50%',background:'radial-gradient(circle, rgba(139,92,246,0.10), transparent 65%)',pointerEvents:'none'}}/>

      <div className="lit-billing-hero-grid" style={{position:'relative',display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:28,alignItems:'center'}}>
        {/* LEFT */}
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}}>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:10.5,fontWeight:700,color:'#2563EB',letterSpacing:'0.14em',textTransform:'uppercase'}}>Current subscription</div>
            <div style={{width:3,height:3,borderRadius:'50%',background:'#CBD5E1'}}/>
            <StatusPill status={s.status}/>
            {s.billingOwner && (
              <><div style={{width:3,height:3,borderRadius:'50%',background:'#CBD5E1'}}/>
              <span style={{fontFamily:'DM Sans,sans-serif',fontSize:11.5,color:'#64748b'}}>Owner: <span style={{fontWeight:600,color:'#334155'}}>{s.billingOwner}</span></span></>
            )}
          </div>

          <div style={{display:'flex',alignItems:'baseline',gap:12,marginBottom:6,flexWrap:'wrap'}}>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:40,fontWeight:700,color:'#0F172A',letterSpacing:'-0.03em',lineHeight:1}}>{planName}</div>
            {s.seats && <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:16,fontWeight:500,color:'#64748b'}}>· {s.seats.used}/{s.seats.total} seats</div>}
          </div>

          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13.5,color:'#475569',marginTop:8,lineHeight:1.55,maxWidth:520}}>
            {renderContextLine(s)}
          </div>

          <div style={{display:'flex',gap:10,marginTop:20,flexWrap:'wrap',alignItems:'center'}}>
            {ctaConfig.primary && (
              <button style={ctaConfig.primary.style} onClick={ctaConfig.primary.action}>
                <i data-lucide={ctaConfig.primary.icon} style={{width:14,height:14}}></i>
                {ctaConfig.primary.label}
              </button>
            )}
            {canManage && s.status !== 'free' && (
              <button style={bBtnGhost} onClick={onPortal}>
                <i data-lucide="external-link" style={{width:13,height:13}}></i> Manage billing in Stripe
              </button>
            )}
            {!canManage && (
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#64748b',display:'flex',alignItems:'center',gap:6}}>
                <i data-lucide="info" style={{width:13,height:13,color:'#94a3b8'}}></i>
                Contact a workspace admin to change billing.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — data strip */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {showToggle && (
            <CycleToggle cycle={cycle} setCycle={setCycle}/>
          )}
          <div style={{
            background:'rgba(255,255,255,0.75)',
            border:'1px solid #E2E8F0',
            borderRadius:14,
            padding:'16px 18px',
            backdropFilter:'blur(8px)',
            display:'grid', gridTemplateColumns:'1fr 1fr', gap:14,
            boxShadow:'0 1px 2px rgba(15,23,42,0.03)'
          }}>
            <HeroStat label="Amount" value={s.amount || '—'} sub={s.cycleLabel}/>
            <HeroStat label={s.status==='trial' ? 'Trial ends' : s.status==='canceled' ? 'Access until' : 'Next renewal'} value={s.renewalDate || '—'} sub={s.daysUntil}/>
            <HeroStat label="Billing cycle" value={cycle === 'annual' ? 'Annual' : 'Monthly'} sub={cycle === 'annual' ? 'Save 17%' : ''}/>
            <HeroStat label="Payment method" value={s.paymentMethod?.last4 ? `•••• ${s.paymentMethod.last4}` : 'Not on file'} sub={s.paymentMethod?.brand}/>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderContextLine(s) {
  switch (s.status) {
    case 'free': return "You're on the free plan. Upgrade to unlock Pulse, team seats, and unlimited Command Center.";
    case 'trial': return `Pro trial — full access for ${s.daysUntil || 'a few more days'}. Add a card to keep access after ${s.renewalDate}.`;
    case 'active': return `Your ${({pro:'Pro',enterprise:'Enterprise'})[s.plan]||s.plan} plan renews automatically. Stripe is the source of truth — changes sync within a minute.`;
    case 'pastdue': return `Your last payment failed. Access will be suspended in ${s.daysUntil||'48 hours'} unless a new card is added.`;
    case 'canceled': return `Subscription canceled. You keep Pro access until ${s.renewalDate}. Reactivate anytime to resume.`;
    case 'enterprise': return `Enterprise workspace billed by contract via ${s.billingContact||'your account executive'}. Reach out for seat, usage, or term changes.`;
    default: return '';
  }
}

function CycleToggle({ cycle, setCycle }) {
  return (
    <div style={{display:'inline-flex',alignSelf:'flex-end',background:'#FFFFFF',border:'1px solid #E2E8F0',borderRadius:999,padding:3,boxShadow:'0 1px 3px rgba(15,23,42,0.05)'}}>
      {[['monthly','Monthly',null],['annual','Annual','-17%']].map(([id,label,deal])=>(
        <button key={id} onClick={()=>setCycle(id)}
          style={{
            border:'none',
            background: cycle===id ? 'linear-gradient(180deg,#0F172A,#1e293b)' : 'transparent',
            color: cycle===id ? '#fff' : '#64748b',
            padding:'6px 14px',
            borderRadius:999,
            fontFamily:'Space Grotesk,sans-serif',
            fontSize:12,
            fontWeight:600,
            cursor:'pointer',
            display:'inline-flex',alignItems:'center',gap:6,
            boxShadow: cycle===id ? '0 1px 4px rgba(15,23,42,0.25)' : 'none',
            transition:'all 160ms',
          }}>
          {label}
          {deal && cycle!==id && <span style={{background:'#ECFDF5',color:'#047857',fontSize:9.5,fontWeight:700,padding:'1px 5px',borderRadius:999,letterSpacing:'0.03em'}}>{deal}</span>}
        </button>
      ))}
    </div>
  );
}

function HeroStat({ label, value, sub }) {
  return (
    <div>
      <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:9.5,fontWeight:700,color:'#94a3b8',letterSpacing:'0.1em',textTransform:'uppercase'}}>{label}</div>
      <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:17,fontWeight:700,color:'#0F172A',marginTop:3,letterSpacing:'-0.01em'}}>{value}</div>
      {sub && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#64748b',marginTop:1}}>{sub}</div>}
    </div>
  );
}

/* ══ State banners / alerts ══════════════════════ */
function BillingAlerts({ state, onUpgrade, onPortal, onContact, canManage }) {
  const alerts = [];
  const s = state;
  if (s.status === 'trial') {
    alerts.push({
      tone:'cyan', icon:'sparkles',
      title:`Pro trial ending ${s.daysUntil ? 'in ' + s.daysUntil : 'soon'}`,
      body:`Add a payment method before ${s.renewalDate} to keep Pulse, Command Center, and unlimited Discover.`,
      cta: canManage ? { label:'Add payment', action:onUpgrade } : null,
    });
  }
  if (s.status === 'pastdue') {
    alerts.push({
      tone:'red', icon:'alert-triangle',
      title:`Payment failed on ${s.lastFailed || 'your last invoice'}`,
      body:'Stripe will retry in 3 days. Access suspends on April 28, 2026 if the card isn\u2019t updated.',
      cta: canManage ? { label:'Update card in Stripe', action:onPortal } : null,
    });
  }
  if (s.status === 'canceled') {
    alerts.push({
      tone:'amber', icon:'clock',
      title:'Subscription canceled',
      body:`You keep Pro access until ${s.renewalDate}. Reactivate anytime to keep your history, pipeline, and integrations.`,
      cta: canManage ? { label:'Reactivate plan', action:onUpgrade } : null,
    });
  }
  if (s.usageNearLimit) {
    alerts.push({
      tone:'amber', icon:'gauge',
      title:`${s.usageNearLimit.label} at ${s.usageNearLimit.pct}% of plan limit`,
      body:'Upgrade to Pro for higher limits, or wait for the usage window to reset.',
      cta: canManage ? { label:'See plans', action:onUpgrade } : null,
    });
  }
  if (s.status === 'enterprise') {
    alerts.push({
      tone:'violet', icon:'building-2',
      title:'Enterprise plan managed by contract',
      body:`Seat changes, renewals, and invoices are handled by ${s.billingContact||'your account executive'}. Self-serve controls below are read-only.`,
      cta: { label:'Contact account team', action:onContact },
    });
  }
  if (s.status === 'free' && !s.usageNearLimit) {
    alerts.push({
      tone:'blue', icon:'arrow-up-circle',
      title:'Upgrade available',
      body:'Pro unlocks Pulse queries, team seats, and unlimited Command Center adds — starting at $49/user/mo.',
      cta: canManage ? { label:'Compare plans', action:onUpgrade } : null,
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {alerts.map((a,i)=><AlertBanner key={i} {...a}/>)}
    </div>
  );
}

function AlertBanner({ tone, icon, title, body, cta }) {
  const map = {
    cyan:   { bg:'linear-gradient(90deg,#ECFEFF,#F0FDFF)', border:'#A5F3FC', icon:'#0891b2', iconBg:'#CFFAFE' },
    red:    { bg:'linear-gradient(90deg,#FEF2F2,#FFF5F5)', border:'#FECACA', icon:'#dc2626', iconBg:'#FEE2E2' },
    amber:  { bg:'linear-gradient(90deg,#FFFBEB,#FFFDF7)', border:'#FDE68A', icon:'#d97706', iconBg:'#FEF3C7' },
    blue:   { bg:'linear-gradient(90deg,#EFF6FF,#F5F9FF)', border:'#BFDBFE', icon:'#2563EB', iconBg:'#DBEAFE' },
    violet: { bg:'linear-gradient(90deg,#F5F3FF,#FAF8FF)', border:'#DDD6FE', icon:'#7c3aed', iconBg:'#EDE9FE' },
  };
  const s = map[tone] || map.blue;
  return (
    <div style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:12,padding:'14px 18px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
      <div style={{width:34,height:34,borderRadius:10,background:s.iconBg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <i data-lucide={icon} style={{width:16,height:16,color:s.icon}}></i>
      </div>
      <div style={{flex:1,minWidth:240}}>
        <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:13.5,fontWeight:700,color:'#0F172A'}}>{title}</div>
        <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#475569',marginTop:2,lineHeight:1.5}}>{body}</div>
      </div>
      {cta && (
        <button onClick={cta.action} style={{...bBtnGhost,border:`1px solid ${s.border}`,background:'rgba(255,255,255,0.9)',color:s.icon,padding:'7px 13px',fontSize:12.5}}>
          {cta.label} <i data-lucide="arrow-right" style={{width:12,height:12}}></i>
        </button>
      )}
    </div>
  );
}

Object.assign(window, { BillingHero, BillingAlerts });
