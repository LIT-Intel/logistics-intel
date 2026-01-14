// Direct HTTP Client - Replaces Firebase Cloud Functions
// Makes direct calls to API Gateway through /api/lit proxy

import { getCurrentSession } from '@/auth/supabaseAuthClient';

const API_BASE = '/api/lit';

interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

async function makeRequest(endpoint: string, options: CallOptions = {}) {
  const { method = 'POST', body, headers: customHeaders = {} } = options;

  // Get auth token from Supabase session
  let authToken: string | null = null;
  try {
    const session = await getCurrentSession();
    authToken = session?.access_token || null;
  } catch (err) {
    console.warn('[HTTP Client] Could not get auth token:', err);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    fetchOptions.body = JSON.stringify(body);
  }

  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    return await response.text();
  } catch (error: any) {
    console.error(`[HTTP Client] Request failed: ${method} ${url}`, error);
    throw error;
  }
}

// Create a callable function that makes HTTP requests with fallbacks
export function httpCall<T = any>(
  endpoint: string,
  fallback?: T | ((payload?: any) => T)
) {
  return async (payload?: any): Promise<T> => {
    try {
      const result = await makeRequest(endpoint, {
        method: 'POST',
        body: payload,
      });
      return result as T;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn(`[HTTP Client] ${endpoint} failed, using fallback`, error);
      }

      if (typeof fallback === 'function') {
        return (fallback as (payload?: any) => T)(payload);
      }

      if (fallback !== undefined) {
        return fallback;
      }

      throw error;
    }
  };
}

// Convenience wrapper for GET requests
export async function httpGet<T = any>(endpoint: string): Promise<T> {
  return makeRequest(endpoint, { method: 'GET' });
}

// Convenience wrapper for POST requests
export async function httpPost<T = any>(
  endpoint: string,
  body?: any
): Promise<T> {
  return makeRequest(endpoint, { method: 'POST', body });
}

// Convenience wrapper for PUT requests
export async function httpPut<T = any>(
  endpoint: string,
  body?: any
): Promise<T> {
  return makeRequest(endpoint, { method: 'PUT', body });
}

// Convenience wrapper for DELETE requests
export async function httpDelete<T = any>(endpoint: string): Promise<T> {
  return makeRequest(endpoint, { method: 'DELETE' });
}

export default {
  call: httpCall,
  get: httpGet,
  post: httpPost,
  put: httpPut,
  delete: httpDelete,
};
