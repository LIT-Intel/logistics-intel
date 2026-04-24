// BillingPlans.jsx — Plan comparison cards + feature matrix
'use strict';

/* PLAN CONFIG — sourced from backend/Stripe in production; mocked for design */
const PLAN_CONFIG = {
  free: {
    id:'free',
    name:'Free',
    tag:'For individuals exploring LIT',
    priceMonthly: 0, priceAnnual: 0,
    featured: false,
    accent:'#94a3b8',
    includes:[
      ['Company searches', '100 / month'],
      ['Pulse queries',     '20 / month'],
      ['Saved companies',   '50'],
      ['Contact enrichment','—'],
      ['Team seats',        '1'],
      ['Campaign sends',    '—'],
      ['Exports / reports', '—'],
      ['API access',        '—'],
      ['Priority support',  '—'],
    ],
    ctaLabel:'Start free',
  },
  pro: {
    id:'pro',
    name:'Pro',
    tag:'For freight sales teams',
    priceMonthly: 49, priceAnnual: 490,
    annualEquivalent: 41,
    featured: true,
    accent:'#3b82f6',
    includes:[
      ['Company searches', 'Unlimited'],
      ['Pulse queries',     '2,000 / month'],
      ['Saved companies',   'Unlimited'],
      ['Contact enrichment','500 / seat / mo'],
      ['Team seats',        'Up to 10'],
      ['Campaign sends',    '10,000 / month'],
      ['Exports / reports', 'Unlimited'],
      ['Admin controls',    'Roles + permissions'],
      ['API access',        '—'],
      ['Affiliate program', 'Eligible'],
      ['Priority support',  'Email, 24h SLA'],
    ],
    ctaLabel:'Upgrade to Pro',
  },
  enterprise: {
    id:'enterprise',
    name:'Enterprise',
    tag:'Revenue-critical deployments',
    priceMonthly: null, priceAnnual: null,
    featured: false,
    accent:'#8b5cf6',
    includes:[
      ['Company searches', 'Unlimited'],
      ['Pulse queries',     'Custom allocation'],
      ['Saved companies',   'Unlimited'],
      ['Contact enrichment','Pooled, custom'],
      ['Team seats',        'Unlimited'],
      ['Campaign sends',    'Custom + dedicated IPs'],
      ['Exports / reports', 'Unlimited + SFTP'],
      ['Admin controls',    'SSO/SAML, SCIM, audit log'],
      ['API access',        'Full read/write + webhooks'],
      ['Affiliate program', 'Custom revenue share'],
      ['Priority support',  'Dedicated CSM, 1h SLA'],
    ],
    ctaLabel:'Contact sales',
  },
};

function BillingPlans({ currentPlan, cycle, canManage, onChoose, onContact }) {
  const plans = [PLAN_CONFIG.free, PLAN_CONFIG.pro, PLAN_CONFIG.enterprise];
  return (
    <div>
      <BSectionTitle
        overline="Plans"
        title="Compare plans"
        subtitle="Pricing syncs from Stripe. Plan changes prorate against the current period and take effect immediately."
      />
      <div className="lit-plan-grid" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
        {plans.map(p => (
          <PlanCard
            key={p.id}
            plan={p}
            cycle={cycle}
            current={currentPlan===p.id}
            canManage={canManage}
            onChoose={onChoose}
            onContact={onContact}
          />
        ))}
      </div>
    </div>
  );
}

function PlanCard({ plan, cycle, current, canManage, onChoose, onContact }) {
  const isEnt = plan.id === 'enterprise';
  const price = cycle==='annual' ? plan.annualEquivalent ?? plan.priceAnnual : plan.priceMonthly;
  const priceLabel = isEnt ? 'Custom' : (price===0 ? '$0' : `$${price}`);
  const periodLabel = isEnt ? 'Annual contract' : (price===0 ? 'forever' : (cycle==='annual' ? '/user/mo · billed annually' : '/user/mo'));

  const featured = plan.featured && !current;
  const borderColor = current
    ? plan.accent
    : featured
      ? '#BFDBFE'
      : '#E5E7EB';
  const bg = current
    ? 'linear-gradient(180deg,#F5F9FF,#FFFFFF)'
    : featured
      ? 'linear-gradient(180deg,#FFFFFF,#F8FAFF)'
      : '#FFFFFF';

  return (
    <div style={{
      position:'relative',
      border:`${current?2:1}px solid ${borderColor}`,
      borderRadius:16,
      padding:'22px 20px 20px',
      background:bg,
      boxShadow: current ? '0 8px 24px rgba(59,130,246,0.12)' : featured ? '0 4px 16px rgba(59,130,246,0.06)' : '0 1px 3px rgba(15,23,42,0.04)',
      display:'flex', flexDirection:'column', gap:16,
      transition:'all 200ms cubic-bezier(0.16,1,0.3,1)',
      minHeight:560,
    }}
    onMouseEnter={e=>{if(!current){e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 12px 28px rgba(15,23,42,0.08)';}}}
    onMouseLeave={e=>{if(!current){e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow=featured?'0 4px 16px rgba(59,130,246,0.06)':'0 1px 3px rgba(15,23,42,0.04)';}}}>

      {/* Featured ribbon */}
      {featured && (
        <div style={{position:'absolute',top:-11,left:20,background:'linear-gradient(90deg,#3b82f6,#06b6d4)',color:'#fff',fontFamily:'Space Grotesk,sans-serif',fontSize:10.5,fontWeight:700,padding:'4px 10px',borderRadius:999,letterSpacing:'0.08em',textTransform:'uppercase',boxShadow:'0 2px 8px rgba(59,130,246,0.3)'}}>
          Most popular
        </div>
      )}
      {current && (
        <div style={{position:'absolute',top:-11,right:20,background:'#0F172A',color:'#fff',fontFamily:'Space Grotesk,sans-serif',fontSize:10.5,fontWeight:700,padding:'4px 10px',borderRadius:999,letterSpacing:'0.08em',textTransform:'uppercase'}}>
          Current plan
        </div>
      )}

      {/* Heading */}
      <div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:plan.accent,boxShadow:`0 0 8px ${plan.accent}55`}}/>
          <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:16,fontWeight:700,color:'#0F172A',letterSpacing:'-0.01em'}}>{plan.name}</div>
        </div>
        <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#64748b',lineHeight:1.45}}>{plan.tag}</div>
      </div>

      {/* Price */}
      <div style={{paddingBottom:16,borderBottom:'1px solid #F1F5F9'}}>
        <div style={{display:'flex',alignItems:'baseline',gap:6}}>
          <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:40,fontWeight:700,color:'#0F172A',letterSpacing:'-0.03em',lineHeight:1}}>{priceLabel}</div>
          {!isEnt && price!==0 && cycle==='annual' && (
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontSize:15,color:'#94a3b8',textDecoration:'line-through'}}>${plan.priceMonthly}</div>
          )}
        </div>
        <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:4}}>{periodLabel}</div>
        {!isEnt && cycle==='annual' && price>0 && (
          <div style={{marginTop:6,display:'inline-flex',alignItems:'center',gap:5,fontFamily:'Space Grotesk,sans-serif',fontSize:10.5,fontWeight:700,color:'#047857',background:'#ECFDF5',border:'1px solid #A7F3D0',padding:'2px 7px',borderRadius:999}}>
            <i data-lucide="tag" style={{width:10,height:10}}></i> 17% off
          </div>
        )}
      </div>

      {/* Feature list */}
      <ul style={{listStyle:'none',margin:0,padding:0,display:'flex',flexDirection:'column',gap:9,flex:1}}>
        {plan.includes.map(([k,v], i) => (
          <li key={i} style={{display:'flex',alignItems:'flex-start',gap:8,fontFamily:'DM Sans,sans-serif',fontSize:12.5,lineHeight:1.4}}>
            <i data-lucide={v==='—' ? 'minus' : 'check'} style={{width:13,height:13,color: v==='—' ? '#CBD5E1' : plan.accent,marginTop:3,flexShrink:0}}></i>
            <div style={{flex:1,display:'flex',justifyContent:'space-between',gap:8}}>
              <span style={{color: v==='—' ? '#94a3b8' : '#334155'}}>{k}</span>
              <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:600,color: v==='—' ? '#CBD5E1' : '#0F172A',textAlign:'right'}}>{v}</span>
            </div>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div>
        {current ? (
          <button disabled style={{...bBtnGhost,width:'100%',justifyContent:'center',opacity:0.65,cursor:'default',padding:'11px 14px'}}>
            <i data-lucide="check-circle" style={{width:13,height:13}}></i> You're on {plan.name}
          </button>
        ) : isEnt ? (
          <button onClick={onContact} disabled={!canManage}
            style={{...bBtnDark,width:'100%',justifyContent:'center',padding:'11px 14px',opacity:canManage?1:0.5,cursor:canManage?'pointer':'not-allowed'}}>
            <i data-lucide="calendar" style={{width:13,height:13}}></i> {plan.ctaLabel}
          </button>
        ) : (
          <button onClick={()=>onChoose(plan.id)} disabled={!canManage}
            style={{...(plan.featured?bBtnPrimary:bBtnGhost),width:'100%',justifyContent:'center',padding:'11px 14px',opacity:canManage?1:0.5,cursor:canManage?'pointer':'not-allowed'}}>
            <i data-lucide={plan.priceMonthly===0?'circle':'arrow-up-circle'} style={{width:13,height:13}}></i>
            {plan.ctaLabel}
          </button>
        )}
        {!canManage && (
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#94a3b8',marginTop:8,textAlign:'center'}}>Contact your workspace admin</div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { BillingPlans, PLAN_CONFIG });
