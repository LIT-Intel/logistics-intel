# LIT — Microsoft 365 Roadmap & Notes

**Status (2026-06-23):** Explorer + Suppliers are stable, so Microsoft is unpaused for the **minimal "in-tab login" Teams Personal tab**. SSO + Outlook surfaces are code-complete (pending your live-QA). Deeper Teams SSO is deferred until you decide to invest the Azure config. This doc tracks prep, the shipped pieces, and the open items.

---

## 🧪 Teams Demo QA Checklist (current goal)

Live-test the **private Teams Personal tab** with the **in-tab email/password login** approach. Run in the Teams **desktop** app and/or Teams **web** (teams.microsoft.com). Open dev console to watch for errors: Teams web → browser F12; Teams desktop → `Ctrl+Shift+I`. Use a strong demo company (e.g. **Home Depot Usa**, **Kia Georgia**, **Adidas International Trade**, **Robert Bosch**, **Zara Usa**).

| # | Step | Expected | Watch for |
|---|---|---|---|
| 1 | App loads inside Teams | The LIT app renders in the tab (not blank / not an error page) | Blank tab or "refused to connect" = CSP/`frame-ancestors` or Content-URL issue |
| 2 | Intelligence Explorer loads | `/app/search` shows the **Company Search** + **Pulse Explorer** tabs | Wrong route / 404 |
| 3 | **Email/password login works in the tab** | Enter email + password → lands authenticated in the app | If it bounces back to login, the session didn't persist in the partitioned iframe storage |
| 4 | Company Search works | Search a company → results render | Empty/erroring results |
| 5 | Pulse Explorer works | Switch tab → NL search → map + results | No map / no results |
| 6 | Company Profile opens | Click a result → profile opens | Profile blank |
| 7 | Suppliers tab opens | The top-level **Suppliers** tab loads | Tab missing / errors |
| 8 | Supplier rows show **real 12M data** | shipments 12M, TEU 12M, share %, country, HS chapters, first/last dates — real values, missing fields show `—` | Any fabricated/placeholder numbers |
| 9 | Save to Command Center works | Save a company → confirmation; appears in saved list | Save errors |
| 10 | **No console / auth / CSP errors** | Console clean | `frame-ancestors` CSP violations, auth/session errors, third-party-storage blocked warnings |

### ⚠️ Expected limitation — document for the demo
Inside the Teams iframe, the **"Sign in with Google" and "Sign in with Microsoft" buttons are expected NOT to work**, and this is by design for now. OAuth providers send `X-Frame-Options: DENY` / `frame-ancestors` that forbid rendering inside an iframe, and the redirect breaks out of the Teams tab. **Use email/password inside Teams.** Social sign-in inside Teams becomes available only once **TeamsJS popup auth** (`microsoftTeams.authentication.authenticate`) or **full Teams SSO** is implemented — both deferred.

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

**Teams Personal tab — "in-tab login" approach chosen 2026-06-23 (ship-now, minimal):**
- ✅ App is iframe-ready: no `X-Frame-Options`, no frame-busting code, Supabase auth uses localStorage (works in the partitioned Teams iframe).
- ✅ `frame-ancestors` CSP added in `frontend/vercel.json` — explicitly allows Teams web + desktop / Office / M365 to embed the app (and restricts everyone else). Header-only; doesn't affect app behavior.
- ⏳ **Your action:** point the Teams app **Content URL at production** `/app/search` (not the preview alias) + tighten valid-domains to the production host before GA.
- ⏳ **Your action — live-test in Teams:** add the app → open the Intelligence Explorer tab → it should load → sign in **with email/password**.
- ⚠️ **Auth caveat (important for the demo):** inside the Teams iframe, **email/password sign-in works**, but the **"Sign in with Microsoft / Google" buttons will NOT** — OAuth providers refuse to render in an iframe and the redirect breaks out of the tab. So inside Teams, log in with email/password. (Removing this limitation = the deferred "Popup auth" or "Full Teams SSO" option.)
- Deferred (when you want zero-second-login): **Teams SSO** — install `@microsoft/teams-js`, exchange the Teams AAD token for a Supabase session, + Azure "Expose an API" / manifest `webApplicationInfo`. Scoped but not built (your Azure work first).

**Live-QA (needs a real M365 account):** SSO sign-in, Outlook connect (consent must list "Read your mail"), send a campaign from Outlook, reply → confirm detection.

**Hardening (deferred):** encrypt `lit_oauth_tokens` at rest; strengthen `reply-receiver` Outlook auth beyond the `clientState` UUID echo.
