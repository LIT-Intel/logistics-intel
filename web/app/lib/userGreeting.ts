export function computeGreeting(now=new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late night grind';
}

/** Returns greeting with last-login context. If no backend value is provided, uses localStorage fallback. */
export function getWelcomeMessage(userName: string, lastLoginIso?: string | null): string {
  let last = lastLoginIso ?? (typeof window !== 'undefined' ? localStorage.getItem('lit:lastLogin') : null);
  const base = computeGreeting();
  const name = userName?.trim() ? `, ${userName}` : '';
  if (!last) return `${base}${name}!`;
  const lastDate = new Date(last);
  const days = Math.floor((Date.now() - lastDate.getTime())/86400000);
  const ago = days <= 0 ? 'earlier today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `${base}${name}! You were last here ${ago}.`;
}

/** Call this on successful login/dashboard mount to persist a new lastLogin fallback. */
export function markJustLoggedIn(date = new Date()) {
  try { if (typeof window !== 'undefined') localStorage.setItem('lit:lastLogin', date.toISOString()); } catch {}
}
