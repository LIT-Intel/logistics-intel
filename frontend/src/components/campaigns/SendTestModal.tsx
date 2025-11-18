'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

export type SendTestModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail?: string;
  onSent?: (data: { messageId: string; to: string }) => void;
};

export function SendTestModal({ open, onOpenChange, defaultEmail, onSent }: SendTestModalProps) {
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [provider, setProvider] = useState<'gmail' | 'microsoft'>('gmail');
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackLinks, setTrackLinks] = useState(true);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setEmail(defaultEmail ?? '');
    }
  }, [open, defaultEmail]);

  const handleSend = useCallback(async () => {
    if (!email.trim()) {
      toast({
        title: 'Email required',
        description: 'Enter a destination address to send a test.',
      });
      return;
    }

    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const messageId = `test_${Date.now().toString(36)}`;
      onSent?.({ messageId, to: email.trim() });
      toast({
        title: 'Test email sent',
        description: `Mock send complete via ${provider === 'gmail' ? 'Gmail' : 'Outlook'}.`,
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [email, onOpenChange, onSent, provider, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Send test email</DialogTitle>
          <DialogDescription>
            Send a preview to yourself or a teammate. This uses mock data in the demo environment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="test-email">Recipient</Label>
            <Input
              id="test-email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(value: 'gmail' | 'microsoft') => setProvider(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gmail">Gmail (mock)</SelectItem>
                <SelectItem value="microsoft">Outlook (mock)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-700">Tracking</div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Track opens</span>
              <Switch checked={trackOpens} onCheckedChange={setTrackOpens} />
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Track link clicks</span>
              <Switch checked={trackLinks} onCheckedChange={setTrackLinks} />
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading}>
            {loading ? 'Sending…' : 'Send test'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SendTestModal;
