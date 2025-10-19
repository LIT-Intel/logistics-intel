import React, { useEffect } from 'react';
import { getWelcomeMessage, markJustLoggedIn } from '@/app/lib/userGreeting';

export default function WelcomeBanner({ userName, lastLoginIso }: { userName: string; lastLoginIso?: string | null; }) {
  useEffect(()=>{ markJustLoggedIn(); },[]);
  const text = getWelcomeMessage(userName, lastLoginIso);
  return (
    <div className="mb-4 rounded-xl bg-white border p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500" />
      <div>
        <p className="font-semibold leading-tight">{text}</p>
        <p className="text-xs text-gray-500">Here are your latest insights and activity.</p>
      </div>
    </div>
  );
}
