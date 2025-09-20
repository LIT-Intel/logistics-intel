import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardHeroCardsSkeleton() {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      {[...Array(3)].map((_, index) => (
        <Card key={index} className="rounded-lg bg-white shadow-md border border-gray-200 h-full">
          <CardHeader className="pb-2">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <Skeleton className="h-6 w-3/4 mt-3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-5 w-1/3 mt-4" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}