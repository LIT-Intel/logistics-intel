import React from 'react';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

// Minimal drawer fallback if Sheet is not present; uses details/summary
export default function MobileCompaniesDrawer({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <details className="md:hidden">
        <summary>
          <Button variant="outline" className="w-full rounded-xl flex items-center gap-2">
            <Menu className="h-4 w-4" /> Companies
          </Button>
        </summary>
        <div className="mt-2 rounded-xl border bg-white p-3 max-h-[70vh] overflow-y-auto">
          {/* TODO: Replace with shared CompaniesList component if available */}
          {/* Placeholder slot for left-rail list reuse */}
        </div>
      </details>
    </div>
  );
}

