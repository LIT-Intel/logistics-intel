export const plan = (process.env.NEXT_PUBLIC_APP_PLAN || (import.meta as any)?.env?.VITE_APP_PLAN || 'Free');
export const canUse = {
  enrich: plan !== 'Free',
  recall: plan === 'Enterprise' || plan === 'Pro',
  campaigns: plan !== 'Free',
  saveCrm: plan !== 'Free'
};

