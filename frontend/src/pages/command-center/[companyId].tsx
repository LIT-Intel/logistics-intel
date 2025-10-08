import React, { lazy, Suspense } from 'react';

const LITEnrichCommandCenterDemo = lazy(() => import('@/components/command-center/LITEnrichCommandCenterDemo'));

export default function CommandCenterPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading Command Center…</div>}>
      <LITEnrichCommandCenterDemo />
    </Suspense>
  );
}
