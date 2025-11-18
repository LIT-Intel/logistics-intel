## Search Canonicalization Dedupe Report

Branch: `fix/vite-api-and-canonical-search`  
Generated: 2025-11-11

---

### Project Structure (frontend focus)

- `frontend/src/main.jsx` bootstraps the Vite React app with `BrowserRouter`, `AuthProvider`, and QueryClient. (Still forces `/search` on first load; may want to revisit once routing is fully stabilized.)
- `frontend/src/App.jsx` holds all React Router `<Routes>` for public (`/search`, `/company/:id`, etc.) and `RequireAuth`-wrapped `/app/*` routes. This is the only router registered with Vite today.
- `frontend/src/app/**` previously hosted a Next.js-style experiment. The only Search page there (`app/search/page.tsx`) has now been removed to prevent accidental bundle collisions.
- `frontend/src/pages/**` mixes:
  - React Router pages consumed by `App.jsx` (e.g. `Search.tsx`, `Campaigns.jsx`).
  - Legacy Next.js pages (`index.tsx`, `api/**`, `[company_id].tsx`) still exporting `GetServerSideProps` or API handlers.
- `frontend/src/components/**` includes shared UI plus entire legacy Search implementations (`components/search/**`) alongside updated command-center components.
- `frontend/functions/**` holds Firebase/Cloud Functions proxies (`searchCompanies`, `getCompanyShipments`) that rely on Google-authenticated Cloud Run calls.

Routing entry points therefore exist in **three** paradigms (Vite + React Router, legacy Next.js pages, experimental Next.js `app/` routes). Only the React Router tree is active in the deployed bundle.

---

### Search-Related Inventory

| Path | Role | Status / Notes |
| --- | --- | --- |
| `src/pages/Search.tsx` | **Active** Search route imported by `App.jsx`. Canonical UI now posts to `/api/lit/public/searchCompanies` and drives pagination without triggering redirects. | **Kept / canonical.** |
| `src/pages/search/Trends.tsx` | Secondary trends view; still routed from `App.jsx`. Reuses shared API helpers that now point at `/api/lit`. | Kept. |
| `src/pages/SearchPanel.jsx` | Diagnostic search panel (demo). Imported at `/demo`. Uses `postSearchCompanies` / `getFilterOptions`, both now routed through `/api/lit`. | Kept for tooling. |
| `src/components/search/**` | Mix of modern TSX (e.g. `CompanyModal.tsx`, `InlineFilters.tsx`) and legacy JSX (`SearchFilters.jsx`). Some `.tsx`/`.jsx` dupes side-by-side. Only a subset referenced by `Search.tsx`/Command Center. | Audit & purge unused exports. |
| `src/components/companies/**` | Older company cards and filters, predating `components/search`. Minimal usage; potential archive. |
| `src/lib/api.ts`, `src/lib/api.rfp.ts`, `src/lib/litApi.ts`, `components/command-center/AddCompanyModal.tsx`, `api/functions/getFilterOptions.ts` | Helper layers now resolved through `API_BASE = '/api/lit'` or `getGatewayBase()` (which resolves to `/api/lit` in-browser). | **Normalized.** |
| `src/pages/api/lit/[...path].ts` | Edge proxy forwarding to the gateway host. Now honours `TARGET_BASE_URL` / `API_GATEWAY_BASE` and emits a clear error if missing. | Kept. |

Import references that still pull legacy Search:
- `App.jsx` → `lazy(() => import("@/pages/Search"))`.
- `App.jsx` → `lazy(() => import("@/pages/search/Trends"))`.
- `App.jsx` → `lazy(() => import("@/pages/SearchPanel"))` (demo).

No other modules import `src/app/search/page.tsx`; it is effectively dead code today.

---

### Canonicalization / Deduping Actions

- Removed `src/app/search/page.tsx` (unused Next-style page) to avoid double-render edge cases.
- Deleted `src/pages/search/index.tsx` (duplicate Search implementation).
- Archived legacy Firebase function shims under `frontend/_archive/api/functions/**` and removed runtime re-exports.
- Archived the previous search UI fragments (`Pager.tsx`, `SearchResults.jsx`, `CompanyCardCompact.jsx`, `SearchFilters.jsx`, etc.) under `frontend/_archive/components/search/**` so only the canvas-driven components ship.
- Updated `src/pages/Search.tsx` to the canvas-spec UI (Shippers tab gate, inline error messaging, dedicated Search button, no duplicate filter placeholder) and wired all controls through `/api/lit/*`.
- Updated Vite proxy to read `API_GATEWAY_BASE` from `.env.local` and fail fast when missing.
- Pointed `src/lib/api.ts`, `src/lib/api.rfp.ts`, `src/lib/litApi.ts`, `src/components/command-center/AddCompanyModal.tsx`, and TS shims at `/api/lit/*`.

### Remaining Direct Gateway Usage

- Some detail components (`components/search/CompanyModal.tsx`, CRM helpers, etc.) still call `getGatewayBase()`. That helper now returns `/api/lit` in the browser, but keep an eye on server-side calls where `process.env.API_GATEWAY_BASE` may still be used intentionally.
- Firebase `frontend/functions/**` continues to call Cloud Run directly (expected—server side with auth).

---

### Flicker / Infinite Reload Hypotheses

1. **Multiple routing paradigms:** Vercel builds both `src/pages/**` (Next) and the Vite client bundle. Hitting `/search` may trigger a server redirect (from `pages/index.tsx` GSSP) followed by the Vite client redirect in `main.jsx`, causing repeated reloads when the served asset switches between Next and Vite outputs.
2. **`main.jsx` `window.location.replace` loop:** On every mount, `main.jsx` checks `pathname` and forces `/search`. When combined with React Router `<Navigate to="/search" />` and browser history replacements inside `Search.tsx`, an initial render can bounce between `replaceState` and full-page reloads if query parameters change mid-render.
3. **Legacy Search effects:** `src/pages/Search.tsx` mutates URL params on every keystroke (`useSearchParams` + `setSearchParams`), which under certain router configurations can trigger `BrowserRouter` to re-initialize, especially when the root component also forces navigation.
4. **Duplicate service endpoints:** Some components still rely on Firebase callable functions while others hit `/api/lit`. When both issue redirects or 401 responses, the UI may interpret the error as needing to reload, yielding flicker.
5. **Module duplication in bundle:** Shipping both the unused `app/search/page.tsx` and legacy `pages/search/index.tsx` introduces dead-but-executed effects (e.g., double `useEffect` hooks if accidentally imported), which complicates tree-shaking and can surface stale components if an import path is mis-resolved.

---

### Next Steps

1. Audit `components/search/**` and `components/companies/**` to delete or archive unused JSX duplicates; ensure all imports reference the canonical TSX variants.
2. Consider relaxing the forced `/search` redirect in `src/main.jsx` once manual smoke validates there is no longer a flicker loop.
3. Verify downstream consumers (Command Center, CRM modals) respect the `/api/lit` proxy and eliminate any residual hard-coded gateway URLs.
4. Run full smoke (npm dev + curls + manual Search interactions) prior to PR and capture outputs for reviewers.


