// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { useProfileState } from '../useProfileState';
import type { ShipmentDataset } from '../types';
afterEach(cleanup);
it('keeps a chosen calendar period and facets when older history arrives',async()=>{
  const base:ShipmentDataset={rows:[],firstYear:2024,lastMi:33,todayTs:Date.now(),teuModeledShare:0,spendModeledShare:0,source:'archive'};
  const {result,rerender}=renderHook(({dataset})=>useProfileState(dataset),{initialProps:{dataset:base},wrapper:({children})=><MemoryRouter>{children}</MemoryRouter>});
  await waitFor(()=>expect(result.current.ready).toBe(true));
  act(()=>{result.current.actions.range(12,20);result.current.actions.metric('teu');result.current.actions.toggle('lane','CN-US');});
  rerender({dataset:{...base,firstYear:2020,lastMi:81}});
  await waitFor(()=>expect(result.current.state.m0).toBe(60));
  expect(result.current.state.m1).toBe(68);
  expect(result.current.state.metric).toBe('teu');
  expect(result.current.state.f.lane).toEqual(['CN-US']);
});
