import React, { useEffect, useMemo, useState } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOutreachHistory } from '@/api/functions';
import { Loader2 } from 'lucide-react';

export default function OutreachHistory({
  contactId,
  companyId,
  pageSize = 50
}) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const filterParams = useMemo(() => {
    return { contactId, companyId, page, pageSize };
  }, [contactId, companyId, page, pageSize]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    
    getOutreachHistory(filterParams)
      .then(({ data }) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(err => {
        if (cancelled) return;
        console.error("Failed to fetch outreach history:", err);
        setError("Could not load outreach history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
      
    return () => { cancelled = true; };
  }, [filterParams]);

  if (loading) return (
    <div className="p-4 text-sm text-gray-500 flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading outreach history...
    </div>
  );

  if (error) return <div className="p-3 text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium text-gray-800">Outreach History</div>
        <div className="text-sm text-gray-500">{total} events found</div>
      </div>

      {items.length === 0 && <div className="p-4 text-center text-sm text-gray-500 bg-gray-50 rounded-lg">No outreach events recorded yet.</div>}

      <div className="space-y-3">
        {items.map(ev => (
          <Card key={ev.id} className="p-4 border-gray-200/80">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-grow">
                <div className="font-medium text-gray-800">{ev.subject ?? `${ev.channel} · ${ev.event_type}`}</div>
                <div className="text-xs text-gray-500">{new Date(ev.occurred_at).toLocaleString()}</div>
                {ev.snippet && <p className="mt-2 text-sm text-gray-600">{ev.snippet}</p>}
              </div>
              <div className="flex-shrink-0 space-x-2 whitespace-nowrap">
                <Badge variant="secondary">{ev.channel}</Badge>
                <Badge>{ev.event_type}</Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {total > pageSize && (
        <div className="flex items-center justify-between pt-4 border-t">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
            Previous
          </Button>
          <div className="text-xs text-gray-500">Page {page} of {Math.ceil(total / pageSize)}</div>
          <Button size="sm" variant="outline" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}