// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CadenceChart } from '../components/overview/OverviewWidgets';
import { InsightRail } from '../components/InsightRail';
afterEach(cleanup);
const view:any={hasPrior:true,unitM:'shipments',readout:{title:'2026',value:'100',sub:''},rbTicks:[],cadence:[{mi:1,fullLabel:'Aug 2026',priorLabel:'Aug 2025',label:'Aug',v:100,pv:75,s:1,ps:.75,bg:'#3b82f6',services:{total:100,fcl:40,lcl:10,unknown:50}}]};
it('makes the prior-period count accessible on the grey/current bar group and renders LCL in light green',()=>{
  const {container}=render(<CadenceChart view={view} extra={{clearHover(){}} as any}/>);
  expect(screen.getByLabelText('Aug 2026: 100 shipments; Aug 2025: 75 shipments')).toBeTruthy();
  expect(screen.getByRole('tooltip',{hidden:true}).textContent).toContain('Aug 2025: 75 shipments');
  expect(container.querySelector('[style*="rgb(134, 239, 172)"]')).toBeTruthy();
});
it('places CRM immediately below the Firmographics card',()=>{
  const {container}=render(<InsightRail view={{lanes:[],carriers:[],suppliers:[],products:[],ctypes:[],S:{},story:{}} as any} firmo={{website:'acme.com'}} crmPanel={<section data-testid="crm">CRM / Revenue</section>}/>);
  const crm=screen.getByTestId('crm');
  expect(crm.previousElementSibling?.textContent).toContain('Firmographics');
  expect(container.querySelectorAll('[data-testid="crm"]')).toHaveLength(1);
});
