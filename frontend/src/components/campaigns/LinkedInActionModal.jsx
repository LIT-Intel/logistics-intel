import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { phantombusterLinkedIn } from '@/api/functions';
import { UserPlus, MessageSquare, Loader2, X } from 'lucide-react';

export default function LinkedInActionModal({ contact, action, onClose }) {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const defaultMessages = {
    connection_requests: `Hi ${contact.full_name?.split(' ')[0] || ''}, I came across your profile and would love to connect to discuss potential synergies.`,
    messages: `Hi ${contact.full_name?.split(' ')[0] || ''}, following up on our connection. Hope you're having a great week.`
  };

  useState(() => {
    setMessage(defaultMessages[action] || '');
  }, [action]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { data, error: apiError } = await phantombusterLinkedIn({
        action,
        linkedin_profiles: [contact.linkedin],
        message
      });

      if (apiError || data?.error) {
        throw new Error(apiError?.message || data?.error || 'Failed to launch LinkedIn action.');
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const actionDetails = {
    connection_requests: {
      title: 'Send Connection Request',
      icon: UserPlus,
      buttonText: 'Send Request',
    },
    messages: {
      title: 'Send LinkedIn Message',
      icon: MessageSquare,
      buttonText: 'Send Message',
    }
  };

  const details = actionDetails[action];
  const Icon = details.icon;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{details.title}</h2>
            <p className="text-sm text-gray-500">To: {contact.full_name} via LinkedIn</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Your message..."
              rows={5}
              className="w-full"
            />

            {error && <p className="text-red-600 text-sm">{error}</p>}
            {success && <p className="text-green-600 text-sm">Action successfully launched via Phantombuster!</p>}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isLoading ? 'Sending...' : details.buttonText}
              </Button>
            </div>
             <p className="text-xs text-gray-400 text-right pt-2">
                Powered by Phantombuster. Actions are queued and may take time to execute.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}