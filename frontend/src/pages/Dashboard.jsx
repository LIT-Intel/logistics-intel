
import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/api/entities";
import { Company, Shipment, SearchQuery } from "@/api/entities";
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
  const navigate = useNavigate(); // Initialize useNavigate hook
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ companies: 0, shipments: 0, searches: 0, activeUsers: 0 });
  const [recentCompanies, setRecentCompanies] = useState([]);
  const [allShipments, setAllShipments] = useState([]);
  const [searches, setSearches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savedCompaniesCount, setSavedCompaniesCount] = useState(0); // New state for saved companies count


  const loadDashboardData = useCallback(async () => {
    try {
      setError(null);
      const userData = await User.me();
      setUser(userData);

      // Load data with proper error handling
      let companiesData = [];
      let shipmentsData = [];
      let searchesData = [];
      let savedCount = 0; // Temporary variable to hold the count

      try {
        // Fetch count of companies saved by the current user
        const savedCompaniesResponse = await Company.filter({ saved_by_users: { op: 'cs', value: [userData.email] } }, "-created_date", 1000, 0, true);
        savedCount = savedCompaniesResponse.count || 0;
        setSavedCompaniesCount(savedCount);
      } catch (err) {
        console.error("Error loading saved companies count:", err);
        setSavedCompaniesCount(0);
      }
      
      try {
        // Fetch a small list of recent companies (not user-specific for recent display)
        const companiesResponse = await Company.filter({}, "-created_date", 5);
        companiesData = (companiesResponse && Array.isArray(companiesResponse.data)) ? companiesResponse.data : (Array.isArray(companiesResponse) ? companiesResponse : []);
      } catch (err) {
        console.error("Error loading companies for recent display:", err);
        companiesData = [];
      }

      try {
        const shipmentsResponse = await Shipment.list("-date", 1000);
        shipmentsData = Array.isArray(shipmentsResponse) ? shipmentsResponse : [];
      } catch (err) {
        console.error("Error loading shipments:", err);
        shipmentsData = [];
      }

      try {
        const searchesResponse = await SearchQuery.list("-created_date", 1000);
        searchesData = Array.isArray(searchesResponse) ? searchesResponse : [];
      } catch (err) {
        console.error("Error loading searches:", err);
        searchesData = [];
      }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentSearches = searchesData.filter(s => {
        try {
          return s && s.created_date && new Date(s.created_date) >= sevenDaysAgo;
        } catch {
          return false;
        }
      });
      
      const activeUsersSet = new Set(recentSearches.map(s => s.user_email).filter(Boolean));

      setStats({
        companies: savedCount, // Use the fetched savedCount for user's companies stat
        shipments: shipmentsData.length,
        searches: recentSearches.length,
        activeUsers: activeUsersSet.size,
      });
      
      setRecentCompanies(companiesData); // companiesData now directly contains 5 items
      setAllShipments(shipmentsData);
      setSearches(searchesData);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      setError("Failed to load dashboard data. Please try refreshing the page.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F6F8FB]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E5EFF]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-[#F6F8FB] min-h-screen">
        <Card className="bg-red-50 border-red-200 max-w-2xl mx-auto mt-20">
          <CardContent className="p-6">
            <h2 className="text-red-800 font-semibold mb-2">Dashboard Error</h2>
            <p className="text-red-600">{error}</p>
            <Button 
              onClick={loadDashboardData} 
              className="mt-4 bg-red-600 hover:bg-red-700"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
