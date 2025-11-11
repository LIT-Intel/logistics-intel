export type CampaignStatus = 'running' | 'paused' | 'draft';

export type CampaignMetrics = {
  enrolled: number;
  sent: number;
  delivered: number;
  opens: number;
  replies: number;
  bounces: number;
};

export type CampaignSummary = {
  id: string;
  name: string;
  status: CampaignStatus | string;
  updatedAt: string;
  stats: CampaignMetrics;
};

export type SequenceStepType = 'email' | 'linkedin' | 'wait';

export type SequenceStep = {
  id: string;
  type: SequenceStepType;
  title: string;
  waitDays?: number;
  template?: {
    subject: string;
    body: string;
  };
  action?: 'connect' | 'message' | 'inmail';
  message?: string;
};

export type CampaignTemplate = {
  id: string;
  name: string;
  category: 'Prospecting' | 'Follow-up' | 'Breakup' | string;
  subject: string;
  body: string;
  description?: string;
};

export type AudienceContact = {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  status?: string;
};

export type CampaignDraft = {
  id: string;
  name: string;
  status: CampaignStatus | string;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  signature: string;
  body: string;
  metrics: CampaignMetrics;
  updatedAt: string;
  steps: SequenceStep[];
};
