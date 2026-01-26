import { supabase } from './supabase';

const API_BASE = '/api/lit';

async function getAuthToken() {
  const session = await supabase.auth.getSession();
  return session.data.session?.access_token;
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
}

async function apiCall(endpoint: string, options: FetchOptions = {}) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const settingsApi = {
  organization: {
    get: () => apiCall('/settings/organization'),
    update: (data: any) => apiCall('/settings/organization', { method: 'PUT', body: data }),
  },

  profile: {
    get: () => apiCall('/settings/profile'),
    update: (data: any) => apiCall('/settings/profile', { method: 'PUT', body: data }),
  },

  team: {
    members: {
      list: () => apiCall('/settings/team/members'),
      invite: (email: string, role: string) =>
        apiCall('/settings/team/invite', { method: 'POST', body: { email, role } }),
      remove: (memberId: string) =>
        apiCall(`/settings/team/members/${memberId}`, { method: 'DELETE' }),
      updateRole: (memberId: string, role: string) =>
        apiCall(`/settings/team/members/${memberId}/role`, {
          method: 'PUT',
          body: { role }
        }),
    },
    invites: {
      list: () => apiCall('/settings/team/invites'),
    },
  },

  billing: {
    get: () => apiCall('/settings/billing'),
    portal: () => apiCall('/settings/billing/portal', { method: 'POST' }),
  },

  usage: {
    byFeature: () => apiCall('/settings/usage/by-feature'),
  },

  features: {
    list: () => apiCall('/settings/features'),
  },

  audit: {
    logs: (limit = 50, offset = 0) =>
      apiCall(`/settings/audit-logs?limit=${limit}&offset=${offset}`),
  },

  integrations: {
    list: () => apiCall('/settings/integrations'),
    disconnect: (integrationId: string) =>
      apiCall(`/settings/integrations/${integrationId}`, { method: 'DELETE' }),
  },

  orgSettings: {
    get: () => apiCall('/settings/org-settings'),
    update: (data: any) => apiCall('/settings/org-settings', { method: 'PUT', body: data }),
  },
};
