
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  FileStack,
  Users,
  Star,
  FolderPlus,
  Settings,
  TrendingUp,
  Clock,
  CheckCircle,
  Send,
  Folder,
  Save, // Added Save icon
  ArrowRight // Added ArrowRight icon
} from "lucide-react";
import { createPageUrl } from "@/utils"; // Added createPageUrl utility
import { useNavigate } from "react-router-dom"; // Added useNavigate hook


// Import dashboard components
import DashboardHeroCards from "../components/dashboard/DashboardHeroCards";
import MonthlyTargetChart from "../components/dashboard/MonthlyTargetChart";
import ProjectStatisticsChart from "../components/dashboard/ProjectStatisticsChart";
import DashboardKPICards from "../components/dashboard/DashboardKPICards";
import ProjectSummaryPanel from "../components/dashboard/ProjectSummaryPanel";
import CompletionRatePanel from "../components/dashboard/CompletionRatePanel";

export default function Dashboard() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ companies: 0, shipments: 0, searches: 0, activeUsers: 0 });
  const [allShipments, setAllShipments] = useState([]);

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const apiBase = (import.meta.env && import.meta.env.VITE_API_BASE) || "/api";
      const res = await fetch(`${String(apiBase).replace(/\/$/, '')}/public/dashboard/summary`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`summary ${res.status}`);
      const data = await res.json();
      const companies = Number(data?.savedCompanies ?? 0);
      const shipments = Number(data?.shipments90d ?? 0);
      const searches = Number(data?.recentSearches7d ?? 0);
      const activeUsers = 0; // optional from API in future
      setStats({ companies, shipments, searches, activeUsers });
      setAllShipments([]);
    } catch (e) {
      // Safe fallback: zeros, still render UI
      setStats({ companies: 0, shipments: 0, searches: 0, activeUsers: 0 });
      setAllShipments([]);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F6F8FB]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E5EFF]"></div>
      </div>
    );
  }

  // Never hard-error: show zeros instead

  return (
    <div className="p-6 bg-[#F6F8FB] min-h-screen">
      <div className="max-w-[1480px] mx-auto">
        {/* Title Row */}
        <div className="grid grid-cols-12 gap-5 mb-5">
          <div className="col-span-12 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-[#0F172A]" style={{ lineHeight: 1.2 }}>
              Dashboard
            </h1>
            <Badge className="bg-[#EEF2FF] text-[#1E5EFF] border-0 px-3 py-1">
              Logistics Intelligence
            </Badge>
          </div>
        </div>

        {/* Hero Cards Row */}
        <div className="grid grid-cols-12 gap-5 mb-5">
          <div className="col-span-12 lg:col-span-8">
            <DashboardHeroCards /> {/* Removed companies prop as per outline */}
          </div>

          <div className="col-span-12 lg:col-span-4">
            <Card 
                className="h-full flex flex-col justify-between bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60 transition-all duration-300 hover:shadow-xl hover:scale-[1.01] cursor-pointer"
                onClick={() => navigate(createPageUrl('Companies'))}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Saved Companies</CardTitle>
                <Save className="h-4 w-4 text-gray-500" />
              </CardHeader>
              <CardContent className="flex-grow">
                <div className="text-3xl font-bold text-gray-900">{savedCompaniesCount}</div>
                <p className="text-xs text-gray-500 mt-1">Your prospect database</p>
              </CardContent>
               <div className="p-4 pt-0">
                  <span className="text-sm font-medium text-blue-600 flex items-center">
                    View list <ArrowRight className="ml-1 h-4 w-4" />
                  </span>
              </div>
            </Card>
          </div>
        </div>

        {/* Main Charts Row */}
        <div className="grid grid-cols-12 gap-5 mb-5">
          {/* Monthly Target Chart */}
          <div className="col-span-12 lg:col-span-6">
            <MonthlyTargetChart shipments={allShipments} />
          </div>
          
          {/* Project Statistics Chart */}
          <div className="col-span-12 lg:col-span-6">
            <ProjectStatisticsChart searches={searches} />
          </div>
        </div>

        {/* KPIs Row */}
        <div className="grid grid-cols-12 gap-5 mb-5">
          <DashboardKPICards stats={stats} />
        </div>

        {/* Right Rail Panels (if needed on larger screens) */}
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 lg:col-span-6">
            <ProjectSummaryPanel stats={stats} />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <CompletionRatePanel stats={stats} />
          </div>
        </div>
      </div>
    </div>
  );
}
