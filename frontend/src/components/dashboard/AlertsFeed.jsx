import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Ship, Zap } from 'lucide-react';
import { EventNewShipper, Company } from '@/api/entities';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function AlertsFeed() {
  const [events, setEvents] = useState([]);
  const [companies, setCompanies] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [eventData, companyData] = await Promise.all([
          EventNewShipper.list('-created_date', 5),
          Company.list()
        ]);
        
        setEvents(eventData);

        const companyMap = companyData.reduce((acc, company) => {
          acc[company.id] = company;
          return acc;
        }, {});
        setCompanies(companyMap);

      } catch (error) {
        console.error("Failed to load alerts feed:", error);
      }
      setIsLoading(false);
    };

    loadData();
  }, []);

  const renderAlertContent = (event) => {
    const companyName = companies[event.company_id]?.name || `ID ${event.company_id.substring(0, 8)}...`;
    
    switch (event.created_by) { // Assuming we can use created_by to check event type if available. For now, it's all new shippers.
      default: // New Shipper
        return (
          <>
            <div className="font-semibold text-gray-800">New Shipper Detected</div>
            <div className="text-gray-600">Company <span className="font-medium text-blue-600">{companyName}</span> started shipping.</div>
          </>
        );
    }
  };

  return (
    <Card className="bg-white/80 backdrop-blur-xl border border-gray-200/60 shadow-lg rounded-2xl h-full">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold text-gray-900">Alerts & Opportunities</CardTitle>
            <p className="text-sm text-gray-500">Real-time trade event notifications</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 animate-pulse">
                <div className="rounded-full bg-gray-200 h-10 w-10"></div>
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : events.length > 0 ? (
          <div className="space-y-2">
            {events.map(event => (
              <Link
                key={event.id}
                to={createPageUrl(`Search?company_id=${event.company_id}`)}
                className="block p-3 rounded-xl hover:bg-gray-100 transition-colors duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Ship className="w-4 h-4 text-blue-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm">{renderAlertContent(event)}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(event.created_date), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-gray-500">No new opportunities detected recently.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}