'use client';

import { useMemo, useState } from 'react';
import { BookOpen, FileText, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { CampaignDraft, CampaignTemplate } from './types';
import { TemplatePicker } from './TemplatePicker';
import { SendTestModal } from './SendTestModal';

export type CampaignEditorProps = {
  draft: CampaignDraft;
  onDraftChange: (draft: CampaignDraft) => void;
  templates: CampaignTemplate[];
  fromOptions: string[];
  onSave?: (draft: CampaignDraft) => Promise<void> | void;
  onTestSent?: (result: { messageId: string; to: string }) => void;
};

const SAMPLE_TOKENS: Record<string, string> = {
  first_name: 'Alex',
  company: 'Aurora Supply Co.',
  title: 'Logistics Lead',
};

function renderPreview(content: string) {
  return content.replace(/\{\{(.*?)\}\}/g, (_, token) => SAMPLE_TOKENS[token.trim()] ?? token.trim());
}

export function CampaignEditor({ draft, onDraftChange, templates, fromOptions, onSave, onTestSent }: CampaignEditorProps) {
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [sendTestOpen, setSendTestOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const previewSubject = useMemo(() => renderPreview(draft.subject || ''), [draft.subject]);
  const previewBody = useMemo(() => renderPreview(draft.body || ''), [draft.body]);

  const handleSave = async () => {
    if (!onSave) return;
    try {
      setSaving(true);
      await onSave(draft);
      toast({ title: 'Draft saved', description: 'Your campaign draft has been updated.' });
    } catch (error: any) {
      toast({
        title: 'Save failed',
        description: error?.message ?? 'Unable to save draft right now.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
        <Card className="rounded-3xl border-slate-200">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-800">
              <FileText className="h-4 w-4 text-indigo-500" />
              Campaign email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={draft.subject}
                  onChange={(event) => onDraftChange({ ...draft, subject: event.target.value })}
                  placeholder="Quick idea for your logistics ops"
                  className="rounded-2xl"
                />
              </div>
              <div className="space-y-2">
                <Label>From address</Label>
                <Select
                  value={draft.fromEmail}
                  onValueChange={(value) => onDraftChange({ ...draft, fromEmail: value })}
                >
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Choose sender" />
                  </SelectTrigger>
                  <SelectContent>
                    {fromOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>From name</Label>
                <Input
                  value={draft.fromName}
                  onChange={(event) => onDraftChange({ ...draft, fromName: event.target.value })}
                  placeholder="Valesco Raymond"
                  className="rounded-2xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Reply-to (optional)</Label>
                <Input
                  value={draft.replyTo ?? ''}
                  onChange={(event) => onDraftChange({ ...draft, replyTo: event.target.value })}
                  placeholder="reply@company.com"
                  className="rounded-2xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Email body</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setTemplateDialogOpen(true)}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-indigo-500" />
                  Insert template
                </Button>
              </div>
              <Textarea
                value={draft.body}
                onChange={(event) => onDraftChange({ ...draft, body: event.target.value })}
                rows={10}
                className="rounded-2xl"
                placeholder="Hi {{first_name}},&#10;&#10;We help brands like {{company}} reduce landed cost by 8-12%..."
              />
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-700">
                  {'{{first_name}}'}
                </Badge>
                <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-700">
                  {'{{company}}'}
                </Badge>
                <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-700">
                  {'{{title}}'}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email signature</Label>
              <Textarea
                value={draft.signature}
                onChange={(event) => onDraftChange({ ...draft, signature: event.target.value })}
                rows={4}
                className="rounded-2xl"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="rounded-2xl"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save draft'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                onClick={() => setSendTestOpen(true)}
              >
                Send test
              </Button>
              <Button type="button" variant="outline" className="rounded-2xl" disabled>
                Schedule (coming soon)
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-slate-200 bg-slate-50/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <BookOpen className="h-4 w-4 text-indigo-500" />
              Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Subject</div>
              <div className="mt-1 text-sm font-semibold text-slate-800">{previewSubject || '—'}</div>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Body</div>
              <div className="mt-2 whitespace-pre-line leading-relaxed">{previewBody || 'Start typing to preview your outreach copy.'}</div>
              {draft.signature ? (
                <div className="mt-4 whitespace-pre-line text-slate-600">{draft.signature}</div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
              Tokens render using mock data (e.g., {SAMPLE_TOKENS.first_name}, {SAMPLE_TOKENS.company}) so you can see the final experience.
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-3xl rounded-3xl">
          <DialogHeader>
            <DialogTitle>Select a template</DialogTitle>
          </DialogHeader>
          <TemplatePicker
            templates={templates}
            onSelect={(template) => {
              onDraftChange({
                ...draft,
                subject: template.subject,
                body: template.body,
              });
              setTemplateDialogOpen(false);
              toast({
                title: 'Template applied',
                description: `${template.name} has been inserted into the editor.`,
              });
            }}
          />
        </DialogContent>
      </Dialog>

      <SendTestModal
        open={sendTestOpen}
        onOpenChange={setSendTestOpen}
        defaultEmail={draft.fromEmail}
        onSent={onTestSent}
      />
    </>
  );
}

export default CampaignEditor;
