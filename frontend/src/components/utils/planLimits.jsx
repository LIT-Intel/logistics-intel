const plans = {
  free: {
    name: "Free",
    price: '$0',
    max_companies: 50,
    max_emails: 0,
    max_rfps: 0,
    features: {
      company_details: false, // Cannot see enriched details
      campaigns: false,
      rfp_generation: false,
    },
  },
  starter: {
    name: "Starter",
    price: '$79',
    max_companies: 500,
    max_emails: 0,
    max_rfps: 0,
    features: {
      company_details: true, // Can see enriched details
      campaigns: false,
      rfp_generation: false,
    },
  },
  growth: {
    name: "Sales Professional",
    price: '$150',
    max_companies: Infinity,
    max_emails: 1000,
    max_rfps: 50,
    features: {
      company_details: true,
      campaigns: true,
      rfp_generation: true,
    },
  },
  growth_plus: {
    name: "Professional (Team)",
    price: '$299',
    max_companies: Infinity,
    max_emails: 5000,
    max_rfps: 200,
    features: {
      company_details: true,
      campaigns: true,
      rfp_generation: true,
    },
  },
  enterprise_10: {
    name: "Enterprise (10 Users)",
    price: '$750',
    max_companies: Infinity,
    max_emails: Infinity,
    max_rfps: Infinity,
    features: {
      company_details: true,
      campaigns: true,
      rfp_generation: true,
    },
  },
  enterprise_25: {
    name: "Enterprise (25 Users)",
    price: '$1200',
    max_companies: Infinity,
    max_emails: Infinity,
    max_rfps: Infinity,
    features: {
      company_details: true,
      campaigns: true,
      rfp_generation: true,
    },
  },
  enterprise_unlimited: {
    name: "Enterprise (Unlimited)",
    price: '$2500',
    max_companies: Infinity,
    max_emails: Infinity,
    max_rfps: Infinity,
    features: {
      company_details: true,
      campaigns: true,
      rfp_generation: true,
    },
  }
};

export function getPlanLimits(planName = 'free') {
  return plans[planName] || plans.free;
}

export function checkFeatureAccess(user, feature) {
  if (!user) return false;
  const plan = getPlanLimits(user.plan);
  return plan.features[feature] === true;
}

export function checkUsageLimit(user, type) {
    if (!user) return false;
    const plan = getPlanLimits(user.plan);

    switch(type) {
        case 'companies':
            return (user.monthly_companies_viewed || 0) < plan.max_companies;
        case 'emails':
            return (user.monthly_emails_sent || 0) < plan.max_emails;
        case 'rfps':
            return (user.monthly_rfps_generated || 0) < plan.max_rfps;
        default:
            return true;
    }
}