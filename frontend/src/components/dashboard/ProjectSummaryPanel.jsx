import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MoreHorizontal,
  Folder,
  Users,
  Clock,
  CheckCircle,
  Send,
  Building2,
  Search,
  Mail,
  FileText
} from 'lucide-react';

export default function ProjectSummaryPanel({ stats = {} }) {
  const summaryItems = [
    {
      icon: Building2,
      label: 'Total Companies & Contacts',
      badge: stats.companies || 0,
      variant: 'default',
      description: 'Companies in database'
    },
    {
      icon: Search,
      label: 'Search Activity',
      meta: `${stats.searches || 0} searches`,
      description: 'Recent searches performed'
    },
    {
      icon: Mail,
      label: 'Email Campaigns',
      meta: 'Active',
      description: 'Outreach campaigns'
    },
    {
      icon: FileText,
      label: 'RFP Generation',
      meta: 'Available',
      description: 'Quote generation tools'
    },
    {
      icon: CheckCircle,
      label: 'Data Integration',
      meta: `${stats.shipments || 0} records`,
      description: 'Shipment data points'
    }
  ];

  return (
    <Card 
      className="bg-white border-[#E5E7EB] h-full"
      style={{
        boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)',
        borderRadius: '12px'
      }}
    >
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-[#0F172A]">
            Platform Summary
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-[#6B7280] hover:text-[#0F172A] hover:bg-[#F9FAFB] rounded-lg"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem>View All</DropdownMenuItem>
              <DropdownMenuItem>Export Report</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summaryItems.map((item, index) => (
          <div key={index} className="flex items-start gap-3 p-3 rounded-lg hover:bg-[#F9FAFB] transition-colors">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: index === 0 ? 'linear-gradient(135deg, #1E5EFF20 0%, #0E3E9C20 100%)' :
                           'linear-gradient(135deg, #F9FAFB 0%, #E5E7EB 100%)'
              }}
            >
              <item.icon 
                className={`w-5 h-5 ${
                  index === 0 ? 'text-[#1E5EFF]' : 'text-[#6B7280]'
                }`} 
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-[#0F172A] truncate">
                  {item.label}
                </p>
                {item.badge && (
                  <Badge 
                    className={`ml-2 ${
                      item.variant === 'default' 
                        ? 'bg-[#1E5EFF] text-white' 
                        : 'bg-[#EEF2FF] text-[#1E5EFF]'
                    }`}
                  >
                    {item.badge}
                  </Badge>
                )}
                {item.meta && !item.badge && (
                  <span className="text-sm text-[#6B7280] ml-2">
                    {item.meta}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#6B7280]">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}