import Layout from "./Layout.jsx";
import Landing from "./Landing";
import Dashboard from "./Dashboard";
import Companies from "./Companies";
import Company from "./Company";
import CommandCenterPage from "./command-center";
import CommandCenterCompany from "./command-center/[companyId].tsx";
import AdminDashboard from "./AdminDashboard";
import Search from "./Search";
import RFPStudio from "./RFPStudio";
import Campaigns from "./Campaigns";
import EmailCenter from "./EmailCenter";
import AffiliateDashboard from "./AffiliateDashboard";
import Billing from "./Billing";
import Settings from "./Settings";
import Pricing from "./Pricing";
import Diagnostic from "./Diagnostic";
import CMSManager from "./CMSManager";
import LeadProspecting from "./LeadProspecting";
import AdminAgent from "./AdminAgent";
import Platform from "./Platform";
import Solutions from "./Solutions";
import About from "./About";
import Resources from "./Resources";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';  // Auth context provider
import ProtectedRoute from './auth/ProtectedRoute';  // Protecting routes
import AuthRedirectGate from './auth/AuthRedirectGate'; // Gate for public routes
import PostAuthBounce from './auth/PostAuthBounce';  // Handling external auth redirect
import Signup from './signup/Signup';

const PAGES = {
    Landing,
    Dashboard,
    Companies,
    AdminDashboard,
    Search,
    RFPStudio,
    Campaigns,
    EmailCenter,
    AffiliateDashboard,
    Billing,
    Settings,
    Pricing,
    Diagnostic,
    CMSManager,
    LeadProspecting,
    AdminAgent,
    Platform,
    Solutions,
    About,
    Resources,
};

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>
                {/* Public Routes that redirect if user is authenticated */}
                <Route path="/" element={<AuthRedirectGate><Landing /></AuthRedirectGate>} />
                <Route path="/Landing" element={<AuthRedirectGate><Landing /></AuthRedirectGate>} />
                <Route path="/login" element={<AuthRedirectGate><Landing /></AuthRedirectGate>} />
                <Route path="/signin" element={<AuthRedirectGate><Landing /></AuthRedirectGate>} />
                <Route path="/signup" element={<AuthRedirectGate><Signup /></AuthRedirectGate>} />
                
                {/* Authenticated Routes - ProtectedRoute ensures authentication */}
                <Route path="/app/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/app/companies" element={<ProtectedRoute><Companies /></ProtectedRoute>} />
                <Route path="/app/companies/:id" element={<ProtectedRoute><Company /></ProtectedRoute>} />
                <Route path="/command-center" element={<ProtectedRoute><CommandCenterPage /></ProtectedRoute>} />
                <Route path="/app/command-center" element={<ProtectedRoute><CommandCenterPage /></ProtectedRoute>} />
                <Route path="/app/command-center/:companyId" element={<ProtectedRoute><CommandCenterCompany /></ProtectedRoute>} />
                <Route path="/app/admin-dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
                <Route path="/app/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
                <Route path="/app/rfp-studio" element={<ProtectedRoute><RFPStudio /></ProtectedRoute>} />
                <Route path="/app/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
                <Route path="/app/email-center" element={<ProtectedRoute><EmailCenter /></ProtectedRoute>} />
                <Route path="/app/affiliate-dashboard" element={<ProtectedRoute><AffiliateDashboard /></ProtectedRoute>} />
                <Route path="/app/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
                <Route path="/app/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/app/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
                <Route path="/app/diagnostic" element={<ProtectedRoute><Diagnostic /></ProtectedRoute>} />
                <Route path="/app/cms-manager" element={<ProtectedRoute><CMSManager /></ProtectedRoute>} />
                <Route path="/app/lead-prospecting" element={<ProtectedRoute><LeadProspecting /></ProtectedRoute>} />
                <Route path="/app/admin-agent" element={<ProtectedRoute><AdminAgent /></ProtectedRoute>} />
                <Route path="/app/platform" element={<ProtectedRoute><Platform /></ProtectedRoute>} />
                <Route path="/app/solutions" element={<ProtectedRoute><Solutions /></ProtectedRoute>} />
                <Route path="/app/about" element={<ProtectedRoute><About /></ProtectedRoute>} />
                <Route path="/app/resources" element={<ProtectedRoute><Resources /></ProtectedRoute>} />

                {/* Callback route for Post-login redirect handling */}
                <Route path="/auth/callback" element={<PostAuthBounce />} />
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <AuthProvider>
                <PagesContent />
            </AuthProvider>
        </Router>
    );
}
