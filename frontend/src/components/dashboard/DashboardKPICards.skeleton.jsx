import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardKPICardsSkeleton() {
  return (
    <>
      {[...Array(4)].map((_, index) => (
        <div key={index} className="col-span-12 md:col-span-6 lg:col-span-3">
          <Card className="rounded-lg bg-white shadow-md border border-gray-200 h-full">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
              <Skeleton className="h-8 w-1/2 mb-2" />
              <Skeleton className="h-4 w-1/4" />
            </CardContent>
          </Card>
        </div>
      ))}
    </>
  );
}