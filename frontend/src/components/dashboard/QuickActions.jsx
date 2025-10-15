import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Upload, FileText } from 'lucide-react';
import { createPageUrl } from '@/utils';

const actions = [
  {
    title: "New Search",
    description: "Find new prospects",
    icon: Search,
    url: createPageUrl("Search"),
    color: "text-blue-600 bg-blue-50 hover:bg-blue-100"
  },
  {
    title: "Import Data",
    description: "Upload your existing data",
    icon: Upload,
    url: createPageUrl("ImportData"),
    color: "text-purple-600 bg-purple-50 hover:bg-purple-100"
  },
  {
    title: "Build a Quote",
    description: "Create an RFP or quote",
    icon: FileText,
    url: createPageUrl("RFPStudio"),
    color: "text-green-600 bg-green-50 hover:bg-green-100"
  }
];

export default function QuickActions({ onNavigate }) {
  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map(action => (
          <button 
            key={action.title} 
            onClick={() => onNavigate(action.url)}
            className={`w-full flex items-center p-3 rounded-lg transition-colors ${action.color}`}
          >
            <action.icon className="w-5 h-5 mr-4" />
            <div>
              <p className="font-semibold text-left">{action.title}</p>
              <p className="text-xs text-gray-500 text-left">{action.description}</p>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}