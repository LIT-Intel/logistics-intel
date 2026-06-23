# LIT — Microsoft 365 Roadmap & Notes

**Status:** PAUSED. Microsoft app work does not start until **Intelligence Explorer** and **Suppliers** are stable. This doc tracks prep/setup and the known surface area so implementation can start cleanly once unpaused.

---

## ✅ Completed setup / prep work

### Teams private app shell (Microsoft Developer Portal) — done 2026-06-23
A private Teams app shell has been created in the Microsoft Developer Portal.

- **App name:** LIT / Logistics Intel
- **Manifest version:** Latest Stable v1.25
- **Feature:** Personal app
- **Personal tab name:** Intelligence Explorer
- **Content URL:** Vercel preview `/app/search`
- **Website URL:** https://logisticintel.com
- **Accent color:** `#00E5FF`
- **Icons:** color icon + transparent outline icon uploaded
- **Valid domains added:**
  - `logisticintel.com`
  - `www.logisticintel.com`
  - `vercel.app`
  - `logistics-intel-git-claude-explo-ec80bc-sparkfusion25s-projects.vercel.app`

> Note: the Content URL currently points at a Vercel **preview** branch alias. Before GA the tab must point at the production host (`app.logisticintel.com` / the production `/app/search`), and the valid-domains list should be tightened to the production domain(s) — wildcard `vercel.app` is fine for preview testing only.

---

## Already-built Microsoft surfaces (from the 2026-06-23 code audit)

These exist in the codebase already and are **verify/finish**, not greenfield:

1. **Microsoft SSO sign-in** — Supabase `azure` OAuth provider. "Sign in with Microsoft" on `ModernLoginPage` / `ModernSignupPage`. Publisher-domain verification files (`microsoft-identity-association.json`) present in 4 dirs (now consistent — both Azure app IDs `68b33b05-…` and `23a3f304-…`).
2. **Outlook / M365 outbound mailbox** — full Microsoft Graph OAuth + send + reply detection, mirroring the Gmail path:
   - `oauth-outlook-start` / `email-oauth-start` (generic), `oauth-outlook-callback`
   - `reply-receiver` `handleOutlookNotification()` + Graph subscription renewal cron
   - `send-campaign-email` `sendViaOutlook`
   - Tables: `lit_email_accounts` (provider='outlook'), `lit_oauth_tokens`, `lit_outreach_history`
   - **Fixed 2026-06-23:** token-exchange scope now includes `Mail.Read` (was breaking reply-detection on connect); `send-campaign-email` now stamps `provider_event_id` (was breaking reply correlation for Outlook AND Gmail).

**Not built yet:** Teams (beyond the Personal tab shell), Outlook Calendar, OneDrive/SharePoint. No MSAL.js — Microsoft auth is via Supabase's hosted `azure` provider.

---

## When unpaused — open items

**Config to confirm (owner action):**
- Azure app `68b33b05-…` delegated Graph perms include `Mail.Send`, `Mail.Read`, `User.Read`, `offline_access`.
- Supabase Edge secrets: `OUTLOOK_CLIENT_ID/SECRET/REDIRECT_URI/TENANT`, `OAUTH_STATE_SECRET`, `FRONTEND_URL`.
- Supabase Auth: Azure provider enabled (SSO), redirect `https://<ref>.supabase.co/auth/v1/callback` + allow-listed app callback.

**Teams Personal tab:**
- Point Content URL at the production `/app/search` (not the preview alias) before GA.
- The `/app/search` route must render correctly inside the Teams iframe (CSP `frame-ancestors` must allow `teams.microsoft.com` / `*.teams.microsoft.com`; verify the app doesn't bust out of the iframe or block third-party cookies needed for Supabase auth inside Teams).
- Teams SSO (optional, later): exchange the Teams AAD token for a Supabase session so the user isn't asked to log in again inside the tab.

**Live-QA (needs a real M365 account):** SSO sign-in, Outlook connect (consent must list "Read your mail"), send a campaign from Outlook, reply → confirm detection.

**Hardening (deferred):** encrypt `lit_oauth_tokens` at rest; strengthen `reply-receiver` Outlook auth beyond the `clientState` UUID echo.
