import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/api/entities';
import { Plus, FileText, Trash2, Mail, UserPlus, MessageSquare, Loader2 } from 'lucide-react';
import TemplateSelector from './TemplateSelector';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type CampaignStep = {
  step_number: number;
  type: 'email' | 'linkedin' | 'linkedin_message';
  wait_days: number;
  subject?: string;
  template?: string;
};

type CampaignDraft = {
  name: string;
  campaign_type: string;
  status: string;
  email_template: string;
  linkedin_template: string;
  subject_line: string;
  target_companies: string[];
  target_contacts: string[];
  sequence_steps: CampaignStep[];
  created_by?: string;
  updated_by?: string;
};

type CampaignCreatorProps = {
  campaign?: any;
  onClose?: () => void;
  onSave?: (campaign: any) => void;
};

type ContactOption = {
  email?: string;
  full_name?: string;
};

const emptyForm: CampaignDraft = {
  name: '',
  campaign_type: 'email_only',
  status: 'draft',
  email_template: '',
  linkedin_template: '',
  subject_line: '',
  target_companies: [],
  target_contacts: [],
  sequence_steps: [],
};

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeSteps(value: unknown): CampaignStep[] {
  if (!Array.isArray(value)) return [];

  return value.map((step: any, index) => ({
    step_number: Number(step?.step_number ?? index + 1),
    type: step?.type === 'linkedin' || step?.type === 'linkedin_message' ? step.type : 'email',
    wait_days: Number(step?.wait_days ?? step?.day_offset ?? 0),
    subject: String(step?.subject ?? ''),
    template: String(step?.template ?? step?.body ?? step?.message ?? ''),
  }));
}

function buildFormData(source?: any): CampaignDraft {
  const draft = source?.metrics?.draft ?? source?.draft ?? source ?? {};

  return {
    name: String(draft?.name ?? source?.name ?? ''),
    campaign_type: String(draft?.campaign_type ?? source?.campaign_type ?? source?.channel ?? 'email_only'),
    status: String(draft?.status ?? source?.status ?? 'draft'),
    email_template: String(draft?.email_template ?? source?.email_template ?? ''),
    linkedin_template: String(draft?.linkedin_template ?? source?.linkedin_template ?? ''),
    subject_line: String(draft?.subject_line ?? source?.subject_line ?? ''),
    target_companies: normalizeStringArray(draft?.target_companies ?? source?.target_companies),
    target_contacts: normalizeStringArray(draft?.target_contacts ?? source?.target_contacts),
    sequence_steps: normalizeSteps(draft?.sequence_steps ?? source?.sequence_steps),
    created_by: typeof draft?.created_by === 'string' ? draft.created_by : undefined,
    updated_by: typeof draft?.updated_by === 'string' ? draft.updated_by : undefined,
  };
}

function getStepIcon(type: CampaignStep['type']) {
  switch (type) {
    case 'email':
      return <Mail className="w-4 h-4" />;
    case 'linkedin':
      return <UserPlus className="w-4 h-4" />;
    case 'linkedin_message':
      return <MessageSquare className="w-4 h-4" />;
    default:
      return <Mail className="w-4 h-4" />;
  }
}

async function getCurrentUserIdentity() {
  const [authResult, entityResult] = await Promise.allSettled([
    supabase.auth.getUser(),
    User.me(),
  ]);

  const authUser = authResult.status === 'fulfilled' ? authResult.value?.data?.user : null;
  const modelUser = entityResult.status === 'fulfilled' ? entityResult.value : null;

  return {
    id: authUser?.id ?? modelUser?.id ?? null,
    email: authUser?.email ?? modelUser?.email ?? null,
  };
}

async function saveCampaignRecord(campaignId: string | undefined, draftPayload: CampaignDraft) {
  const identity = await getCurrentUserIdentity();
  const timestamp = new Date().toISOString();

  const metricsPayload = {
    draft: draftPayload,
    audience: {
      companies: draftPayload.target_companies,
      contacts: draftPayload.target_contacts,
      companyCount: draftPayload.target_companies.length,
      contactCount: draftPayload.target_contacts.length,
    },
    sequence: draftPayload.sequence_steps,
  };

  const rowVariants: Record<string, any>[] = [
    {
      name: draftPayload.name || 'New Campaign',
      status: draftPayload.status || 'draft',
      channel: draftPayload.campaign_type || 'email_only',
      campaign_type: draftPayload.campaign_type || 'email_only',
      subject_line: draftPayload.subject_line || null,
      email_template: draftPayload.email_template || null,
      linkedin_template: draftPayload.linkedin_template || null,
      target_companies: draftPayload.target_companies,
      target_contacts: draftPayload.target_contacts,
      sequence_steps: draftPayload.sequence_steps,
      metrics: metricsPayload,
      metadata: metricsPayload,
      audience_count: draftPayload.target_contacts.length || draftPayload.target_companies.length || 0,
      created_by: draftPayload.created_by || identity.email,
      updated_by: identity.email,
      user_id: identity.id,
      owner_user_id: identity.id,
      updated_at: timestamp,
    },
    {
      name: draftPayload.name || 'New Campaign',
      status: draftPayload.status || 'draft',
      channel: draftPayload.campaign_type || 'email_only',
      campaign_type: draftPayload.campaign_type || 'email_only',
      metrics: metricsPayload,
      metadata: metricsPayload,
      updated_by: identity.email,
      updated_at: timestamp,
    },
    {
      name: draftPayload.name || 'New Campaign',
      status: draftPayload.status || 'draft',
      channel: draftPayload.campaign_type || 'email_only',
      metrics: { draft: draftPayload },
    },
  ];

  let lastError: any = null;

  for (const row of rowVariants) {
    const payload = campaignId
      ? { ...row }
      : {
          ...row,
          created_at: timestamp,
        };

    const query = campaignId
      ? supabase.from('lit_campaigns').update(payload).eq('id', campaignId)
      : supabase.from('lit_campaigns').insert(payload);

    const { data, error } = await query.select('*').maybeSingle();

    if (!error) {
      return data ?? payload;
    }

    lastError = error;

    const message = String(error?.message ?? '').toLowerCase();
    const details = String(error?.details ?? '').toLowerCase();

    if (
      !message.includes('column') &&
      !message.includes('schema cache') &&
      !details.includes('column')
    ) {
      break;
    }
  }

  throw lastError;
}

export default function CampaignCreator({ campaign, onClose, onSave }: CampaignCreatorProps) {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [formData, setFormData] = useState<CampaignDraft>(() => buildFormData(campaign));
  const [availableContacts, setAvailableContacts] = useState<ContactOption[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData(buildFormData(campaign));
  }, [campaign]);

  useEffect(() => {
    let active = true;

    const loadContacts = async () => {
      setIsLoadingContacts(true);
      try {
        const res = await api.get('/crm/leads?limit=100');
        const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];

        if (!active) return;

        setAvailableContacts(
          rows
            .map((lead: any) => ({
              email: lead?.email,
              full_name: lead?.contact_name ?? lead?.full_name ?? lead?.name,
            }))
            .filter((lead: ContactOption) => Boolean(lead.email))
        );
      } catch (error) {
        console.error('Failed to load available contacts:', error);
      } finally {
        if (active) {
          setIsLoadingContacts(false);
        }
      }
    };

    loadContacts();

    return () => {
      active = false;
    };
  }, []);

  const contactPreview = useMemo(() => {
    const preview = availableContacts
      .map((contact) => contact.email)
      .filter(Boolean)
      .slice(0, 5)
      .join(', ');

    return preview;
  }, [availableContacts]);

  const setField = <K extends keyof CampaignDraft>(field: K, value: CampaignDraft[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTemplateSelect = (template: any) => {
    const steps = Array.isArray(template?.steps) ? template.steps : [];

    setFormData((prev) => ({
      ...prev,
      name: template?.name || prev.name,
      email_template: steps.find((step: any) => step?.type === 'email')?.body || prev.email_template,
      subject_line: steps.find((step: any) => step?.type === 'email')?.subject || prev.subject_line,
      linkedin_template:
        steps.find((step: any) => step?.type === 'linkedin_message')?.message || prev.linkedin_template,
      sequence_steps: steps.map((step: any, index: number) => ({
        step_number: index + 1,
        type: step?.type === 'linkedin' || step?.type === 'linkedin_message' ? step.type : 'email',
        wait_days: Number(step?.day_offset ?? step?.wait_days ?? 0),
        template: step?.body || step?.message || '',
        subject: step?.subject || '',
      })),
    }));

    setShowTemplateSelector(false);
  };

  const addStep = () => {
    setFormData((prev) => ({
      ...prev,
      sequence_steps: [
        ...prev.sequence_steps,
        {
          step_number: prev.sequence_steps.length + 1,
          type: 'email',
          wait_days: prev.sequence_steps.length === 0 ? 0 : 3,
          template: '',
          subject: '',
        },
      ],
    }));
  };

  const updateStep = (index: number, field: keyof CampaignStep, value: string | number) => {
    setFormData((prev) => {
      const nextSteps = [...prev.sequence_steps];
      nextSteps[index] = {
        ...nextSteps[index],
        [field]: value,
      } as CampaignStep;
      return { ...prev, sequence_steps: nextSteps };
    });
  };

  const removeStep = (index: number) => {
    setFormData((prev) => {
      const nextSteps = prev.sequence_steps
        .filter((_, stepIndex) => stepIndex !== index)
        .map((step, stepIndex) => ({
          ...step,
          step_number: stepIndex + 1,
        }));

      return {
        ...prev,
        sequence_steps: nextSteps,
      };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      alert('Campaign name is required.');
      return;
    }

    const normalizedDraft: CampaignDraft = {
      ...formData,
      name: formData.name.trim(),
      target_companies: normalizeStringArray(formData.target_companies),
      target_contacts: normalizeStringArray(formData.target_contacts),
      sequence_steps: normalizeSteps(formData.sequence_steps),
    };

    setIsSaving(true);

    try {
      const identity = await getCurrentUserIdentity();
      normalizedDraft.created_by = normalizedDraft.created_by || identity.email || undefined;
      normalizedDraft.updated_by = identity.email || undefined;

      const savedCampaign = await saveCampaignRecord(campaign?.id, normalizedDraft);

      onSave?.({
        ...savedCampaign,
        metrics: {
          ...(savedCampaign?.metrics ?? {}),
          draft: normalizedDraft,
        },
      });
      onClose?.();
    } catch (error: any) {
      console.error('Error saving campaign:', error);
      const errorMessage =
        error?.message || error?.details || 'Failed to save campaign. Please try again.';
      alert(`Failed to save campaign. ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between border-b p-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {campaign ? 'Edit Campaign' : 'Create New Campaign'}
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={() => setShowTemplateSelector(true)}>
                Use Template
              </Button>
              <Button variant="outline" type="button" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Campaign Name</label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setField('name', e.target.value)}
                    placeholder="e.g., Q1 Manufacturing Outreach"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Campaign Type</label>
                    <Select
                      value={formData.campaign_type}
                      onValueChange={(value) => setField('campaign_type', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email_only">Email Only</SelectItem>
                        <SelectItem value="linkedin_only">LinkedIn Only</SelectItem>
                        <SelectItem value="email_linkedin_sequence">Email + LinkedIn</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Status</label>
                    <Select value={formData.status} onValueChange={(value) => setField('status', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Target Companies (comma-separated)</label>
                  <Textarea
                    value={formData.target_companies.join(', ')}
                    onChange={(e) => setField('target_companies', normalizeStringArray(e.target.value))}
                    placeholder="e.g., Google, Microsoft, Apple"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Target Contacts (email addresses, comma-separated)
                  </label>
                  <Textarea
                    value={formData.target_contacts.join(', ')}
                    onChange={(e) => setField('target_contacts', normalizeStringArray(e.target.value))}
                    placeholder="e.g., john.doe@example.com, jane.smith@example.com"
                    rows={3}
                  />
                  {isLoadingContacts ? (
                    <p className="mt-1 text-sm text-gray-500">Loading available contacts...</p>
                  ) : availableContacts.length > 0 ? (
                    <p className="mt-1 text-sm text-gray-500">
                      Available: {contactPreview}
                      {availableContacts.length > 5 ? '...' : ''}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Campaign Sequence</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addStep}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Step
                  </Button>
                </div>

                {formData.sequence_steps.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed border-gray-300 py-8 text-center">
                    <p className="mb-3 text-gray-500">No sequence steps yet</p>
                    <Button type="button" variant="outline" onClick={() => setShowTemplateSelector(true)}>
                      <FileText className="mr-2 h-4 w-4" />
                      Use Template
                    </Button>
                    <span className="mx-2 text-gray-400">or</span>
                    <Button type="button" variant="outline" onClick={addStep}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Step
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.sequence_steps.map((step, index) => (
                      <div key={`${step.step_number}-${index}`} className="rounded-lg border bg-gray-50 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                              {step.step_number}
                            </div>
                            <span className="font-medium">Step {step.step_number}</span>
                            {getStepIcon(step.type)}
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className={`mb-4 grid gap-4 ${step.type === 'email' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                          <div>
                            <label className="mb-1 block text-xs font-medium">Type</label>
                            <Select
                              value={step.type}
                              onValueChange={(value) =>
                                updateStep(index, 'type', value as CampaignStep['type'])
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="email">Email</SelectItem>
                                <SelectItem value="linkedin">LinkedIn Connect</SelectItem>
                                <SelectItem value="linkedin_message">LinkedIn Message</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">Wait Days</label>
                            <Input
                              type="number"
                              min="0"
                              value={step.wait_days}
                              onChange={(e) =>
                                updateStep(index, 'wait_days', Number.parseInt(e.target.value || '0', 10) || 0)
                              }
                            />
                          </div>
                          {step.type === 'email' ? (
                            <div>
                              <label className="mb-1 block text-xs font-medium">Subject</label>
                              <Input
                                value={step.subject || ''}
                                onChange={(e) => updateStep(index, 'subject', e.target.value)}
                                placeholder="Email subject..."
                              />
                            </div>
                          ) : null}
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium">
                            {step.type === 'email' ? 'Email Content' : 'LinkedIn Message'}
                          </label>
                          <Textarea
                            value={step.template || ''}
                            onChange={(e) => updateStep(index, 'template', e.target.value)}
                            placeholder={step.type === 'email' ? 'Email body...' : 'LinkedIn message...'}
                            rows={4}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t pt-6">
                <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : campaign ? (
                    'Update Campaign'
                  ) : (
                    'Create Campaign'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {showTemplateSelector ? (
        <TemplateSelector
          onSelectTemplate={handleTemplateSelect}
          onClose={() => setShowTemplateSelector(false)}
        />
      ) : null}
    </>
  );
}
