import React from "react";
export default function LogoIcon({ size=20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Logo">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15"/>
      <path d="M6 12h12M12 6v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
