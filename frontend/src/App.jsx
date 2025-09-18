import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/pages/Layout";
import CustomLoginPage from "@/components/layout/CustomLoginPage";
import { useAuth } from "@/auth/AuthProvider";

// Lazy-load primary pages
const Landing        = lazy(() => import("@/pages/Landing"));
const Dashboard      = lazy(() => import("@/pages/Dashboard"));
const Search         = lazy(() => import("@/pages/Search"));
const CompanyDetailModal = lazy(() => import("@/components/search/CompanyDetailModal"));
const Companies      = lazy(() => import("@/pages/Companies"));
const Campaigns      = lazy(() => import("@/pages/Campaigns"));
const EmailCenter    = lazy(() => import("@/pages/EmailCenter"));
const RFPStudio      = lazy(() => import("@/pages/RFPStudio"));
const Settings       = lazy(() => import("@/pages/Settings"));
const Billing        = lazy(() => import("@/pages/Billing"));
const AffiliateDash  = lazy(() => import("@/pages/AffiliateDashboard"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const LeadProspecting= lazy(() => import("@/pages/LeadProspecting"));
const CMSManager     = lazy(() => import("@/pages/CMSManager"));
const Diagnostic     = lazy(() => import("@/pages/Diagnostic"));
const AdminAgent     = lazy(() => import("@/pages/AdminAgent"));
const SearchPanel    = lazy(() => import("@/pages/SearchPanel"));
const Signup         = lazy(() => import("@/pages/signup/Signup"));
const Transactions   = lazy(() => import("@/pages/Transactions"));
const Widgets        = lazy(() => import("@/pages/Widgets"));
const Company        = lazy(() => import("@/pages/Company"));

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;            // keep it simple: no flicker
  if (!user) return <Navigate to="/login?next=/app/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>}>
      {/* Marketing / public */}
      <Routes>
        <Route
          path="/"
          element={
            <Layout currentPageName="Landing">
              <Landing />
            </Layout>
          }
        />
        {/* Public Search routes (Base44 UI on GCP) */}
        {/* Remove public search to avoid opening outside shell */}
        <Route
          path="/company/:id"
          element={
            <Layout currentPageName="Company">
              {/* Drawer-style page if navigated directly */}
              <CompanyDetailModal isOpen={true} onClose={() => window.history.back()} />
            </Layout>
          }
        />
        {/* Public demo page */}
        <Route
          path="/demo"
          element={
            <Layout currentPageName="Demo"><SearchPanel /></Layout>
          }
        />
        <Route path="/login" element={<CustomLoginPage onClose={() => {}} />} />
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
          path="/app/companies"
          element={
            <RequireAuth>
              <Layout currentPageName="Companies"><Companies /></Layout>
            </RequireAuth>
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
          path="/app/transactions"
          element={
            <RequireAuth>
              <Layout currentPageName="Transactions"><Transactions /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/widgets"
          element={
            <RequireAuth>
              <Layout currentPageName="Widgets"><Widgets /></Layout>
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
