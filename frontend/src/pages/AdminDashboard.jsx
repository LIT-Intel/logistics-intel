import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/api/entities";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AdminKPIs from "../components/admin/AdminKPIs";
import UserAnalytics from "../components/admin/UserAnalytics";
import ImportsMonitor from "../components/admin/ImportsMonitor";
import UserManagementTable from "../components/admin/UserManagementTable";
import LitPageHeader from "../components/ui/LitPageHeader";
import LitPanel from "../components/ui/LitPanel";
import LitWatermark from "../components/ui/LitWatermark";

/** -------- helpers: be resilient to API shape differences -------- */
function asArray(x) {
  if (Array.isArray(x)) return x;
  if (!x || typeof x !== "object") return [];
  const candidates = [x.data, x.items, x.list, x.results, x.records];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [searches, setSearches] = useState([]);
  const [importJobs, setImportJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);
    
    try {
      console.log("🔍 AdminDashboard: Loading user data...");
      const userData = await User.me();
      console.log("🔍 AdminDashboard: User data loaded:", {
        email: userData?.email,
        role: userData?.role,
        full_name: userData?.full_name
      });
      
      setCurrentUser(userData || null);

      // More detailed admin check with logging
      if (!userData) {
        console.log("❌ AdminDashboard: No user data found, redirecting...");
        setAuthError("No user authentication found");
        setIsLoading(false);
        setTimeout(() => navigate(createPageUrl("Dashboard")), 2000);
        return;
      }

      if (userData.role !== "admin") {
        console.log(`❌ AdminDashboard: User role '${userData.role}' is not admin, redirecting...`);
        setAuthError(`Access denied. Your role is '${userData.role}' but admin access is required.`);
        setIsLoading(false);
        setTimeout(() => navigate(createPageUrl("Dashboard")), 3000);
        return;
      }

      console.log("✅ AdminDashboard: Admin access confirmed, loading data...");

      // Fetch data with error handling for each entity
      try {
        // Import entities dynamically to catch import errors
        const { Company } = await import('@/api/entities');
        const { SearchQuery } = await import('@/api/entities');  
        const { ImportJob } = await import('@/api/entities');

        const [usersRaw, companiesRaw, searchesRaw, jobsRaw] = await Promise.all([
          User.list("-created_date").catch(err => {
            console.warn("Failed to load users:", err);
            return [];
          }),
          Company.list("-created_date").catch(err => {
            console.warn("Failed to load companies:", err);
            return [];
          }),
          SearchQuery.list("-created_date", 1000).catch(err => {
            console.warn("Failed to load search queries:", err);
            return [];
          }),
          ImportJob.list("-created_date", 50).catch(err => {
            console.warn("Failed to load import jobs:", err);
            return [];
          }),
        ]);

        // Normalize shapes so we always get arrays
        setAllUsers(asArray(usersRaw));
        setCompanies(asArray(companiesRaw));
        setSearches(asArray(searchesRaw));
        setImportJobs(asArray(jobsRaw));
        
        console.log("✅ AdminDashboard: All data loaded successfully");
      } catch (entityError) {
        console.error("❌ AdminDashboard: Error loading entities:", entityError);
        setAuthError(`Failed to load admin data: ${entityError.message}`);
        setIsLoading(false);
        setTimeout(() => navigate(createPageUrl("Dashboard")), 3000);
        return;
      }
    } catch (error) {
      console.error("❌ AdminDashboard: Error loading data:", error);
      setAuthError(`Failed to load admin data: ${error.message}`);
      setIsLoading(false);
      setTimeout(() => navigate(createPageUrl("Dashboard")), 3000);
      return;
    }
    setIsLoading(false);
  }, [navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // KPIs are computed defensively
  const kpiData = {
    totalUsers: allUsers.length,
    activeUsers: allUsers.filter((user) => {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      return searches.some(
        (search) =>
          search?.user_email === user?.email &&
          search?.created_date &&
          new Date(search.created_date) >= lastWeek
      );
    }).length,
    totalCompanies: companies.length,
    totalSearches: searches.length,
    avgSearchesPerUser:
      allUsers.length > 0 ? Math.round(searches.length / allUsers.length) : 0,
    enrichmentRate:
      companies.length > 0
        ? Math.round(
            (companies.filter((c) => c?.enrichment_status === "enriched").length /
              companies.length) *
              100
          )
        : 0,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h1 className="text-xl font-bold text-red-800 mb-2">Access Denied</h1>
            <p className="text-red-600 mb-4">{authError}</p>
            <p className="text-sm text-gray-600">Redirecting to dashboard...</p>
          </div>
          
          {currentUser && (
            <div className="mt-4 p-3 bg-gray-50 rounded border text-sm text-left">
              <p><strong>Current User:</strong> {currentUser.email}</p>
              <p><strong>Role:</strong> {currentUser.role || 'undefined'}</p>
              <p><strong>Name:</strong> {currentUser.full_name || 'undefined'}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
          <p className="text-sm text-gray-500 mt-2">
            Current role: {currentUser?.role || 'undefined'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-2 md:px-5 py-3 min-h-screen">
      <LitWatermark />
      <div className="max-w-7xl mx-auto">
        <LitPageHeader title="Admin Dashboard" />

        <div className="mb-6">
          <LitPanel>
            <p className="text-xs text-slate-600">Logged in as: {currentUser.email} (Role: {currentUser.role})</p>
          </LitPanel>
        </div>

        <div className="mb-6">
          <LitPanel>
            <AdminKPIs data={kpiData} />
          </LitPanel>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mt-2">
          <LitPanel>
            <UserAnalytics users={allUsers} searches={searches} />
          </LitPanel>
          <LitPanel>
            <ImportsMonitor jobs={importJobs} />
          </LitPanel>
        </div>

        <div className="mt-8">
          <LitPanel title="User Management">
            <UserManagementTable users={allUsers} onUserUpdate={loadData} />
          </LitPanel>
        </div>
      </div>
    </div>
  );
}