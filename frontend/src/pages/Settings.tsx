import React, { useState, useEffect } from 'react';
import {
  Settings,
  Users,
  Shield,
  CreditCard,
  BarChart3,
  Layers,
  User,
  Link as LinkIcon,
  ChevronRight,
  LogOut,
  Bell,
  HelpCircle,
  Plus,
  Loader,
  Save,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Organization {
  id: string;
  name: string;
  industry?: string;
  region: string;
  timezone: string;
  logo_url?: string;
}

interface OrgSettings {
  search_depth: 'light' | 'full';
  max_results: number;
  auto_enrichment: boolean;
  cache_enabled: boolean;
  credit_protection: boolean;
  mfa_required: boolean;
  magic_link_enabled: boolean;
  google_oauth_enabled: boolean;
}

interface TeamMember {
  id: string;
  user_id: string;
  role: 'admin' | 'member' | 'viewer';
  joined_at: string;
  user?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

interface BillingInfo {
  billing: {
    plan: 'free' | 'pro' | 'enterprise';
    token_limit_monthly: number;
    seat_limit: number;
    status: string;
  };
  seats: { used: number; limit: number };
  tokens: { used: number; limit: number };
}

const Settings = () => {
  const [activeTab, setActiveTab] = useState('account');
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Organization | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');

  const API_BASE = '/api/lit';

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      if (!session.data.session) return;

      const token = session.data.session.access_token;

      // Load org
      const orgRes = await fetch(`${API_BASE}/settings/organization`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (orgRes.ok) {
        const data = await orgRes.json();
        setOrg(data.org);
        setOrgSettings(data.settings);
      }

      // Load team members
      const membersRes = await fetch(`${API_BASE}/settings/team/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (membersRes.ok) {
        const data = await membersRes.json();
        setTeamMembers(data.members || []);
      }

      // Load billing
      const billingRes = await fetch(`${API_BASE}/settings/billing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (billingRes.ok) {
        const data = await billingRes.json();
        setBilling(data);
      }

      // Load user profile
      const userRes = await fetch(`${API_BASE}/settings/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (userRes.ok) {
        const data = await userRes.json();
        setCurrentUser(data.profile);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) return;

      const token = session.data.session.access_token;

      const res = await fetch(`${supabase.supabaseUrl}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (res.ok) {
        setInviteEmail('');
        loadSettings();
      }
    } catch (err) {
      console.error('Error inviting user:', err);
    }
  };

  const handleUpdateOrg = async (updates: Partial<Organization>) => {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) return;

      const token = session.data.session.access_token;

      const res = await fetch(`${API_BASE}/settings/organization`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const data = await res.json();
        setOrg(data.org);
      }
    } catch (err) {
      console.error('Error updating organization:', err);
    }
  };

  const handleUpdateSettings = async (updates: Partial<OrgSettings>) => {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) return;

      const token = session.data.session.access_token;

      const res = await fetch(`${API_BASE}/settings/org-settings`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const data = await res.json();
        setOrgSettings(data.settings);
      }
    } catch (err) {
      console.error('Error updating settings:', err);
    }
  };

  const handleBillingPortal = async () => {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) return;

      const token = session.data.session.access_token;

      const res = await fetch(`${supabase.supabaseUrl}/functions/v1/billing-portal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Error accessing billing portal:', err);
    }
  };

  const tabs = [
    { id: 'account', label: 'Account', icon: <Settings size={18} /> },
    { id: 'users', label: 'Users', icon: <Users size={18} /> },
    { id: 'security', label: 'Security', icon: <Shield size={18} /> },
    { id: 'billing', label: 'Billing', icon: <CreditCard size={18} /> },
    { id: 'usage', label: 'Usage', icon: <BarChart3 size={18} /> },
    { id: 'features', label: 'Features', icon: <Layers size={18} /> },
    { id: 'profile', label: 'Profile', icon: <User size={18} /> },
    { id: 'integrations', label: 'Integrations', icon: <LinkIcon size={18} /> },
  ];

  const SidebarLink = ({ name, icon, active = false }: any) => (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors text-sm font-medium ${
        active
          ? 'bg-slate-800 text-white border-l-4 border-indigo-500'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
      }`}
    >
      {icon}
      <span>{name}</span>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const tokenPercent = billing ? Math.round((billing.tokens.used / billing.tokens.limit) * 100) : 0;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold text-xs">
              L
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">Logistics Intel</h1>
              <p className="text-slate-400 text-[10px] uppercase tracking-wider">Settings</p>
            </div>
          </div>
        </div>

        <div className="flex-1 py-4 overflow-y-auto">
          <div className="px-4 mb-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Account
          </div>
          <SidebarLink name="Settings" icon={<Settings size={18} />} active={true} />
          <SidebarLink name="Billing" icon={<CreditCard size={18} />} />
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800">
          <div
            className="flex items-center gap-3 text-slate-400 hover:text-white cursor-pointer px-2 py-1 transition-colors"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut size={18} />
            <span className="text-sm">Logout</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="hover:text-indigo-600 cursor-pointer">App</span>
            <ChevronRight size={14} />
            <span className="font-semibold text-slate-800">Settings</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
              <Bell size={20} />
            </button>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
              <span className="text-sm font-medium text-slate-700">{currentUser?.email}</span>
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                {currentUser?.full_name?.charAt(0) || 'U'}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h1>
                <p className="text-slate-500 mt-1">
                  Manage your organization, team, and preferences.
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between gap-8 mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Token Usage</span>
                  <span className="text-sm font-semibold text-slate-900">{tokenPercent}%</span>
                </div>
                <div className="w-56 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${tokenPercent}%` }}></div>
                </div>
                <div className="mt-2 text-[10px] text-slate-400">
                  {billing?.tokens.used.toLocaleString()} / {billing?.tokens.limit.toLocaleString()} tokens
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200 mb-8 overflow-x-auto scrollbar-hide">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative shrink-0 border-b-2 ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-6">
                {/* Account Tab */}
                {activeTab === 'account' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <h2 className="font-bold text-lg text-slate-800">Organization Settings</h2>
                      <button
                        onClick={() => handleUpdateOrg(org!)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                      >
                        Save Changes
                      </button>
                    </div>
                    <div className="p-8 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Organization Name
                          </label>
                          <input
                            type="text"
                            value={org?.name || ''}
                            onChange={(e) => setOrg(org ? { ...org, name: e.target.value } : null)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Org ID</label>
                          <input
                            type="text"
                            readOnly
                            value={org?.id?.substring(0, 8).toUpperCase() || ''}
                            className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Industry</label>
                          <input
                            type="text"
                            value={org?.industry || ''}
                            onChange={(e) => setOrg(org ? { ...org, industry: e.target.value } : null)}
                            placeholder="e.g. Logistics, Supply Chain"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Region</label>
                          <select
                            value={org?.region || 'North America'}
                            onChange={(e) => setOrg(org ? { ...org, region: e.target.value } : null)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          >
                            <option>North America (USA)</option>
                            <option>Europe</option>
                            <option>Asia Pacific</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Users Tab */}
                {activeTab === 'users' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <h2 className="font-bold text-lg text-slate-800">Team Members</h2>
                      <button className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                        <Plus size={16} />
                        Invite User
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {teamMembers.map((member) => (
                        <div key={member.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
                              {member.user?.full_name?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{member.user?.full_name || member.user?.email}</p>
                              <p className="text-xs text-slate-500">{member.user?.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <span className="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-600 rounded uppercase tracking-wider">
                              {member.role}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              Active
                            </span>
                            <button className="text-slate-400 hover:text-slate-600">
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Security Tab */}
                {activeTab === 'security' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-8">
                    <div className="flex items-start justify-between p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                      <div className="flex gap-4">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                          <Shield size={24} />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">Security Score: 85%</h3>
                          <p className="text-sm text-slate-600">
                            Your organization has strong security enabled. Enable MFA for all users to reach 100%.
                          </p>
                        </div>
                      </div>
                      <button className="text-indigo-600 text-sm font-bold hover:underline">Improve</button>
                    </div>

                    <div className="space-y-6">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Authentication Methods</h3>
                      {[
                        { label: 'Email + Password', key: 'email' },
                        { label: 'Google OAuth Single Sign-On', key: 'google_oauth_enabled' },
                        { label: 'Magic Link Access', key: 'magic_link_enabled' },
                        { label: 'Force Multi-Factor Authentication (MFA)', key: 'mfa_required', important: true },
                      ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-medium ${item.important ? 'text-indigo-700 font-bold' : 'text-slate-700'}`}>
                              {item.label}
                            </span>
                            {item.important && (
                              <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded font-bold">
                                RECOMMENDED
                              </span>
                            )}
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={orgSettings?.[item.key as keyof OrgSettings] as any}
                              onChange={(e) =>
                                handleUpdateSettings({
                                  ...orgSettings,
                                  [item.key]: e.target.checked,
                                } as any)
                              }
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Billing Tab */}
                {activeTab === 'billing' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
                    <h2 className="font-bold text-lg text-slate-800 mb-6">Billing & Subscription</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Current Plan</p>
                        <p className="text-2xl font-bold text-slate-900 mb-2">{billing?.billing.plan.toUpperCase()}</p>
                        <p className="text-sm text-slate-600 mb-4">
                          {billing?.billing.token_limit_monthly.toLocaleString()} tokens/month
                        </p>
                        <button
                          onClick={handleBillingPortal}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                        >
                          Manage Subscription
                        </button>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Team Seats</p>
                        <p className="text-2xl font-bold text-slate-900 mb-2">
                          {billing?.seats.used}/{billing?.seats.limit}
                        </p>
                        <p className="text-sm text-slate-600">Seats in use</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Usage Tab */}
                {activeTab === 'usage' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
                    <h2 className="font-bold text-lg text-slate-800 mb-6">Token Usage</h2>
                    <div className="space-y-6">
                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm font-medium text-slate-600">Monthly Tokens</span>
                          <span className="text-sm font-bold text-slate-900">
                            {billing?.tokens.used.toLocaleString()} / {billing?.tokens.limit.toLocaleString()}
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${tokenPercent}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Profile Tab */}
                {activeTab === 'profile' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                      <h2 className="font-bold text-lg text-slate-800">Profile Settings</h2>
                    </div>
                    <div className="p-8 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name</label>
                          <input
                            type="text"
                            value={currentUser?.full_name || ''}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            placeholder="Your full name"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Job Title</label>
                          <input
                            type="text"
                            value={currentUser?.title || ''}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            placeholder="e.g., Sales Manager"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email</label>
                          <input
                            type="email"
                            readOnly
                            value={currentUser?.email || ''}
                            className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Phone</label>
                          <input
                            type="tel"
                            value={currentUser?.phone || ''}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            placeholder="+1 (555) 000-0000"
                          />
                        </div>
                      </div>
                      <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm">
                        Save Profile
                      </button>
                    </div>
                  </div>
                )}

                {/* Features Tab */}
                {activeTab === 'features' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                      <h2 className="font-bold text-lg text-slate-800">Feature Access</h2>
                    </div>
                    <div className="p-8 space-y-6">
                      <div className="space-y-4">
                        {[
                          { name: 'Advanced Search Filters', description: 'Filter by HS codes, port codes, and custom parameters' },
                          { name: 'Contact Enrichment', description: 'Enrich saved companies with contact information' },
                          { name: 'Campaign Builder', description: 'Create and manage outreach campaigns' },
                          { name: 'RFP Studio', description: 'Generate professional RFPs and export to PDF/Excel' },
                          { name: 'Shipment Analytics', description: 'Advanced analytics on shipment trends' },
                          { name: 'Custom Dashboards', description: 'Create custom KPI dashboards' },
                        ].map((feature, i) => (
                          <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">{feature.name}</p>
                              <p className="text-sm text-slate-600">{feature.description}</p>
                            </div>
                            <div className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full whitespace-nowrap">
                              ENABLED
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Integrations Tab */}
                {activeTab === 'integrations' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                      <h2 className="font-bold text-lg text-slate-800">Connected Integrations</h2>
                    </div>
                    <div className="p-8 space-y-6">
                      <div className="space-y-4">
                        {[
                          { name: 'Gmail', description: 'Send campaigns via Gmail integration', connected: true },
                          { name: 'Outlook', description: 'Send campaigns via Outlook', connected: false },
                          { name: 'Google Cloud Storage', description: 'Store RFP documents', connected: true },
                          { name: 'Slack', description: 'Receive notifications on Slack', connected: false },
                          { name: 'Salesforce', description: 'Sync leads to Salesforce', connected: false },
                          { name: 'HubSpot', description: 'Sync leads to HubSpot CRM', connected: false },
                        ].map((integration, i) => (
                          <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">{integration.name}</p>
                              <p className="text-sm text-slate-600">{integration.description}</p>
                            </div>
                            <button className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                              integration.connected
                                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            }`}>
                              {integration.connected ? 'Disconnect' : 'Connect'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Sidebar */}
              <div className="space-y-6">
                <div className="bg-[#1E293B] text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl"></div>
                  <h4 className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                    Need Assistance?
                  </h4>
                  <p className="text-sm font-medium mb-4">
                    Our dedicated support team is available 24/7 to help you optimize your logistics data.
                  </p>
                  <button className="w-full bg-indigo-600 hover:bg-indigo-500 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all">
                    <HelpCircle size={16} />
                    Open Support Ticket
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-4">
                    Current Subscription
                  </h4>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xl font-black text-slate-900">{billing?.billing.plan.toUpperCase()} PLAN</span>
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {billing?.billing.status.toUpperCase()}
                    </span>
                  </div>
                  <ul className="space-y-3 mb-6">
                    <li className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                      {billing?.tokens.limit.toLocaleString()} Tokens/Month
                    </li>
                    <li className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                      {billing?.seats.limit} Team Seats
                    </li>
                    <li className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                      Advanced Analytics
                    </li>
                    <li className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                      Priority Support
                    </li>
                  </ul>
                  <button
                    onClick={handleBillingPortal}
                    className="w-full border border-indigo-200 text-indigo-600 hover:bg-indigo-50 py-2 rounded-lg text-sm font-bold transition-all"
                  >
                    Manage Subscription
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{
        __html: `
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
          body { font-family: 'Inter', sans-serif; }
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `,
      }} />
    </div>
  );
};

export default Settings;
