import React, { useState } from "react";
import {
  Settings as SettingsIcon,
  User,
  Shield,
  Database,
  CreditCard,
  Bell,
  Lock,
  Mail,
  Zap,
  ExternalLink,
  Activity,
  Trash2,
  ChevronRight,
  Save,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

/*
 * Modern settings page for Logistics Intel.  This file provides a polished
 * enterprise settings dashboard inspired by the Gemini design.  It
 * organizes user and organization preferences into tabbed panels and
 * provides scaffolding for subscription and beta user management.  The
 * design is responsive and uses TailwindCSS utility classes for layout.
 */

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<string>("account");
  const [isSaving, setIsSaving] = useState(false);

  // Define navigation items.  Additional tabs for access management can be
  // added here (e.g. beta invites or plan usage).
  const tabs = [
    { id: "account", label: "Account Profile", icon: User },
    { id: "security", label: "Security & Auth", icon: Shield },
    { id: "integrations", label: "Data Sources", icon: Database },
    { id: "billing", label: "Billing & Plan", icon: CreditCard },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "access", label: "Access & Plans", icon: Activity },
  ];

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), 1500);
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Sidebar navigation */}
      <div className="hidden lg:flex w-64 flex-col bg-[#0F172A] text-white">
        <div className="p-6 border-b border-white/10 flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <Zap className="h-5 w-5 fill-current" />
          </div>
          <span className="font-black tracking-tight">Trade Intelligence</span>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {[
            "Dashboard",
            "Search",
            "Command Center",
            "Campaigns",
          ].map((item) => (
            <div
              key={item}
              className="px-4 py-2 text-sm font-bold text-slate-400 hover:bg-white/5 rounded-lg cursor-pointer transition-all"
            >
              {item}
            </div>
          ))}
          <div className="pt-8 pb-2 px-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">
            Settings
          </div>
          <div className="px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg flex items-center gap-3">
            <SettingsIcon className="h-4 w-4" /> Account Settings
          </div>
        </nav>
      </div>
      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold text-sm">App</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
            <span className="font-black text-sm text-slate-800 tracking-tight">Settings</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xs border border-indigo-200">
              U
            </div>
            <button className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider">
              Logout
            </button>
          </div>
        </header>
        <div className="flex-1 p-8 lg:p-12 max-w-6xl mx-auto w-full">
          {/* Page title and tab switcher */}
          <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tighter">
                Settings
              </h1>
              <p className="text-slate-500 font-medium mt-1">
                Manage your account preferences and enterprise data pipelines.
              </p>
            </div>
            <div className="flex bg-slate-200/50 p-1 rounded-xl border border-slate-200 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" /> {tab.label}
                </button>
              ))}
            </div>
          </div>
          {/* Dynamic content panel */}
          <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden flex flex-col min-h-[600px]">
            {/* Account profile tab */}
            {activeTab === "account" && (
              <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="max-w-2xl space-y-8">
                  <div className="flex items-center gap-6 pb-8 border-b border-slate-100">
                    <div className="h-24 w-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-indigo-100 ring-4 ring-white">
                      JD
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900">John Doe</h3>
                      <p className="text-sm text-slate-500 font-medium">
                        Head of Global Logistics at Acme Corp
                      </p>
                      <button className="mt-2 text-xs font-black text-indigo-600 uppercase tracking-widest hover:underline">
                        Change Avatar
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                        Full Name
                      </label>
                      <input
                        defaultValue="John Doe"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:bg-white outline-none ring-indigo-50 focus:ring-4 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                        Work Email
                      </label>
                        <input
                          defaultValue="john@acmecorp.com"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:bg-white outline-none ring-indigo-50 focus:ring-4 transition-all"
                        />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                        Organization
                      </label>
                        <input
                          defaultValue="Acme Corp Global Logistics"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:bg-white outline-none ring-indigo-50 focus:ring-4 transition-all"
                        />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Security tab */}
            {activeTab === "security" && (
              <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="max-w-2xl space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <Lock className="h-5 w-5 text-indigo-600" /> Password Management
                    </h3>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <input
                          type="password"
                          placeholder="Current Password"
                          className="col-span-2 w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none"
                        />
                        <input
                          type="password"
                          placeholder="New Password"
                          className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none"
                        />
                        <input
                          type="password"
                          placeholder="Confirm New"
                          className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none"
                        />
                      </div>
                      <button className="bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest">
                        Update Credentials
                      </button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <Shield className="h-5 w-5 text-indigo-600" /> Multi‑Factor Authentication
                    </h3>
                    <div className="flex items-center justify-between p-6 border border-slate-100 bg-emerald-50/30 rounded-2xl">
                      <div className="flex gap-4">
                        <div className="h-10 w-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                          <Mail className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-black text-slate-800">
                            Email Verification Active
                          </div>
                          <p className="text-xs text-slate-500 font-medium">
                            Secured with john@acmecorp.com
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">
                        Enabled
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Integrations tab */}
            {activeTab === "integrations" && (
              <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    {
                      title: "ImportYeti API",
                      desc: "Real‑time import/export company mapping",
                      active: true,
                      icon: "⚓",
                    },
                    {
                      title: "Gemini Enrichment",
                      desc: "AI‑powered company analysis & risk forecasting",
                      active: false,
                      icon: "✨",
                    },
                    {
                      title: "Lusha Contacts",
                      desc: "Direct outreach intelligence for key stakeholders",
                      active: false,
                      icon: "👤",
                    },
                    {
                      title: "Fleet Radar",
                      desc: "Real‑time vessel tracking and port congestion",
                      active: true,
                      icon: "🚢",
                    },
                  ].map((source, i) => (
                    <div
                      key={i}
                      className={`p-6 rounded-[1.5rem] border transition-all ${
                        source.active
                          ? "border-indigo-100 bg-indigo-50/20 shadow-sm"
                          : "border-slate-100 bg-white opacity-60"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="text-3xl">{source.icon}</div>
                        <div className="flex items-center h-6 w-12 bg-slate-200 rounded-full p-1 relative cursor-pointer">
                          <div
                            className={`h-4 w-4 rounded-full transition-all duration-300 ${
                              source.active ? "translate-x-6 bg-indigo-600" : "bg-slate-400"
                            }`}
                          />
                        </div>
                      </div>
                      <div className="text-sm font-black text-slate-900">
                        {source.title}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 font-medium">
                        {source.desc}
                      </p>
                      <div className="mt-4 flex items-center gap-2">
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                            source.active
                              ? "bg-indigo-100 text-indigo-600"
                              : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          {source.active ? "Operational" : "Disabled"}
                        </span>
                        {source.active && (
                          <span className="text-[9px] font-black text-indigo-400 uppercase">
                            Latency: 24ms
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Billing tab */}
            {activeTab === "billing" && (
              <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                {/* Current plan card */}
                <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Zap className="h-32 w-32" />
                  </div>
                  <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">
                        Current Subscription
                      </span>
                      <h2 className="text-3xl font-black tracking-tighter">
                        Enterprise Elite
                      </h2>
                      <p className="text-slate-400 text-sm font-medium">
                        Billed annually • Next renewal Jan 1, 2027
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button className="bg-white text-slate-900 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-all">
                        Manage Billing
                      </button>
                      <button className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20">
                        Upgrade Plan
                      </button>
                    </div>
                  </div>
                  <div className="mt-8 pt-8 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Company Views", val: "Unlimited" },
                      { label: "AI Intel Credits", val: "2,500 / mo" },
                      { label: "Team Members", val: "12 / 20" },
                      { label: "Data Export", val: "Enabled" },
                    ].map((stat, i) => (
                      <div key={i}>
                        <div className="text-[10px] font-black uppercase text-slate-500">
                          {stat.label}
                        </div>
                        <div className="text-lg font-black text-white">
                          {stat.val}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Billing history */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                      Invoicing History
                    </h3>
                    <button className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> View Portal
                    </button>
                  </div>
                  <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                    {[
                      { date: "Oct 1, 2025", amt: "$12,400.00", status: "Paid", inv: "INV-8921" },
                      { date: "Sep 1, 2025", amt: "$12,400.00", status: "Paid", inv: "INV-8742" },
                      { date: "Aug 1, 2025", amt: "$12,400.00", status: "Paid", inv: "INV-8501" },
                    ].map((row, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-8 w-8 bg-slate-100 rounded flex items-center justify-center">
                            <CreditCard className="h-4 w-4 text-slate-400" />
                          </div>
                          <div>
                            <div className="text-sm font-black text-slate-800">
                              {row.date}
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase">
                              {row.inv}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-8">
                          <div className="text-sm font-black text-slate-800">
                            {row.amt}
                          </div>
                          <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
                            {row.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* Notifications tab */}
            {activeTab === "notifications" && (
              <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
                {/* Simple notification toggles.  Replace with real user preferences. */}
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" defaultChecked />
                    <span className="text-sm font-medium">Email updates</span>
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" />
                    <span className="text-sm font-medium">Push notifications</span>
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" defaultChecked />
                    <span className="text-sm font-medium">Weekly reports</span>
                  </label>
                </div>
              </div>
            )}
            {/* Access & Plans tab */}
            {activeTab === "access" && (
              <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                <h3 className="text-lg font-black text-slate-900">Access & Plans</h3>
                <p className="text-sm text-slate-600 max-w-xl">
                  Configure beta access, seat assignments and free plan limits.  Free
                  tier users are limited to 10 searches, 5 saved companies and 5
                  contact enrichments.  Upgrade plans to unlock unlimited usage and
                  advanced features.
                </p>
                {/* Beta user list placeholder */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">Beta Invitees</h4>
                      <p className="text-xs text-slate-500">
                        Users invited to the beta will appear here.
                      </p>
                    </div>
                    <button className="text-xs font-black text-indigo-600 uppercase hover:underline">
                      Invite User
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {/* Example entries */}
                    <li className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black">
                          JD
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-800">janedoe@beta.com</div>
                          <div className="text-xs text-slate-500">Pending activation</div>
                        </div>
                      </div>
                      <span className="text-[9px] font-black uppercase bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full">
                        Invite Sent
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
            {/* Footer save bar */}
            <div className="mt-auto border-t border-slate-100 p-6 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-medium italic">
                  Unsaved changes will be lost.
                </span>
              </div>
              <div className="flex gap-4">
                <button
                  className="text-xs font-black uppercase text-slate-400 tracking-widest hover:text-slate-600"
                  onClick={() => {
                    // Optionally reset changes on cancel
                  }}
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2 min-w-[160px] justify-center"
                >
                  {isSaving ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          {/* Admin tools placeholder */}
          <div className="mt-8 flex flex-wrap gap-4">
            <div className="flex-1 bg-white p-6 border border-slate-200 rounded-3xl flex items-center gap-4">
              <div className="h-12 w-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-black text-slate-900">
                  Debug Agent
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Verify data pipeline health and logs.
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 ml-auto" />
            </div>
            <div className="flex-1 bg-white p-6 border border-slate-200 rounded-3xl flex items-center gap-4">
              <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-black text-red-600">
                  Delete Account
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Permanently wipe enterprise data.
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 ml-auto" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
