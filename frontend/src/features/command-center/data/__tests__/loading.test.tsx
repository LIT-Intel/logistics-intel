// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const dash=vi.hoisted(()=>({
  savedLoading:false, historyLoading:true, savedRows:[{company:{id:'co',kpis:{shipments_12m:1419,teu_12m:2300,est_spend_12m:30000}}}],
  ds:{ companies:[{key:'acme',uuid:'co',savedId:'saved',name:'Acme',stage:'Prospect',ownerKey:'—',ownerColor:'#000',savedAtTs:null,lastActivityTs:null}],coRows:[],laneRows:[],lastMi:24,firstYear:2024,todayTs:Date.now() },
}));
vi.mock('@/features/dashboard/data/useDashboardData',()=>({useDashboardData:()=>dash}));
vi.mock('@/auth/AuthProvider',()=>({useAuth:()=>({user:{id:'viewer'},orgId:'org',plan:'pro'})}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:undefined,isLoading:true})}));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
import { useCommandCenterData } from '../useCommandCenterData';
it('shows saved accounts while monthly history and contacts remain pending',()=>{
  const {result}=renderHook(()=>useCommandCenterData());
  expect(result.current.loading).toBe(false);
  expect(result.current.historyLoading).toBe(true);
  expect(result.current.accounts[0]).toMatchObject({ship:1419,teu:2300,spend:30000,yoy:null,series:[]});
});
