import React from 'react';
import { cn } from '@/lib/utils';

export function CompanyCard({ row, onClick }: { row: any; onClick: () => void }){
  return (
    <button onClick={onClick} className={cn('w-full text-left rounded-2xl border bg-white shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500')}> 
      <div className='p-4'>
        <div className='flex items-center gap-3'>
          <div className='grid h-10 w-10 place-items-center rounded-full bg-indigo-600 text-white'>{String(row.company_name||'?').slice(0,2).toUpperCase()}</div>
          <div className='min-w-0'>
            <div className='truncate font-semibold'>{row.company_name}</div>
            <div className='text-xs text-muted-foreground'>ID: {row.company_id}</div>
          </div>
        </div>
        <div className='mt-4 grid grid-cols-3 gap-3 text-xs text-muted-foreground'>
          <div><div className='text-[11px] uppercase'>Shipments (12m)</div><div className='mt-1 text-base text-foreground'>{row.shipments_12m ?? 0}</div></div>
          <div><div className='text-[11px] uppercase'>Last activity</div><div className='mt-1 text-foreground'>—</div></div>
          <div><div className='text-[11px] uppercase'>Top carrier</div><div className='mt-1 text-foreground'>—</div></div>
        </div>
        {(!row.top_routes || row.top_routes.length===0) ? (
          <div className='mt-4 h-10 rounded-md bg-muted grid place-items-center text-[12px] text-muted-foreground'>No route data yet</div>
        ) : null}
      </div>
    </button>
  );
}

