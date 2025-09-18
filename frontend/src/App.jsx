import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
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
const Transactions   = lazy(() => import("@/pages/Transactions"));
const Widgets        = lazy(() => import("@/pages/Widgets"));

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) {
    const next = encodeURIComponent(location.pathname + (location.search || ""));
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

function AuthRedirectGate() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  const publicPaths = ["/", "/login", "/signin", "/auth/callback"]; 
  if (user && publicPaths.includes(location.pathname)) {
    return <Navigate to="/app/dashboard" replace />;
  }
  return <Outlet />;
}

function PostAuthBounce() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const next = params.get("next");
  if (!loading) {
    if (user) return <Navigate to={next || "/app/dashboard"} replace />;
    return <Navigate to="/login" replace />;
  }
  return null;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;            // keep it simple: no flicker
  if (!user) return <Navigate to="/login?next=/app/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        {/* Public (auth redirect gate) */}
        <Route element={<AuthRedirectGate />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<CustomLoginPage onClose={() => {}} />} />
          <Route path="/signin" element={<CustomLoginPage onClose={() => {}} />} />
          <Route path="/auth/callback" element={<PostAuthBounce />} />
          <Route path="/search" element={<Search />} />
          <Route path="/company/:id" element={<CompanyDetailModal isOpen={true} onClose={() => window.history.back()} />} />
          <Route path="/demo" element={<SearchPanel />} />
        </Route>

        {/* Private (protect + app layout) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/app/dashboard" element={<Dashboard />} />
            <Route path="/app/search" element={<Search />} />
            <Route path="/app/companies" element={<Companies />} />
            <Route path="/app/transactions" element={<Transactions />} />
            <Route path="/app/widgets" element={<Widgets />} />
            <Route path="/app/campaigns" element={<Campaigns />} />
            <Route path="/app/email" element={<EmailCenter />} />
            <Route path="/app/rfp" element={<RFPStudio />} />
            <Route path="/app/settings" element={<Settings />} />
            <Route path="/app/billing" element={<Billing />} />
            <Route path="/app/affiliate" element={<AffiliateDash />} />
            <Route path="/app/admin" element={<AdminDashboard />} />
            <Route path="/app/prospecting" element={<LeadProspecting />} />
            <Route path="/app/cms" element={<CMSManager />} />
            <Route path="/app/diagnostic" element={<Diagnostic />} />
            <Route path="/app/agent" element={<AdminAgent />} />
            <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
