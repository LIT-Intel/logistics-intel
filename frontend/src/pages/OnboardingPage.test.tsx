// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: {
  rpc,
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  from: vi.fn(),
} }));
import OnboardingPage from './OnboardingPage';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('five-step first-login onboarding', () => {
 it('collects company, role, services, and optional geography and validates before submitting', async () => {
  rpc.mockResolvedValue({data:{ok:false,reason:'profile_missing'},error:null});
  render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
  expect((screen.getByText('Continue') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Company name'),{target:{value:'Acme Logistics'}});
  fireEvent.click(screen.getByText('Freight Forwarder'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Sales'));
  fireEvent.change(screen.getByLabelText('Job title'),{target:{value:'Sales Manager'}});
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByLabelText('Ocean LCL'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByLabelText('United States'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Find new shippers'));
  fireEvent.click(screen.getByText('Finish setup'));
  await screen.findByRole('alert');
  expect(rpc).toHaveBeenCalledWith('lit_complete_onboarding_v4',{
    p_company_name:'Acme Logistics',p_company_type:'Freight Forwarder',p_website:'',
    p_team:'Sales',p_title:'Sales Manager',p_services:['Ocean LCL'],p_geographies:['United States'],p_goal:'Find new shippers',
  });
 });
});
