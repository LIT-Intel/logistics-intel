// @vitest-environment jsdom
import React from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
const feeds=vi.hoisted(()=>new Map<string,Promise<any>>());
vi.mock('@/auth/AuthProvider',()=>({useAuth:()=>({user:{id:'viewer'},orgId:'org',plan:'pro'})}));
vi.mock('@/lib/supabase',()=>({supabase:{from:(table:string)=>{
  const chain:any={select:()=>chain,eq:()=>chain,order:()=>chain,range:()=>feeds.get(table)};
  return chain;
}}}));
import { useShipmentDataset } from '../useCompanyShipments';
afterEach(cleanup);
it('renders complete monthly totals while document and lane reads remain pending',async()=>{
  feeds.set('lit_company_time_series_monthly',Promise.resolve({data:[{year:2026,month:8,shipments:1419,teu:2300}],error:null}));
  feeds.set('lit_unified_shipments',new Promise(()=>{}));
  feeds.set('lit_company_lane_months',new Promise(()=>{}));
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const {result,unmount}=renderHook(()=>useShipmentDataset('acme',null),{wrapper:({children})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
  await waitFor(()=>expect(result.current.dataset?.rollup?.totalShipments).toBe(1419));
  expect(result.current.loading).toBe(false);
  expect(result.current.detailsLoading).toBe(true);
  expect(result.current.dataset?.rows).toEqual([]);
  unmount(); client.clear();
});
