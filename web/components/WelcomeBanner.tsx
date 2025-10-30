"use client";
import React, { useEffect } from 'react';
import Image from 'next/image';
import { getWelcomeMessage, markJustLoggedIn } from '@/app/lib/userGreeting';

export default function WelcomeBanner({ userName, lastLoginIso }: { userName: string; lastLoginIso?: string | null; }) {
  useEffect(()=>{ markJustLoggedIn(); },[]);
  const text = getWelcomeMessage(userName, lastLoginIso);
  return (
    <div className="mb-4 rounded-xl bg-white border p-4 flex items-center gap-3">
      <div className="relative flex h-10 w-10 items-center justify-center">
        <Image src="/logo.png" alt="Logistics Intel logo" width={40} height={40} className="h-10 w-10 rounded-md shadow-sm ring-1 ring-gray-200" />
      </div>
      <div>
        <p className="font-semibold leading-tight">{text}</p>
        <p className="text-xs text-gray-500">Here are your latest insights and activity.</p>
      </div>
    </div>
  );
}
