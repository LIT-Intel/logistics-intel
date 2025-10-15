import React from 'react';
import { litUI } from '@/lib/uiTokens';

export default function CardPanel({ title, children }) {
  return (
    <div className={litUI.card}>
      <div className="px-6 pt-5">
        <h3 className='text-[color:var(--lit-primary,#23135b)] font-semibold text-lg'>{title}</h3>
      </div>
      <div className="p-6 pt-4">{children}</div>
    </div>
  );
}
