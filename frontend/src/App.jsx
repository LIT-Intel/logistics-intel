import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import Layout from "@/pages/Layout";
import ModernLoginPage from "@/components/layout/ModernLoginPage";
import { useAuth } from "@/auth/AuthProvider";

// Lazy-load primary pages
const Landing        = lazy(() => import("@/pages/LandingPage"));
const Dashboard      = lazy(() => import("@/pages/Dashboard"));
const Search         = lazy(() => import("@/pages/Search"));
const SearchTrends   = lazy(() => import("@/pages/search/Trends"));
const CompanyDetailModal = lazy(() => import("@/components/search/CompanyDetailModal"));
const Companies      = lazy(() => import("@/pages/companies/index"));
const Campaigns      = lazy(() => import("@/pages/Campaigns"));
const CampaignBuilder= lazy(() => import("@/pages/CampaignBuilder"));
const EmailCenter    = lazy(() => import("@/pages/EmailCenter"));
const RFPStudio      = lazy(() => import("@/pages/RFPStudio"));
const Settings       = lazy(() => import("@/pages/SettingsPage"));
const Billing        = lazy(() => import("@/pages/BillingNew"));
const AffiliateDash  = lazy(() => import("@/pages/AffiliateDashboard"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminSettings  = lazy(() => import("@/pages/AdminSettings"));
const LeadProspecting= lazy(() => import("@/pages/LeadProspecting"));
const CMSManager     = lazy(() => import("@/pages/CMSManager"));
const Diagnostic     = lazy(() => import("@/pages/Diagnostic"));
const AdminAgent     = lazy(() => import("@/pages/AdminAgent"));
const SearchPanel    = lazy(() => import("@/pages/SearchPanel"));
const Signup         = lazy(() => import("@/pages/signup/Signup"));
const Transactions   = lazy(() => import("@/pages/Transactions"));
const Widgets        = lazy(() => import("@/pages/Widgets"));
const Company        = lazy(() => import("@/pages/Company"));
const CommandCenterPage = lazy(() => import("@/components/command-center/CommandCenter"));
const PreCallBriefing= lazy(() => import("@/pages/PreCallBriefing"));
const DemoCompany    = lazy(() => import("@/pages/demo/company"));
const CompaniesIndex = lazy(() => import("@/pages/companies/index"));

const DEMO_MODE = !import.meta.env.VITE_FIREBASE_API_KEY;

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (DEMO_MODE) return children;      // allow viewing protected pages in demo builds
  if (loading) return null;            // keep it simple: no flicker
  if (!user) return <Navigate to="/login?next=/app/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>}>
      {/* Marketing / public */}
      <Routes>
          <Route path="/" element={<Navigate to="/search" replace />} />
        {/* Public Company route → use full Company page for consistency */}
        <Route
          path="/company/:id"
          element={
            <Layout currentPageName="Company"><Company /></Layout>
          }
        />
        {/* Public demo page */}
        <Route
          path="/demo"
          element={
            <Layout currentPageName="Demo"><SearchPanel /></Layout>
          }
        />
        {/* Public Search route → render new Search page */}
        <Route
          path="/search"
          element={
            <Layout currentPageName="Search"><Search /></Layout>
          }
        />
        <Route
          path="/settings"
          element={
            <Layout currentPageName="Settings"><Settings /></Layout>
          }
        />
        <Route
          path="/search/trends"
          element={
            <Layout currentPageName="Search"><SearchTrends /></Layout>
          }
        />
        <Route
          path="/demo/company"
          element={
            <Layout currentPageName="Company Demo"><DemoCompany /></Layout>
          }
        />
        {/* Public companies (manual create demo) */}
        <Route
          path="/companies"
          element={
            <Layout currentPageName="Command Center"><CompaniesIndex /></Layout>
          }
        />
        <Route path="/login" element={<ModernLoginPage />} />
        {/* Alias: /app/login → login page */}
        <Route path="/app/login" element={<ModernLoginPage />} />
        {/* Alias: /request-demo → signup (temporary) */}
        <Route path="/request-demo" element={<Navigate to="/signup" replace />} />
        <Route path="/signup" element={<Layout currentPageName="Signup"><Signup /></Layout>} />
        {/* App (protected) */}
        <Route
          path="/app/dashboard"
          element={
            <RequireAuth>
              <Layout currentPageName="Dashboard"><Dashboard /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/search"
          element={
            <RequireAuth>
              <Layout currentPageName="Search"><Search /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/search/trends"
          element={
            <RequireAuth>
              <Layout currentPageName="Search"><SearchTrends /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/companies"
          element={
            <Layout currentPageName="Command Center"><Companies /></Layout>
          }
        />
        <Route
          path="/app/command-center"
          element={
            <Layout currentPageName="Command Center"><CommandCenterPage /></Layout>
          }
        />
        <Route
          path="/command-center"
          element={
            <Layout currentPageName="Command Center"><CommandCenterPage /></Layout>
          }
        />
        <Route
          path="/app/companies/:id"
          element={
            <RequireAuth>
              <Layout currentPageName="Company"><Company /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/campaigns"
          element={
            <RequireAuth>
              <Layout currentPageName="Campaigns"><Campaigns /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/campaigns/new"
          element={
            <RequireAuth>
              <Layout currentPageName="New Campaign"><CampaignBuilder /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/email"
          element={
            <RequireAuth>
              <Layout currentPageName="EmailCenter"><EmailCenter /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/rfp"
          element={
            <RequireAuth>
              <Layout currentPageName="RFPStudio"><RFPStudio /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/settings"
          element={
            <RequireAuth>
              <Layout currentPageName="Settings"><Settings /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/admin/settings"
          element={
            <RequireAuth>
              <Layout currentPageName="Admin Settings"><AdminSettings /></Layout>
            </RequireAuth>
          }
        />
        {/* Transactions removed */}
        <Route
          path="/app/widgets"
          element={
            <RequireAuth>
              <Layout currentPageName="Widgets"><Widgets /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/pre-call"
          element={
            <RequireAuth>
              <Layout currentPageName="Pre-Call Briefing"><PreCallBriefing /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/billing"
          element={
            <RequireAuth>
              <Layout currentPageName="Billing"><Billing /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/affiliate"
          element={
            <RequireAuth>
              <Layout currentPageName="AffiliateDashboard"><AffiliateDash /></Layout>
            </RequireAuth>
          }
        />

        {/* Admin */}
        <Route
          path="/app/admin"
          element={
            <RequireAuth>
              <Layout currentPageName="AdminDashboard"><AdminDashboard /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/prospecting"
          element={
            <RequireAuth>
              <Layout currentPageName="LeadProspecting"><LeadProspecting /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/cms"
          element={
            <RequireAuth>
              <Layout currentPageName="CMSManager"><CMSManager /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/diagnostic"
          element={
            <RequireAuth>
              <Layout currentPageName="Diagnostic"><Diagnostic /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/agent"
          element={
            <RequireAuth>
              <Layout currentPageName="AdminAgent"><AdminAgent /></Layout>
            </RequireAuth>
          }
        />


        {/* Fallbacks */}
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
