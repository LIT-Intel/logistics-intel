
import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Reply, Forward, Archive, Trash2, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { EmailInteraction } from '@/api/entities';

export default function EmailThreadView({ email, onClose, onReply }) {
  const [threadEmails, setThreadEmails] = useState([email]);
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadThread = useCallback(async () => {
    if (!email) return; // Add this check as email is a dependency

    try {
      // Load all emails with the same contact_id to create a thread
      const relatedEmails = await EmailInteraction.filter({ 
        contact_id: email.contact_id 
      }, '-created_date');
      setThreadEmails(relatedEmails);
    } catch (error) {
      console.error('Failed to load email thread:', error);
    }
  }, [email]); // `email` is a dependency for `loadThread` now

  useEffect(() => {
    loadThread();
  }, [loadThread]); // `loadThread` is a dependency here

  const handleReply = async () => {
    if (!replyText.trim()) {
      alert('Please enter a reply message');
      return;
    }

    setIsLoading(true);
    try {
      await EmailInteraction.create({
        contact_id: email.contact_id,
        company_id: email.company_id,
        subject: `Re: ${email.subject}`,
        body_html: replyText.replace(/\n/g, '<br>'),
        direction: 'sent',
        status: 'sent'
      });

      setShowReply(false);
      setReplyText('');
      await loadThread();
      
      if (onReply) {
        onReply();
      }
    } catch (error) {
      console.error('Failed to send reply:', error);
      alert('Failed to send reply. Please try again.');
    }
    setIsLoading(false);
  };

  const getStatusColor = (status) => {
    const colors = {
      sent: 'bg-blue-100 text-blue-800',
      delivered: 'bg-green-100 text-green-800',
      opened: 'bg-purple-100 text-purple-800',
      replied: 'bg-yellow-100 text-yellow-800',
      bounced: 'bg-red-100 text-red-800',
    };
    return colors[status] || colors.sent;
  };

  const getStatusIcon = (status) => {
    const icons = {
      sent: Clock,
      delivered: CheckCircle,
      opened: CheckCircle,
      replied: Reply,
      bounced: Trash2,
    };
    const Icon = icons[status] || Clock;
    return <Icon className="w-4 h-4" />;
  };

  if (!email) return null;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 border-b">
          <DialogTitle className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold truncate">{email.subject}</h2>
              <p className="text-sm text-gray-600 mt-1">
                Thread with Contact ID: {email.contact_id}
              </p>
            </div>
            <Badge className={getStatusColor(email.status)}>
              <span className="mr-1">{getStatusIcon(email.status)}</span>
              {email.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {/* Email Thread */}
          <div className="p-6 space-y-6">
            {threadEmails.map((threadEmail, index) => (
              <div 
                key={threadEmail.id} 
                className={`border rounded-lg p-4 ${
                  threadEmail.direction === 'sent' ? 'bg-blue-50 ml-8' : 'bg-gray-50 mr-8'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                      threadEmail.direction === 'sent' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white'
                    }`}>
                      {threadEmail.direction === 'sent' ? 'Y' : 'T'}
                    </div>
                    <div>
                      <p className="font-semibold">
                        {threadEmail.direction === 'sent' ? 'You' : 'Contact'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(threadEmail.created_date), 'MMM dd, yyyy at h:mm a')}
                      </p>
                    </div>
                  </div>
                  <Badge className={getStatusColor(threadEmail.status)}>
                    {threadEmail.status}
                  </Badge>
                </div>

                <div className="prose prose-sm max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: threadEmail.body_html }} />
                </div>

                {/* Email Tracking Info */}
                {threadEmail.direction === 'sent' && (
                  <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-500">
                    <div className="flex gap-4">
                      {threadEmail.opened_at && (
                        <span>Opened: {format(new Date(threadEmail.opened_at), 'MMM dd, h:mm a')}</span>
                      )}
                      {threadEmail.clicked_at && (
                        <span>Clicked: {format(new Date(threadEmail.clicked_at), 'MMM dd, h:mm a')}</span>
                      )}
                      {threadEmail.replied_at && (
                        <span>Replied: {format(new Date(threadEmail.replied_at), 'MMM dd, h:mm a')}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Reply Section */}
          {showReply && (
            <div className="border-t p-6 bg-gray-50">
              <h3 className="font-semibold mb-3">Reply</h3>
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply..."
                className="h-32 mb-4"
              />
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowReply(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleReply}
                  disabled={isLoading}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                >
                  <Reply className="w-4 h-4 mr-2" />
                  {isLoading ? 'Sending...' : 'Send Reply'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t p-6 bg-white">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setShowReply(!showReply)}
                className="hover:bg-blue-50"
              >
                <Reply className="w-4 h-4 mr-2" />
                Reply
              </Button>
              <Button variant="outline" disabled>
                <Forward className="w-4 h-4 mr-2" />
                Forward
              </Button>
              <Button variant="outline" disabled>
                <Archive className="w-4 h-4 mr-2" />
                Archive
              </Button>
            </div>

            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
