import React, { lazy, Suspense, useEffect } from "react";
import { captureRefFromUrl } from "@/lib/affiliateRef";
import { Routes, Route, Navigate, useParams, useLocation, Link } from "react-router-dom";
import Layout from "@/pages/Layout";
import AppLayout from "@/layout/lit/AppLayout.jsx";
import ModernLoginPage from "@/components/layout/ModernLoginPage";
import ModernSignupPage from "@/components/layout/ModernSignupPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import { useAuth } from "@/auth/AuthProvider";
import AcceptInvitePage from "@/pages/AcceptInvitePage";
import { UpgradeGate } from "@/components/common/UpgradeGate";
import { canAccessFeature, normalizePlan } from "@/lib/planLimits";

const Landing = lazy(() => import("@/pages/LandingPage"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const LITDashboard = lazy(() => import("./components/dashboard/LITDashboard.jsx"));
const ContactsPage = lazy(() => import("@/pages/Contacts"));
const Search = lazy(() => import("@/pages/Search"));
// Day-5 PRD pivot — unified Intelligence Explorer page wraps the new
// ExplorerShell with both Company Search + Pulse Explorer tabs. Mounted
// at /app/search (which used to mount Search.tsx directly).
const IntelligenceExplorer = lazy(() => import("@/pages/IntelligenceExplorer"));
const SearchTrends = lazy(() => import("@/pages/search/Trends"));
const CompanyDetailModal = lazy(() => import("@/components/search/CompanyDetailModal"));
const Companies = lazy(() => import("@/pages/companies/index"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const CampaignBuilder = lazy(() => import("@/pages/CampaignBuilder"));
const CampaignAnalyticsPage = lazy(() => import("@/pages/CampaignAnalyticsPage"));
const InboxPage = lazy(() => import("@/pages/InboxPage"));
const NotificationsInbox = lazy(() => import("@/pages/NotificationsInbox"));
const EmailCenter = lazy(() => import("@/pages/EmailCenter"));
// RFPStudio discontinued 2026-06 — see docs/agents/2026-06-02-app-review-roadmap.md.
// Route below redirects /app/rfp → /app/dashboard so old bookmarks land softly.
const QuotingDashboard = lazy(() => import("@/features/quoting/QuotingDashboard"));
const QuoteBuilder = lazy(() => import("@/features/quoting/QuoteBuilder"));
const QuoteSettings = lazy(() => import("@/features/quoting/QuoteSettings"));
const Settings = lazy(() => import("@/pages/SettingsPage"));
const Billing = lazy(() => import("@/pages/BillingNew"));
const AffiliateDash = lazy(() => import("@/pages/AffiliateDashboard"));
const AffiliateOnboarding = lazy(() => import("@/pages/AffiliateOnboarding"));
const PartnersApply = lazy(() => import("@/pages/PartnersApply"));
const AdminPartnerProgram = lazy(() => import("@/pages/AdminPartnerProgram"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboardV2"));
const AdminSettings = lazy(() => import("@/pages/AdminSettings"));
const AdminDemoRequests = lazy(() => import("@/pages/AdminDemoRequests"));
const DemoInvites = lazy(() => import("@/pages/DemoInvites"));
const AdminCommandDeck = lazy(() => import("@/pages/AdminCommandDeck"));
const AdminSubscribers = lazy(() => import("@/pages/AdminSubscribers"));
const AdminFmcsaImport = lazy(() => import("@/pages/AdminFmcsaImport"));
const AdminMarketingAnalytics = lazy(() => import("@/pages/AdminMarketingAnalytics"));
const AdminMarketingBroadcasts = lazy(() => import("@/pages/AdminMarketingBroadcasts"));
const Pulse = lazy(() => import("@/pages/Pulse"));
const Lists = lazy(() => import("@/pages/Lists"));
const CMSManager = lazy(() => import("@/pages/CMSManager"));
const Diagnostic = lazy(() => import("@/pages/Diagnostic"));
const AdminAgent = lazy(() => import("@/pages/AdminAgent"));
const SearchPanel = lazy(() => import("@/pages/SearchPanel"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Widgets = lazy(() => import("@/pages/Widgets"));
const CompanyProfileV2 = lazy(() => import("@/pages/CompanyProfileV2"));
const SupplierProfile = lazy(() => import("@/pages/SupplierProfile"));
const CommandCenterPage = lazy(() => import("@/components/command-center/CommandCenter"));
const PreCallBriefing = lazy(() => import("@/pages/PreCallBriefing"));
const DemoCompany = lazy(() => import("@/pages/demo/company"));
const CompaniesIndex = lazy(() => import("@/pages/companies/index"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const SectorLandingPage = lazy(() => import("@/pages/landing/SectorLandingPage"));
const DEMO_MODE = !import.meta.env.VITE_SUPABASE_URL;

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (DEMO_MODE) return children;
  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/app/search" replace />;
  // The 6-step onboarding wizard was removed 2026-08-06: the
  // `on_new_user_org_bootstrap` + `handle_new_user_profile` DB triggers
  // already provision profile, workspace, and free_trial subscription at
  // signup, so authenticated users go straight into the app.
  return children;
}

// Per-member page access (2026-08-11). Org owners/admins restrict which
// pages a member seat can use via Settings → Workspace; this guard reads
// the resolved map from AuthProvider. Owners/admins/superadmins always
// pass. Renders an explanatory card instead of redirecting so a member
// with several disabled pages can't redirect-loop.
function RequirePage({ page, children }) {
  const { user, loading, canViewPage } = useAuth();
  if (DEMO_MODE) return children;
  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/app/search" replace />;
  if (typeof canViewPage === "function" && !canViewPage(page)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="font-display text-[17px] font-bold text-slate-900">
            This page isn't enabled for your seat
          </h2>
          <p className="font-body mt-2 text-[13.5px] leading-relaxed text-slate-600">
            Your workspace owner controls which pages each member can use.
            Ask them to enable it under Settings → Workspace.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

// Return bar for admin detail pages — every page opened from the Admin
// Command Deck gets a persistent way back (Phase 3 follow-up).
function AdminSubpage({ children }) {
  return (
    <>
      <div className="border-b border-slate-200 bg-white/90 px-4 py-2 md:px-6">
        <Link
          to="/app/admin"
          className="font-display inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 hover:underline"
        >
          &larr; Back to Admin Control Panel
        </Link>
      </div>
      {children}
    </>
  );
}

function RequireAdmin({ children }) {
  const { user, loading, canAccessAdmin } = useAuth();
  if (DEMO_MODE) return children;
  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/app/search" replace />;
  if (!canAccessAdmin) return <Navigate to="/app/search" replace />;
  return children;
}

function RequireSuperAdmin({ children }) {
  const { user, loading, isSuperAdmin } = useAuth();
  if (DEMO_MODE) return children;
  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/app/search" replace />;
  if (!isSuperAdmin) return <Navigate to="/app/search" replace />;
  return children;
}

function RequirePlan({ feature, featureName, description, requiredPlan = "growth", children }) {
  const { user, loading, plan: userPlan } = useAuth();
  if (DEMO_MODE) return children;
  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/app/search" replace />;
  const plan = normalizePlan(userPlan);
  const hasAccess = canAccessFeature(plan, feature);
  // Always render the underlying page through UpgradeGate — when the
  // user lacks access the gate blurs the page behind the Pulse Coach
  // upgrade card so they see the feature they're being asked to pay
  // for. Replaces the old behavior that returned a stark white gate
  // page with no preview.
  return (
    <UpgradeGate
      featureName={featureName}
      description={description}
      requiredPlan={requiredPlan}
      currentPlan={plan}
      hasAccess={hasAccess}
    >
      {children}
    </UpgradeGate>
  );
}

function LITPage({ children }) {
  useEffect(() => {
    document.title = "Logistics Intel";

    let favicon = document.querySelector("link[rel='icon']");
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.setAttribute("rel", "icon");
      document.head.appendChild(favicon);
    }

    favicon.setAttribute("type", "image/svg+xml");
    favicon.setAttribute("href", "/favicon-lit.svg");
  }, []);

  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  // Affiliate ref capture: run on every mount + every URL change so any
  // entry into the app via ?ref=<code> (marketing landing, signup link,
  // OAuth bounce-back) stashes the code in localStorage + cookie for the
  // 90-day attribution window. The AuthProvider hook later reads this
  // and POSTs to claim-affiliate-referral once the user authenticates.
  useEffect(() => {
    captureRefFromUrl();
    const onUrlChange = () => captureRefFromUrl();
    window.addEventListener("popstate", onUrlChange);
    return () => window.removeEventListener("popstate", onUrlChange);
  }, []);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          Loading…
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Navigate to="/app/search" replace />} />

        {/* /company/:id was the legacy public route. Redirect to the
            canonical CDP profile so any external links keep working. */}
        <Route
          path="/company/:id"
          element={<LegacyCompanyRedirect />}
        />

        <Route
          path="/demo"
          element={
            <Layout currentPageName="Demo">
              <SearchPanel />
            </Layout>
          }
        />

        <Route
          path="/demo/company"
          element={
            <Layout currentPageName="Company Demo">
              <DemoCompany />
            </Layout>
          }
        />

        <Route
          path="/companies"
          element={
            <Layout currentPageName="Command Center">
              <CompaniesIndex />
            </Layout>
          }
        />

        <Route path="/login" element={<ModernLoginPage />} />
        <Route path="/app/login" element={<ModernLoginPage />} />
        <Route path="/signup" element={<ModernSignupPage />} />
        <Route path="/request-demo" element={<Navigate to="/signup" replace />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/invite" element={<Navigate to="/accept-invite" replace />} />

        {/* The 6-step onboarding wizard was removed 2026-08-06. Keep the
            route as a redirect so old confirmation-email links and
            bookmarks land in the app instead of 404ing. */}
        <Route path="/onboarding" element={<Navigate to="/app/search" replace />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/l/:sector" element={<SectorLandingPage />} />

        {/* /admin/marketing retired — LIT marketing now ships through
            /app/campaigns with provider=resend gated server-side to the
            super-admin allowlist. The standalone admin console lived in
            frontend/src/pages/admin/LitMarketingAdmin.tsx; deleted in
            this commit. */}

        <Route
          path="/app/dashboard"
          element={
            <RequireAuth>
              <RequirePage page="dashboard">
                <LITDashboard />
              </RequirePage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/contacts"
          element={
            <RequireAuth>
              <ContactsPage />
            </RequireAuth>
          }
        />

        {/* Day-5 PRD pivot: /app/search now hosts the unified
            Intelligence Explorer with two tabs (Company Search +
            Pulse Explorer). The legacy Search.tsx page is no longer
            mounted directly — its behaviour is preserved inside the
            Company Search tab via the same searchShippers /
            saveCompanyToCommandCenter / getIyCompanyProfile calls.
            Trial users still reach Company Search; the Pulse tab
            additionally checks the pulse plan gate inside the shell. */}
        <Route
          path="/app/search"
          element={
            <RequireAuth>
              <RequirePage page="search">
                <LITPage>
                  <IntelligenceExplorer />
                </LITPage>
              </RequirePage>
            </RequireAuth>
          }
        />

        {/* Legacy alias — preserves any bookmarks / inbound links to
            the old Search page. Same component mount as /app/search. */}
        <Route
          path="/app/intelligence-explorer"
          element={
            <RequireAuth>
              <LITPage>
                <IntelligenceExplorer />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/search/trends"
          element={
            <RequireAuth>
              <LITPage>
                <SearchTrends />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/companies"
          element={
            <RequireAuth>
              <LITPage>
                <Companies />
              </LITPage>
            </RequireAuth>
          }
        />

        {/* Demo invitations — internal LIT team tool (Phase 2 sales funnel).
            RequireAuth only: RLS returns zero rows and the send edge fn
            rejects non-internal users, so the page self-gates. */}
        <Route
          path="/app/demo-invites"
          element={
            <RequireAuth>
              <LITPage>
                <AdminSubpage>
                  <DemoInvites />
                </AdminSubpage>
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/command-center"
          element={
            <RequireAuth>
              <RequirePage page="command_center">
                <LITPage>
                  <CommandCenterPage />
                </LITPage>
              </RequirePage>
            </RequireAuth>
          }
        />

        <Route
          path="/command-center"
          element={
            <RequireAuth>
              <LITPage>
                <CommandCenterPage />
              </LITPage>
            </RequireAuth>
          }
        />

        {/* Phase 1 alias — /preview stays alive so any bookmarks or QA
            scripts targeting it keep working. Same component as canonical. */}
        <Route
          path="/app/companies/:id/preview"
          element={
            <RequireAuth>
              <LITPage>
                <CompanyProfileV2 />
              </LITPage>
            </RequireAuth>
          }
        />

        {/* Canonical company profile — Phase 4 retired the legacy
            Company.jsx page. CompanyProfileV2 is now the only view. */}
        <Route
          path="/app/companies/:id"
          element={
            <RequireAuth>
              <LITPage>
                <CompanyProfileV2 />
              </LITPage>
            </RequireAuth>
          }
        />

        {/* Supplier Profile (T1c) — `/app/suppliers/:slug` inverts the
            CompanyProfileV2 lens. Reads location.state from the supplier
            drawer for instant rendering; bookmark/refresh shows the
            no-state empty state. Backend aggregator for cross-receiver
            data is a planned follow-up. */}
        <Route
          path="/app/suppliers/:slug"
          element={
            <RequireAuth>
              <LITPage>
                <SupplierProfile />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/campaigns"
          element={
            <RequirePage page="campaigns">
            <RequirePlan
              feature="campaign_builder"
              featureName="Campaign Builder"
              description="Build and run outreach campaigns targeting freight shippers and logistics prospects. Available on Growth and above."
              requiredPlan="growth"
            >
              <LITPage>
                <Campaigns />
              </LITPage>
            </RequirePlan>
            </RequirePage>
          }
        />

        <Route
          path="/app/campaigns/new"
          element={
            <RequirePlan
              feature="campaign_builder"
              featureName="Campaign Builder"
              description="Build and run outreach campaigns targeting freight shippers and logistics prospects. Available on Growth and above."
              requiredPlan="growth"
            >
              <LITPage>
                <CampaignBuilder />
              </LITPage>
            </RequirePlan>
          }
        />

        <Route
          path="/app/campaigns/analytics"
          element={
            <RequirePlan
              feature="campaign_builder"
              featureName="Campaign Builder"
              description="Build and run outreach campaigns targeting freight shippers and logistics prospects. Available on Growth and above."
              requiredPlan="growth"
            >
              <LITPage>
                <CampaignAnalyticsPage />
              </LITPage>
            </RequirePlan>
          }
        />

        <Route
          path="/app/inbox"
          element={
            <RequireAuth>
              <LITPage>
                <InboxPage />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/notifications"
          element={
            <RequireAuth>
              <LITPage>
                <NotificationsInbox />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/lists"
          element={
            <RequireAuth>
              <LITPage>
                <Lists />
              </LITPage>
            </RequireAuth>
          }
        />
        <Route
          path="/app/lists/:listId"
          element={
            <RequireAuth>
              <LITPage>
                <Lists />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/email"
          element={
            <RequireAuth>
              <LITPage>
                <EmailCenter />
              </LITPage>
            </RequireAuth>
          }
        />

        {/* Quoting — replaces the discontinued RFP Studio. */}
        <Route
          path="/app/quoting"
          element={
            <RequireAuth>
              <RequirePage page="quoting">
                <LITPage>
                  <QuotingDashboard />
                </LITPage>
              </RequirePage>
            </RequireAuth>
          }
        />
        <Route
          path="/app/quoting/new"
          element={
            <RequireAuth>
              <LITPage>
                <QuoteBuilder />
              </LITPage>
            </RequireAuth>
          }
        />
        <Route
          path="/app/quoting/settings"
          element={
            <RequireAuth>
              <LITPage>
                <QuoteSettings />
              </LITPage>
            </RequireAuth>
          }
        />
        <Route
          path="/app/quoting/:quoteId"
          element={
            <RequireAuth>
              <LITPage>
                <QuoteBuilder />
              </LITPage>
            </RequireAuth>
          }
        />

        {/* RFP Studio discontinued — soft redirect for stale bookmarks now
            lands on the Quoting workspace that replaced it. */}
        <Route path="/app/rfp" element={<Navigate to="/app/quoting" replace />} />
        <Route path="/app/rfp/*" element={<Navigate to="/app/quoting" replace />} />
        <Route path="/app/rfp-studio" element={<Navigate to="/app/quoting" replace />} />

        <Route
          path="/app/settings"
          element={
            <RequireAuth>
              <LITPage>
                <Settings />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/admin/settings"
          element={
            <RequireAdmin>
              <LITPage>
                <AdminSubpage>
                  <AdminSettings />
                </AdminSubpage>
              </LITPage>
            </RequireAdmin>
          }
        />

        <Route
          path="/app/widgets"
          element={
            <RequireAuth>
              <LITPage>
                <Widgets />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/pre-call"
          element={
            <RequireAuth>
              <LITPage>
                <PreCallBriefing />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/billing"
          element={
            <RequireAuth>
              <RequirePage page="billing">
                <LITPage>
                  <Billing />
                </LITPage>
              </RequirePage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/affiliate"
          element={
            <RequireAuth>
              <LITPage>
                <AffiliateDash />
              </LITPage>
            </RequireAuth>
          }
        />

        {/* Public partner program landing / apply page. */}
        <Route path="/partners/apply" element={<PartnersApply />} />
        <Route path="/partners" element={<Navigate to="/partners/apply" replace />} />
        <Route path="/affiliate/apply" element={<Navigate to="/partners/apply" replace />} />

        {/* Public partner onboarding (validates invite token, allows
            inline sign-up / sign-in, then claims). */}
        <Route path="/affiliate/onboarding" element={<AffiliateOnboarding />} />

        {/* Back-compat: old invite emails point at /app/affiliate/invite.
            Forward them (preserving ?token=) to the new public flow. */}
        <Route path="/app/affiliate/invite" element={<AffiliateInviteRedirect />} />

        {/* Admin Command Deck (Phase 3) — the consolidated control panel.
            The previous dashboard stays reachable at /app/admin/legacy
            during the transition. */}
        <Route
          path="/app/admin"
          element={
            <RequireAdmin>
              <LITPage>
                <AdminCommandDeck />
              </LITPage>
            </RequireAdmin>
          }
        />

        <Route
          path="/app/admin/legacy"
          element={
            <RequireAdmin>
              <LITPage>
                <AdminSubpage>
                  <AdminDashboard />
                </AdminSubpage>
              </LITPage>
            </RequireAdmin>
          }
        />

        <Route
          path="/app/admin/partner-program"
          element={
            <RequireSuperAdmin>
              <LITPage>
                <AdminSubpage>
                  <AdminPartnerProgram />
                </AdminSubpage>
              </LITPage>
            </RequireSuperAdmin>
          }
        />

        <Route
          path="/app/admin/demo-requests"
          element={
            <RequireAdmin>
              <LITPage>
                <AdminSubpage>
                  <AdminDemoRequests />
                </AdminSubpage>
              </LITPage>
            </RequireAdmin>
          }
        />

        <Route
          path="/app/admin/subscribers"
          element={
            <RequireAdmin>
              <LITPage>
                <AdminSubpage>
                  <AdminSubscribers />
                </AdminSubpage>
              </LITPage>
            </RequireAdmin>
          }
        />

        <Route
          path="/app/admin/fmcsa-import"
          element={
            <RequireAdmin>
              <LITPage>
                <AdminSubpage>
                  <AdminFmcsaImport />
                </AdminSubpage>
              </LITPage>
            </RequireAdmin>
          }
        />

        <Route
          path="/app/admin/marketing-analytics"
          element={
            <RequireSuperAdmin>
              <LITPage>
                <AdminSubpage>
                  <AdminMarketingAnalytics />
                </AdminSubpage>
              </LITPage>
            </RequireSuperAdmin>
          }
        />

        <Route
          path="/app/admin/marketing-broadcasts"
          element={
            <RequireSuperAdmin>
              <LITPage>
                <AdminSubpage>
                  <AdminMarketingBroadcasts />
                </AdminSubpage>
              </LITPage>
            </RequireSuperAdmin>
          }
        />

        {/* /app/prospecting now redirects to the unified Explorer's
            Pulse tab. Existing bookmarks + Coach deep-links keep working.
            Plan gating moves into ExplorerShell when the Pulse tab opens
            (handled inside PulseExploreTab via useEntitlements + the
            same RequirePlan upgrade modal). */}
        <Route
          path="/app/prospecting"
          element={<Navigate to="/app/search?tab=pulse" replace />}
        />

        <Route
          path="/app/cms"
          element={
            <RequireAdmin>
              <LITPage>
                <CMSManager />
              </LITPage>
            </RequireAdmin>
          }
        />

        <Route
          path="/app/diagnostic"
          element={
            <RequireAuth>
              <LITPage>
                <Diagnostic />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/agent"
          element={
            <RequireAdmin>
              <LITPage>
                <AdminAgent />
              </LITPage>
            </RequireAdmin>
          }
        />

        <Route path="/app" element={<Navigate to="/app/search" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function AffiliateInviteRedirect() {
  const location = useLocation();
  const search = location.search || "";
  return <Navigate to={`/affiliate/onboarding${search}`} replace />;
}

function CompanyDrawerRoute() {
  const { id } = useParams();
  const company = id ? { id } : null;

  return (
    <Layout currentPageName="Company">
      <CompanyDetailModal
        isOpen={true}
        company={company}
        user={null}
        onSave={() => {}}
        onClose={() => window.history.back()}
      />
    </Layout>
  );
}

// Redirect /company/:id (legacy public route) to /app/companies/:id (the
// canonical CDP profile). Preserves any query string the caller passed.
function LegacyCompanyRedirect() {
  const { id } = useParams();
  const location = useLocation();
  const target = `/app/companies/${encodeURIComponent(id ?? "")}${location.search || ""}`;
  return <Navigate to={target} replace />;
}
