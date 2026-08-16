-- Phase 8 — Referral loop (in-app "invite a freight pro" reward-on-activation).
--
-- REUSE, not fork: this rides the EXISTING affiliate ref-capture/claim path.
--   * The /?ref=<code> capture (frontend/src/lib/affiliateRef.ts) and the
--     claim edge fn (claim-affiliate-referral) already stash + claim a code.
--     We add a SECOND kind of ref_code owner: a plain member (not an
--     affiliate partner). claim-affiliate-referral is extended to fall back to
--     lit_user_referrals when no affiliate_partners row matches, writing the
--     attribution into lit_referral_rewards.status='pending'.
--   * ref_code uniqueness spans BOTH namespaces so the same /?ref= lookup is
--     unambiguous (a code is either a partner's or a member's, never both).

-- ── 1. Per-user member referral code ─────────────────────────────────────────
-- Every logged-in user can mint ONE lightweight referral code. This is the
-- "member" equivalent of affiliate_partners.ref_code — same /?ref=<code>
-- capture, but rewards are PRODUCT CREDITS (recorded), not cash commission.
CREATE TABLE IF NOT EXISTS public.lit_user_referrals (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ref_code    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lit_user_referrals_ref_code_key UNIQUE (ref_code),
  CONSTRAINT lit_user_referrals_ref_code_fmt CHECK (ref_code ~ '^[A-Za-z0-9_-]{4,32}$')
);

COMMENT ON TABLE public.lit_user_referrals IS
  'Phase 8 referral loop: per-user member referral code. Reuses the /?ref=<code> capture + claim-affiliate-referral fallback path. Reward is product credits (recorded in lit_referral_rewards), NOT the cash affiliate commission.';

-- ── 2. Reward tracking (one row per referred user, idempotent) ────────────────
-- status flow:  pending  → (referred user reaches activation) → activated
--               activated → (credits issued)                   → rewarded
CREATE TABLE IF NOT EXISTS public.lit_referral_rewards (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ref_code          text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','activated','rewarded','void')),
  credits           integer NOT NULL DEFAULT 0,
  activated_at      timestamptz,
  rewarded_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- One reward per referred user across the whole system (idempotency anchor).
  CONSTRAINT lit_referral_rewards_referred_uniq UNIQUE (referred_user_id),
  -- No self-referral at the data layer as a backstop to the fn-level guard.
  CONSTRAINT lit_referral_rewards_no_self CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS lit_referral_rewards_referrer_idx
  ON public.lit_referral_rewards (referrer_user_id);
CREATE INDEX IF NOT EXISTS lit_referral_rewards_status_idx
  ON public.lit_referral_rewards (status);

COMMENT ON TABLE public.lit_referral_rewards IS
  'Phase 8 referral loop: reward ledger, one row per referred user. Referrer earns intelligence credits when the referred user reaches activation (first_search_at/first_save_at). Idempotent via unique(referred_user_id).';

-- ── 3. Event log ─────────────────────────────────────────────────────────────
-- referral_link_created / clicked / signup / activated / reward_issued.
-- Kept as a dedicated table (not lit_activity_events, whose event_type is
-- product-scoped) so the admin summary can aggregate the loop cleanly.
CREATE TABLE IF NOT EXISTS public.lit_referral_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        text NOT NULL
                      CHECK (event_type IN (
                        'referral_link_created','clicked','signup','activated','reward_issued'
                      )),
  ref_code          text,
  referrer_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lit_referral_events_type_idx
  ON public.lit_referral_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS lit_referral_events_referrer_idx
  ON public.lit_referral_events (referrer_user_id);

COMMENT ON TABLE public.lit_referral_events IS
  'Phase 8 referral loop funnel events. reward_issued is emitted by process_referral_rewards(); clicked/signup by the claim path; referral_link_created when a member mints a code.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.lit_user_referrals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lit_referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lit_referral_events  ENABLE ROW LEVEL SECURITY;

-- A user can read their own referral code row (writes go through an RPC below).
DROP POLICY IF EXISTS lit_user_referrals_self_read ON public.lit_user_referrals;
CREATE POLICY lit_user_referrals_self_read ON public.lit_user_referrals
  FOR SELECT USING (user_id = auth.uid());

-- A referrer can read the rewards they've earned (the referred side stays hidden).
DROP POLICY IF EXISTS lit_referral_rewards_referrer_read ON public.lit_referral_rewards;
CREATE POLICY lit_referral_rewards_referrer_read ON public.lit_referral_rewards
  FOR SELECT USING (referrer_user_id = auth.uid());

-- Events are admin/service only (no end-user policy → RLS denies by default).
-- Service role bypasses RLS; platform admins read via the SECURITY DEFINER
-- summary RPC.
