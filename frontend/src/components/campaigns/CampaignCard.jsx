import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Play, 
  Pause, 
  Edit3, 
  Trash2, 
  Mail, 
  Users, 
  BarChart3,
  Calendar,
  Target
} from 'lucide-react';
import { format } from 'date-fns';

export default function CampaignCard({ campaign, onToggle, onEdit, onDelete, onClick }) {
  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      paused: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-blue-100 text-blue-800',
      draft: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || colors.draft;
  };

  const getStatusIcon = (status) => {
    const icons = {
      active: Play,
      paused: Pause,
      completed: Target,
      draft: Edit3,
    };
    const Icon = icons[status] || Edit3;
    return <Icon className="w-4 h-4" />;
  };

  const openRate = campaign.sent_count > 0 ? Math.round((campaign.open_rate || 0) * 100) : 0;
  const replyRate = campaign.sent_count > 0 ? Math.round(((campaign.reply_count || 0) / campaign.sent_count) * 100) : 0;

  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none hover:shadow-xl transition-all duration-300 cursor-pointer">
      <CardHeader 
        className="pb-3"
        onClick={() => onClick && onClick(campaign)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg line-clamp-2">{campaign.name}</CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <Badge className={getStatusColor(campaign.status)}>
                {React.createElement(getStatusIcon(campaign.status), { className: "w-3 h-3 mr-1" })}
                {campaign.status}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {campaign.campaign_type?.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </div>

        <div className="text-sm text-gray-600 mt-2">
          {(() => {
            const createdAt = campaign.created_at || campaign.created_date || campaign.createdOn || Date.now();
            try { return `Created ${format(new Date(createdAt), 'MMM dd, yyyy')}`; } catch { return '' }
          })()}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Campaign Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-blue-600">{campaign.sent_count || 0}</div>
            <div className="text-xs text-gray-600">Sent</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-600">{openRate}%</div>
            <div className="text-xs text-gray-600">Open Rate</div>
          </div>
          <div>
            <div className="text-lg font-bold text-purple-600">{campaign.reply_count || 0}</div>
            <div className="text-xs text-gray-600">Replies</div>
          </div>
        </div>

        {/* Progress Bar */}
        {campaign.status === 'active' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Progress</span>
              <span className="font-medium">{campaign.sent_count || 0} / {(campaign.target_contacts || []).length}</span>
            </div>
            <Progress 
              value={
                (campaign.target_contacts || []).length > 0 
                  ? ((campaign.sent_count || 0) / (campaign.target_contacts || []).length) * 100 
                  : 0
              } 
              className="h-2" 
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(campaign.id, campaign.status);
              }}
              disabled={campaign.status === 'completed'}
              className="h-8"
            >
              {campaign.status === 'active' ? (
                <Pause className="w-3 h-3 mr-1" />
              ) : (
                <Play className="w-3 h-3 mr-1" />
              )}
              {campaign.status === 'active' ? 'Pause' : 'Start'}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(campaign);
              }}
              className="h-8"
            >
              <Edit3 className="w-3 h-3 mr-1" />
              Edit
            </Button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(campaign.id);
            }}
            className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>

        {/* Quick Stats Footer */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {(campaign.target_contacts || []).length} contacts
          </div>
          <div className="flex items-center gap-1">
            <Mail className="w-3 h-3" />
            {(campaign.sequence_steps || []).length} steps
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {campaign.status === 'active' ? 'Running' : 'Paused'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}