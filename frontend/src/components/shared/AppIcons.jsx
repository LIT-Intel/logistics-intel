import React from 'react';

export function Star(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={props.className}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.77 5.82 22 7 14.14 2 9.27l6.91-1.01z"/>
    </svg>
  );
}

export function Eye(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

export function Bell(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}>
      <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7"/>
      <path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  );
}

export function Lock(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

export function PulseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M2.75 12h4.9l2.25-4.3L12 16.25l2.2-4.25h4.85" />
      <path d="M19.05 12h1.15" />
      <circle cx="21.15" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LitAppIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className}>
      <path d="M4 4v16h7.8" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.35 4h9.65" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M10.35 10h4.2" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M15.85 10v9.9" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M10.35 19.9h5.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}
