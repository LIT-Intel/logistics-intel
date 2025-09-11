import Layout from "./Layout.jsx";

import Landing from "./Landing";

import Dashboard from "./Dashboard";

import Companies from "./Companies";

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

const PAGES = {
    
    Landing: Landing,
    
    Dashboard: Dashboard,
    
    Companies: Companies,
    
    AdminDashboard: AdminDashboard,
    
    Search: Search,
    
    RFPStudio: RFPStudio,
    
    Campaigns: Campaigns,
    
    EmailCenter: EmailCenter,
    
    AffiliateDashboard: AffiliateDashboard,
    
    Billing: Billing,
    
    Settings: Settings,
    
    Pricing: Pricing,
    
    Diagnostic: Diagnostic,
    
    CMSManager: CMSManager,
    
    LeadProspecting: LeadProspecting,
    
    AdminAgent: AdminAgent,
    
    Platform: Platform,
    
    Solutions: Solutions,
    
    About: About,
    
    Resources: Resources,
    
}

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

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<Landing />} />
                
                
                <Route path="/Landing" element={<Landing />} />
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/Companies" element={<Companies />} />
                
                <Route path="/AdminDashboard" element={<AdminDashboard />} />
                
                <Route path="/Search" element={<Search />} />
                
                <Route path="/RFPStudio" element={<RFPStudio />} />
                
                <Route path="/Campaigns" element={<Campaigns />} />
                
                <Route path="/EmailCenter" element={<EmailCenter />} />
                
                <Route path="/AffiliateDashboard" element={<AffiliateDashboard />} />
                
                <Route path="/Billing" element={<Billing />} />
                
                <Route path="/Settings" element={<Settings />} />
                
                <Route path="/Pricing" element={<Pricing />} />
                
                <Route path="/Diagnostic" element={<Diagnostic />} />
                
                <Route path="/CMSManager" element={<CMSManager />} />
                
                <Route path="/LeadProspecting" element={<LeadProspecting />} />
                
                <Route path="/AdminAgent" element={<AdminAgent />} />
                
                <Route path="/Platform" element={<Platform />} />
                
                <Route path="/Solutions" element={<Solutions />} />
                
                <Route path="/About" element={<About />} />
                
                <Route path="/Resources" element={<Resources />} />
                
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}