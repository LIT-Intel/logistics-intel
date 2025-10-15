import React from 'react';

export default function SearchEmpty({ state }: { state: 'idle'|'no-results' }) {
  const title = state === 'idle' ? 'Start a search' : 'No companies match';
  const subtitle = state === 'idle' ? 'Enter a term above and press Search.' : 'Try a broader term or clear filters.';
  return (
    <div className="mx-auto my-12 flex max-w-md flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center text-muted-foreground">
      <div className="mb-3 text-lg font-medium text-foreground">{title}</div>
      <div className="text-sm">{subtitle}</div>
    </div>
  );
}

