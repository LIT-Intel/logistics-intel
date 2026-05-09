// LockoutBanner — renders at the top of AppShell when the user's
// subscription is in a lockout state (trial expired, payment failed,
// cancelled, etc.). Non-dismissible gating banner. Stays until status
// returns to 'trialing' or 'active'.
//
// Lockout statuses: expired | incomplete | unpaid | past_due |
//   cancelled | canceled | paused  (defined in serverEntitlements.ts)

import React from 'react';
import { Link } from 'react-router-dom';
import { isSubscriptionLockedOut } from '@/lib/serverEntitlements';

interface LockoutBannerProps {
  subscriptionStatus: string | null | undefined;
  /** Override the billing path when the app uses a different route. */
  billingPath?: string;
}

export function LockoutBanner({
  subscriptionStatus,
  billingPath = '/app/billing',
}: LockoutBannerProps) {
  if (!isSubscriptionLockedOut(subscriptionStatus)) return null;

  return (
    <div
      role="alert"
      style={{
        backgroundColor: '#0F172A',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '10px 16px',
        fontSize: '14px',
        fontWeight: 500,
        lineHeight: 1.5,
        width: '100%',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ color: '#CBD5E1' }}>
        Your trial has ended. Reactivate or upgrade to keep using LIT.
      </span>
      <Link
        to={billingPath}
        style={{
          display: 'inline-block',
          backgroundColor: '#2563EB',
          color: '#FFFFFF',
          textDecoration: 'none',
          padding: '6px 16px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
          borderBottom: '2px solid #1E40AF',
          flexShrink: 0,
        }}
      >
        Choose your plan
      </Link>
    </div>
  );
}

export default LockoutBanner;
