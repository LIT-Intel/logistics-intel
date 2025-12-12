import React, { useEffect, useMemo } from 'react';

function computeGreeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late night grind';
}

function getWelcomeMessage(userName, lastLoginIso) {
  let last = lastLoginIso;
  try {
    if (!last && typeof window !== 'undefined') {
      last = localStorage.getItem('lit:lastLogin');
    }
  } catch {
    /* ignore localStorage read failure */
  }
  const base = computeGreeting();
  const name = userName && String(userName).trim() ? `, ${userName}` : '';
  if (!last) return `${base}${name}!`;
  const lastDate = new Date(last);
  const days = Math.floor((Date.now() - lastDate.getTime())/86400000);
  const ago = days <= 0 ? 'earlier today' : (days === 1 ? 'yesterday' : `${days} days ago`);
  return `${base}${name}! You were last here ${ago}.`;
}

export default function WelcomeBanner({ userName = 'there', lastLoginIso = null }) {
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('lit:lastLogin', new Date().toISOString());
      }
    } catch {
      /* ignore localStorage write failure */
    }
  }, []);
  const text = useMemo(() => getWelcomeMessage(userName, lastLoginIso), [userName, lastLoginIso]);
  return (
    <div className="mb-4 rounded-xl bg-white border p-4 flex items-center gap-3">
      <div className="relative flex h-10 w-10 items-center justify-center">
        <img src="/logo.png" alt="Logistics Intel logo" className="h-10 w-10 rounded-md shadow-sm ring-1 ring-gray-200" loading="lazy" />
      </div>
      <div>
        <p className="font-semibold leading-tight">{text}</p>
        <p className="text-xs text-gray-500">Here are your latest insights and activity.</p>
      </div>
    </div>
  );
}
