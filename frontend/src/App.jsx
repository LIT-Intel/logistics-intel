import React, { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import Layout from "@/pages/Layout";
import AppLayout from "@/layout/lit/AppLayout.jsx";
import ModernLoginPage from "@/components/layout/ModernLoginPage";
import ModernSignupPage from "@/components/layout/ModernSignupPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import { useAuth } from "@/auth/AuthProvider";
import AcceptInvitePage from "@/pages/AcceptInvitePage";

const Landing = lazy(() => import("@/pages/LandingPage"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const LITDashboard = lazy(() => import("./components/dashboard/LITDashboard.jsx"));
const Search = lazy(() => import("@/pages/Search"));
const SearchTrends = lazy(() => import("@/pages/search/Trends"));
const CompanyDetailModal = lazy(() => import("@/components/search/CompanyDetailModal"));
const Companies = lazy(() => import("@/pages/companies/index"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const CampaignBuilder = lazy(() => import("@/pages/CampaignBuilder"));
const EmailCenter = lazy(() => import("@/pages/EmailCenter"));
const RFPStudio = lazy(() => import("@/pages/RFPStudio"));
const Settings = lazy(() => import("@/pages/SettingsPage"));
const Billing = lazy(() => import("@/pages/BillingNew"));
const AffiliateDash = lazy(() => import("@/pages/AffiliateDashboard"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminSettings = lazy(() => import("@/pages/AdminSettings"));
const LeadProspecting = lazy(() => import("@/pages/LeadProspecting"));
const CMSManager = lazy(() => import("@/pages/CMSManager"));
const Diagnostic = lazy(() => import("@/pages/Diagnostic"));
const AdminAgent = lazy(() => import("@/pages/AdminAgent"));
const SearchPanel = lazy(() => import("@/pages/SearchPanel"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Widgets = lazy(() => import("@/pages/Widgets"));
const Company = lazy(() => import("@/pages/Company"));
const CommandCenterPage = lazy(() => import("@/components/command-center/CommandCenter"));
const PreCallBriefing = lazy(() => import("@/pages/PreCallBriefing"));
const DemoCompany = lazy(() => import("@/pages/demo/company"));
const CompaniesIndex = lazy(() => import("@/pages/companies/index"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));

const DEMO_MODE = !import.meta.env.VITE_SUPABASE_URL;

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (DEMO_MODE) return children;
  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/app/dashboard" replace />;
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
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />

        <Route
          path="/app/dashboard"
          element={
            <RequireAuth>
              <LITDashboard />
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
            <LITPage>
              <Companies />
            </LITPage>
          }
        />

        <Route
          path="/app/command-center"
          element={
            <LITPage>
              <CommandCenterPage />
            </LITPage>
          }
        />

        <Route
          path="/command-center"
          element={
            <LITPage>
              <CommandCenterPage />
            </LITPage>
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

        <Route
          path="/app/campaigns"
          element={
            <RequireAuth>
              <LITPage>
                <Campaigns />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/campaigns/new"
          element={
            <RequireAuth>
              <LITPage>
                <CampaignBuilder />
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
            <RequireAuth>
              <LITPage>
                <RFPStudio />
              </LITPage>
            </RequireAuth>
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
            <RequireSuperAdmin>
              <LITPage>
                <AdminSettings />
              </LITPage>
            </RequireSuperAdmin>
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

        <Route
          path="/app/admin"
          element={
            <RequireSuperAdmin>
              <LITPage>
                <AdminDashboard />
              </LITPage>
            </RequireSuperAdmin>
          }
        />

        <Route
          path="/app/prospecting"
          element={
            <RequireAuth>
              <LITPage>
                <LeadProspecting />
              </LITPage>
            </RequireAuth>
          }
        />

        <Route
          path="/app/cms"
          element={
            <RequireSuperAdmin>
              <LITPage>
                <CMSManager />
              </LITPage>
            </RequireSuperAdmin>
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
            <RequireSuperAdmin>
              <LITPage>
                <AdminAgent />
              </LITPage>
            </RequireSuperAdmin>
          }
        />

        <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
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
