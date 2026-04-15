# LIT SCHEMA MAP

## Purpose
This file documents the real Supabase schema used by LIT.
It should help agents avoid building against nonexistent tables or stale assumptions.

---

## Status
This file must be updated after the first schema audit.
Use this version as the working template until the audit is complete.

---

## Core Access Model

### organizations
**Purpose:**  
Represents the customer account / workspace / tenant.

**Expected fields:**  
- id
- name
- owner_user_id
- stripe_customer_id
- active_subscription_id
- current_plan_code
- current_subscription_status
- credits_limit_monthly
- seats_limit
- created_at
- updated_at

**Used by:**  
- billing
- admin dashboard
- settings
- feature gating
- org-level reporting

---

### org_members
**Purpose:**  
Links users to organizations and defines workspace role.

**Expected fields:**  
- id
- org_id
- user_id
- email
- full_name
- role
- status
- joined_at
- invited_at
- created_at
- updated_at

**Valid roles:**  
- owner
- admin
- member
- viewer

**Used by:**  
- auth provider
- admin access logic
- org membership management
- settings access and roles

---

## Billing Layer

### subscriptions
**Purpose:**  
Normalized mirror of Stripe subscriptions.

**Expected fields:**  
- id
- org_id
- stripe_subscription_id
- stripe_customer_id
- stripe_price_id
- stripe_product_id
- plan_code
- status
- billing_interval
- current_period_start
- current_period_end
- cancel_at_period_end
- trial_end
- metadata
- created_at
- updated_at

**Used by:**  
- billing page
- entitlements
- admin dashboard
- webhook sync

---

### plan_entitlements
**Purpose:**  
Defines what each plan actually gets.

**Expected fields:**  
- id
- plan_code
- monthly_credits
- seats_limit
- max_saved_companies
- max_contacts
- can_use_pulse
- can_use_export
- can_use_campaigns
- can_use_enrichment
- can_use_rfp
- can_use_api
- custom_branding
- created_at
- updated_at

**Used by:**  
- route gating
- server-side feature checks
- admin dashboard
- billing display

---

## Usage / Margin Layer

### usage_events
**Purpose:**  
Tracks billable and usage-sensitive actions.

**Expected fields:**  
- id
- org_id
- user_id
- product_area
- action
- units
- cost_credits
- cost_usd_estimate
- source_provider
- metadata
- created_at

**Used by:**  
- feature gating
- admin usage monitoring
- cost tracking
- margin analysis

---

## Affiliate Layer

### affiliates
**Purpose:**  
Tracks affiliate/referral partners.

**Expected fields:**  
- id
- name
- email
- referral_code
- commission_type
- commission_rate
- status
- created_at
- updated_at

---

### affiliate_payouts
**Purpose:**  
Tracks affiliate earnings and payouts.

**Expected fields:**  
- id
- affiliate_id
- org_id
- subscription_id
- revenue_amount
- commission_amount
- status
- payout_date
- created_at

---

## Audit / Activity Layer

### audit_logs
**Purpose:**  
Tracks critical actions for debugging, compliance, and admin visibility.

**Expected fields:**  
- id
- actor_user_id
- org_id
- action
- entity_type
- entity_id
- metadata
- created_at

**Used by:**  
- admin dashboard
- troubleshooting
- financial and role-change visibility

---

## Optional / Legacy Tables

### platform_admins
**Status:**  
Not confirmed as present. Must not be assumed to exist unless schema audit confirms it.

**Rule:**  
If absent, app must not crash or hard-fail admin logic. Org owner/admin access must continue to work.

---

## Schema Audit Checklist

### Access
- [ ] Confirm live organizations table name
- [ ] Confirm live org_members structure
- [ ] Confirm role values
- [ ] Confirm membership status values

### Billing
- [ ] Confirm existing subscriptions table or equivalent
- [ ] Confirm Stripe-related fields already in use
- [ ] Confirm current plan storage location

### Usage
- [ ] Confirm whether usage_events exists
- [ ] Confirm whether credits are tracked already
- [ ] Confirm whether provider cost is logged

### Affiliates
- [ ] Confirm whether affiliate tables exist
- [ ] Confirm whether commission logic exists anywhere

### Audit
- [ ] Confirm whether audit_logs exists
- [ ] Confirm whether admin activity is recorded anywhere

---

## Rules
- Do not create duplicate tables before schema audit
- Do not assume naming without verification
- If a table exists under a different name, update this file and standardize references
- Every schema decision must list dependent files and impacted agents
