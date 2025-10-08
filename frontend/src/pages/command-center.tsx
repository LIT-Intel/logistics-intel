import React from 'react';
import LITEnrichCommandCenterDemo from '@/components/command-center/LITEnrichCommandCenterDemo';

export default function CommandCenterPage() {
  return (
    <div data-cc-ui="ui-2">
      <div className="p-2 text-[11px] text-slate-600">CC UI-2 marker • path: {typeof window!=="undefined" ? window.location.pathname : ''}</div>
      <LITEnrichCommandCenterDemo />
    </div>
  );
}
