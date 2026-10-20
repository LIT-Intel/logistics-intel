// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
import OnboardingPage from './OnboardingPage';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('concise onboarding', () => {
  it('validates role/services, preserves back navigation, and submits optional geography', async () => {
    rpc.mockResolvedValue({ data: { ok: false }, error: null });
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
    expect((screen.getByText('Continue') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Sales'));
    fireEvent.change(screen.getByLabelText('Your title'), { target: { value: 'Sales Manager' } });
    fireEvent.click(screen.getByText('Continue'));
    expect((screen.getByText('Continue') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Ocean LCL'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Back'));
    expect((screen.getByLabelText('Ocean LCL') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Start exploring'));
    await screen.findByRole('alert');
    expect(rpc).toHaveBeenCalledWith('lit_complete_onboarding_v2', { p_team: 'Sales', p_title: 'Sales Manager', p_services: ['Ocean LCL'], p_geographies: [] });
    expect(screen.queryByText('Phone number')).toBeNull();
  });
});
