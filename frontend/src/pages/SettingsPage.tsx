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
  Bell,
  HelpCircle,
  Plus,
  Loader,
  Save,
  AlertCircle,
  CheckCircle,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { settingsApi } from '@/lib/settings';

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

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('account');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [org, setOrg] = useState<Organization | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [showInviteForm, setShowInviteForm] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [orgData, membersData, billingData, profileData] = await Promise.all([
        settingsApi.organization.get(),
        settingsApi.team.members.list(),
        settingsApi.billing.get(),
        settingsApi.profile.get(),
      ]);

      setOrg(orgData.org);
      setOrgSettings(orgData.settings);
      setTeamMembers(membersData.members || []);
      setBilling(billingData);
      setCurrentUser(profileData.profile);
    } catch (err) {
      console.error('Error loading settings:', err);
      showToast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOrg = async () => {
    if (!org) return;
    try {
      setSaving(true);
      const data = await settingsApi.organization.update({
        name: org.name,
        industry: org.industry,
        region: org.region,
        timezone: org.timezone,
      });
      setOrg(data.org);
      showToast('Organization updated successfully');
    } catch (err) {
      console.error('Error updating organization:', err);
      showToast('Failed to update organization', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBillingPortal = async () => {
    try {
      const data = await settingsApi.billing.portal();
      window.location.href = data.url;
    } catch (err) {
      console.error('Error accessing billing portal:', err);
      showToast('Failed to open billing portal', 'error');
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail) {
      showToast('Please enter an email address', 'error');
      return;
    }
    try {
      setSaving(true);
      await settingsApi.team.members.invite(inviteEmail, inviteRole);
      setInviteEmail('');
      setShowInviteForm(false);
      showToast('Invitation sent successfully');
      await loadSettings();
    } catch (err) {
      console.error('Error inviting user:', err);
      showToast('Failed to send invitation', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) return;
    try {
      setSaving(true);
      await settingsApi.team.members.remove(memberId);
      showToast('Team member removed');
      await loadSettings();
    } catch (err) {
      console.error('Error removing member:', err);
      showToast('Failed to remove team member', 'error');
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const tokenPercent = billing ? Math.round((billing.tokens.used / billing.tokens.limit) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-end mb-12">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Settings</h1>
            <p className="text-slate-600 mt-2">
              Manage your organization, team, and preferences.
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between gap-8 mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Token Usage</span>
              <span className="text-lg font-bold text-slate-900">{tokenPercent}%</span>
            </div>
            <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${tokenPercent}%` }}></div>
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              {billing?.tokens.used.toLocaleString()} / {billing?.tokens.limit.toLocaleString()} tokens
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-all relative shrink-0 ${
                activeTab === tab.id
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-slate-600 hover:text-slate-900 border-b-2 border-transparent'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Account Tab */}
            {activeTab === 'account' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="font-bold text-lg text-slate-900">Organization Settings</h2>
                  <button
                    onClick={handleUpdateOrg}
                    disabled={saving}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                  >
                    {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Organization Name
                      </label>
                      <input
                        type="text"
                        value={org?.name || ''}
                        onChange={(e) => setOrg(org ? { ...org, name: e.target.value } : null)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Org ID</label>
                      <input
                        type="text"
                        readOnly
                        value={org?.id?.substring(0, 8).toUpperCase() || ''}
                        className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Industry</label>
                      <input
                        type="text"
                        value={org?.industry || ''}
                        onChange={(e) => setOrg(org ? { ...org, industry: e.target.value } : null)}
                        placeholder="e.g., Logistics, Supply Chain"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Region</label>
                      <select
                        value={org?.region || 'North America'}
                        onChange={(e) => setOrg(org ? { ...org, region: e.target.value } : null)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
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
                  <h2 className="font-bold text-lg text-slate-900">Team Members</h2>
                  <button
                    onClick={() => setShowInviteForm(!showInviteForm)}
                    className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Plus size={16} />
                    Invite User
                  </button>
                </div>
                {showInviteForm && (
                  <div className="p-6 border-b border-slate-100 bg-indigo-50 space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Role</label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleInviteUser}
                        disabled={saving}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                      >
                        {saving ? 'Sending...' : 'Send Invitation'}
                      </button>
                      <button
                        onClick={() => setShowInviteForm(false)}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <div className="divide-y divide-slate-100">
                  {teamMembers.length > 0 ? (
                    teamMembers.map((member) => (
                      <div key={member.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                            {member.user?.full_name?.charAt(0).toUpperCase() || member.user?.email?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 text-sm">{member.user?.full_name || member.user?.email}</p>
                            <p className="text-xs text-slate-500">{member.user?.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full uppercase tracking-wider">
                            {member.role}
                          </span>
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                            Active
                          </span>
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={saving}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-600 disabled:text-slate-200"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-500">
                      <p>No team members yet. Invite your first team member to get started.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h2 className="font-bold text-lg text-slate-900">Security Settings</h2>
                </div>
                <div className="p-8 space-y-8">
                  <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex items-start gap-4">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg shrink-0">
                      <Shield size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">Security Score: 85%</h3>
                      <p className="text-sm text-slate-600">
                        Your organization has strong security enabled. Enable MFA for all users to reach 100%.
                      </p>
                    </div>
                    <button className="text-indigo-600 text-sm font-bold hover:underline shrink-0">Improve</button>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Authentication Methods</h3>
                    {[
                      { label: 'Email + Password', key: 'email' },
                      { label: 'Google OAuth Single Sign-On', key: 'google_oauth_enabled' },
                      { label: 'Magic Link Access', key: 'magic_link_enabled' },
                      { label: 'Force Multi-Factor Authentication (MFA)', key: 'mfa_required', important: true },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium ${item.important ? 'text-indigo-700 font-semibold' : 'text-slate-700'}`}>
                            {item.label}
                          </span>
                          {item.important && (
                            <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded font-bold">
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={orgSettings?.[item.key as keyof OrgSettings] as boolean}
                            onChange={() => {}}
                          />
                          <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Billing Tab */}
            {activeTab === 'billing' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h2 className="font-bold text-lg text-slate-900">Billing & Subscription</h2>
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Current Plan</p>
                      <p className="text-3xl font-bold text-slate-900 mb-2">{billing?.billing.plan.toUpperCase()}</p>
                      <p className="text-sm text-slate-600 mb-6">
                        {billing?.billing.token_limit_monthly.toLocaleString()} tokens/month
                      </p>
                      <button
                        onClick={handleBillingPortal}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                      >
                        Manage Subscription
                      </button>
                    </div>
                    <div className="p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border border-emerald-200">
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Team Seats</p>
                      <p className="text-3xl font-bold text-emerald-900 mb-2">
                        {billing?.seats.used}/{billing?.seats.limit}
                      </p>
                      <p className="text-sm text-emerald-700">Active seats</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Usage Tab */}
            {activeTab === 'usage' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h2 className="font-bold text-lg text-slate-900">Token Usage</h2>
                </div>
                <div className="p-8">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-slate-600">Monthly Consumption</span>
                      <span className="text-sm font-bold text-slate-900">
                        {billing?.tokens.used.toLocaleString()} / {billing?.tokens.limit.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full" style={{ width: `${tokenPercent}%` }}></div>
                    </div>
                    <div className="text-xs text-slate-500 pt-2">{tokenPercent}% of monthly allocation used</div>
                  </div>
                </div>
              </div>
            )}

            {/* Features Tab */}
            {activeTab === 'features' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h2 className="font-bold text-lg text-slate-900">Feature Access</h2>
                </div>
                <div className="p-8">
                  <div className="space-y-3">
                    {[
                      { name: 'Advanced Search Filters', description: 'Filter by HS codes, port codes, and custom parameters' },
                      { name: 'Contact Enrichment', description: 'Enrich saved companies with contact information' },
                      { name: 'Campaign Builder', description: 'Create and manage outreach campaigns' },
                      { name: 'RFP Studio', description: 'Generate professional RFPs and export to PDF/Excel' },
                      { name: 'Shipment Analytics', description: 'Advanced analytics on shipment trends' },
                      { name: 'Custom Dashboards', description: 'Create custom KPI dashboards' },
                    ].map((feature, i) => (
                      <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between hover:border-slate-300 transition-colors">
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{feature.name}</p>
                          <p className="text-xs text-slate-600">{feature.description}</p>
                        </div>
                        <div className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full whitespace-nowrap shrink-0 ml-4">
                          ENABLED
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h2 className="font-bold text-lg text-slate-900">Profile Settings</h2>
                </div>
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name</label>
                      <input
                        type="text"
                        value={currentUser?.full_name || ''}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        placeholder="Your full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Job Title</label>
                      <input
                        type="text"
                        value={currentUser?.title || ''}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        placeholder="e.g., Sales Manager"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email</label>
                      <input
                        type="email"
                        readOnly
                        value={currentUser?.email || ''}
                        className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Phone</label>
                      <input
                        type="tel"
                        value={currentUser?.phone || ''}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>
                  </div>
                  <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                    Save Profile
                  </button>
                </div>
              </div>
            )}

            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h2 className="font-bold text-lg text-slate-900">Connected Integrations</h2>
                </div>
                <div className="p-8">
                  <div className="space-y-3">
                    {[
                      { name: 'Gmail', description: 'Send campaigns via Gmail integration', connected: true },
                      { name: 'Outlook', description: 'Send campaigns via Outlook', connected: false },
                      { name: 'Google Cloud Storage', description: 'Store RFP documents', connected: true },
                      { name: 'Slack', description: 'Receive notifications on Slack', connected: false },
                      { name: 'Salesforce', description: 'Sync leads to Salesforce', connected: false },
                      { name: 'HubSpot', description: 'Sync leads to HubSpot CRM', connected: false },
                    ].map((integration, i) => (
                      <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between hover:border-slate-300 transition-colors">
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{integration.name}</p>
                          <p className="text-xs text-slate-600">{integration.description}</p>
                        </div>
                        <button className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0 ml-4 ${
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
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-2xl p-6 shadow-lg relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-32 h-32 bg-indigo-400/20 rounded-full blur-3xl"></div>
              <div className="relative z-10">
                <h4 className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-2">
                  Need Help?
                </h4>
                <p className="text-sm font-medium mb-4 text-indigo-50">
                  Our support team is available 24/7 to assist you.
                </p>
                <button className="w-full bg-white/10 hover:bg-white/20 backdrop-blur text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all border border-white/20">
                  <HelpCircle size={16} />
                  Contact Support
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h4 className="text-slate-900 text-sm font-bold uppercase tracking-wider mb-4">
                Current Plan
              </h4>
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-black text-slate-900">{billing?.billing.plan.toUpperCase()}</p>
                  <p className="text-xs text-slate-500 mt-1">Active Subscription</p>
                </div>
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600 font-medium">Tokens/Month:</span>
                    <span className="font-semibold text-slate-900">{(billing?.billing.token_limit_monthly || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600 font-medium">Team Seats:</span>
                    <span className="font-semibold text-slate-900">{billing?.seats.limit}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600 font-medium">Status:</span>
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {billing?.billing.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleBillingPortal}
                  className="w-full border border-indigo-300 text-indigo-600 hover:bg-indigo-50 px-4 py-2.5 rounded-lg text-sm font-bold transition-all"
                >
                  Manage Subscription
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 animate-in fade-in slide-in-from-right-4 max-w-sm">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-xl shadow-lg border ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle size={18} className="shrink-0" />
            ) : (
              <AlertCircle size={18} className="shrink-0" />
            )}
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `,
      }} />
    </div>
  );
};

export default SettingsPage;
