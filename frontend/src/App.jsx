import React, { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
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
const SearchTrends = lazy(() => import("@/pages/search/Trends"));
const CompanyDetailModal = lazy(() => import("@/components/search/CompanyDetailModal"));
const Companies = lazy(() => import("@/pages/companies/index"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const CampaignBuilder = lazy(() => import("@/pages/CampaignBuilder"));
const CampaignAnalyticsPage = lazy(() => import("@/pages/CampaignAnalyticsPage"));
const InboxPage = lazy(() => import("@/pages/InboxPage"));
const EmailCenter = lazy(() => import("@/pages/EmailCenter"));
const RFPStudio = lazy(() => import("@/pages/RFPStudio"));
const Settings = lazy(() => import("@/pages/SettingsPage"));
const Billing = lazy(() => import("@/pages/BillingNew"));
const AffiliateDash = lazy(() => import("@/pages/AffiliateDashboard"));
const AffiliateOnboarding = lazy(() => import("@/pages/AffiliateOnboarding"));
const PartnersApply = lazy(() => import("@/pages/PartnersApply"));
const AdminPartnerProgram = lazy(() => import("@/pages/AdminPartnerProgram"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminSettings = lazy(() => import("@/pages/AdminSettings"));
const Pulse = lazy(() => import("@/pages/Pulse"));
const CMSManager = lazy(() => import("@/pages/CMSManager"));
const Diagnostic = lazy(() => import("@/pages/Diagnostic"));
const AdminAgent = lazy(() => import("@/pages/AdminAgent"));
const SearchPanel = lazy(() => import("@/pages/SearchPanel"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Widgets = lazy(() => import("@/pages/Widgets"));
const Company = lazy(() => import("@/pages/Company"));
const CompanyProfileV2 = lazy(() => import("@/pages/CompanyProfileV2"));
const CommandCenterPage = lazy(() => import("@/components/command-center/CommandCenter"));
const PreCallBriefing = lazy(() => import("@/pages/PreCallBriefing"));
const DemoCompany = lazy(() => import("@/pages/demo/company"));
const CompaniesIndex = lazy(() => import("@/pages/companies/index"));
const OnboardingFlow = lazy(() => import("@/pages/OnboardingFlow"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const SectorLandingPage = lazy(() => import("@/pages/landing/SectorLandingPage"));
const LitMarketingAdmin = lazy(() => import("@/pages/admin/LitMarketingAdmin"));

const DEMO_MODE = !import.meta.env.VITE_SUPABASE_URL;

function RequireAuth({ children }) {
  const { user, loading, isSuperAdmin } = useAuth();
  const location = useLocation();
  if (DEMO_MODE) return children;
  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/app/dashboard" replace />;

  const meta = user?.user_metadata || {};
  // Primary: explicit flag written at signup / after onboarding
  // Secondary: account < 2 h old without an explicit true = treat as new signup
  const accountAgeHours = (Date.now() - new Date(user?.created_at || 0).getTime()) / 3_600_000;
  const onboardingDone =
    meta.onboarding_completed === true ||
    (meta.onboarding_completed !== false && accountAgeHours >= 2);

  if (!isSuperAdmin && !onboardingDone && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

function RequireAdmin({ children }) {
  const { user, loading, canAccessAdmin } = useAuth();
  if (DEMO_MODE) return children;
  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/app/dashboard" replace />;
  if (!canAccessAdmin) return <Navigate to="/app/dashboard" replace />;
  return children;
}

function RequireSuperAdmin({ children }) {
  const { user, loading, isSuperAdmin } = useAuth();
  if (DEMO_MODE) return children;
  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/app/dashboard" replace />;
  if (!isSuperAdmin) return <Navigate to="/app/dashboard" replace />;
  return children;
}

function RequirePlan({ feature, featureName, description, requiredPlan = "growth", children }) {
  const { user, loading, plan: userPlan } = useAuth();
  if (DEMO_MODE) return children;
  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/app/dashboard" replace />;
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
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          Loading…
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Navigate to="/app/dashboard" replace />} />

        <Route
          path="/company/:id"
          element={
            <Layout currentPageName="Company">
              <Company />
            </Layout>
          }
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

        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <OnboardingFlow />
            </RequireAuth>
          }
        />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/l/:sector" element={<SectorLandingPage />} />

        {/* Super-admin only — LIT marketing (Resend). Strictly separated
            from the user-campaign builder under /app/campaigns. */}
        <Route
          path="/admin/marketing/*"
          element={
            <RequireSuperAdmin>
              <LITPage>
                <LitMarketingAdmin />
              </LITPage>
            </RequireSuperAdmin>
          }
        />

        <Route
          path="/app/dashboard"
          element={
            <RequireAuth>
              <LITDashboard />
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

        <Route
          path="/app/search"
          element={
            <RequireAuth>
              <LITPage>
                <Search />
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

        <Route
          path="/app/command-center"
          element={
            <RequireAuth>
              <LITPage>
                <CommandCenterPage />
              </LITPage>
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

        <Route
          path="/app/companies/:id"
          element={
            <RequireAuth>
              <LITPage>
                <Company />
              </LITPage>
            </RequireAuth>
          }
        />

        {/* Phase 1 — additive preview route exercising the new
            companyResolver + company-profile aggregator + useCompanyProfile
            hook. The canonical /app/companies/:id route above is unchanged.
            Phase 2 evaluates promotion. */}
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

        <Route
          path="/app/campaigns"
          element={
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
          path="/app/email"
          element={
            <RequireAuth>
              <LITPage>
                <EmailCenter />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/rfp"
          element={
            <RequirePlan
              feature="rfp_studio"
              featureName="RFP Studio"
              description="Generate professional RFP responses and freight quotes with AI assistance. Available on Growth and above."
              requiredPlan="growth"
            >
              <LITPage>
                <RFPStudio />
              </LITPage>
            </RequirePlan>
          }
        />

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
                <AdminSettings />
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
              <LITPage>
                <Billing />
              </LITPage>
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

        <Route
          path="/app/admin"
          element={
            <RequireAdmin>
              <LITPage>
                <AdminDashboard />
              </LITPage>
            </RequireAdmin>
          }
        />

        <Route
          path="/app/admin/partner-program"
          element={
            <RequireSuperAdmin>
              <LITPage>
                <AdminPartnerProgram />
              </LITPage>
            </RequireSuperAdmin>
          }
        />

        <Route
          path="/app/prospecting"
          element={
            <RequirePlan
              feature="lead_prospecting"
              featureName="Pulse — Lead Prospecting"
              description="Discover and monitor shippers based on freight signals, import activity, and AI-driven scoring. Available on Growth and above."
              requiredPlan="growth"
            >
              <LITPage>
                <Pulse />
              </LITPage>
            </RequirePlan>
          }
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

        <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
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
