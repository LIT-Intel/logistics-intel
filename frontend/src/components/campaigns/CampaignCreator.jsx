
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/api/entities';
import { X, Plus, FileText, Trash2, Mail, UserPlus, MessageSquare } from 'lucide-react';
import TemplateSelector from './TemplateSelector';
import { api } from '@/lib/api';

export default function CampaignCreator({ campaign, onClose, onSave }) {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    campaign_type: 'email_only',
    status: 'draft', // Retained as it was in original code, not explicitly removed in outline
    email_template: '',
    linkedin_template: '',
    subject_line: '',
    target_companies: [], // Added as per outline
    target_contacts: [], // Added as per outline
    sequence_steps: []
  });
  const [availableContacts, setAvailableContacts] = useState([]); // Added as per outline
  const [isLoading, setIsLoading] = useState(false); // Added as per outline

  useEffect(() => {
    if (campaign) {
      setFormData({
        name: campaign.name || '',
        campaign_type: campaign.campaign_type || 'email_only',
        status: campaign.status || 'draft',
        email_template: campaign.email_template || '',
        linkedin_template: campaign.linkedin_template || '',
        subject_line: campaign.subject_line || '',
        target_companies: campaign.target_companies || [], // Set from campaign data
        target_contacts: campaign.target_contacts || [],   // Set from campaign data
        sequence_steps: campaign.sequence_steps || []
      });
    }
  }, [campaign]);

  // New useEffect to load contacts
  useEffect(() => {
    const loadContacts = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/crm/leads?limit=100');
        const rows = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
        setAvailableContacts(rows.map(l => ({ email: l.email, full_name: l.contact_name })));
      } catch (error) {
        console.error('Failed to load available contacts:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadContacts();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const user = await User.me().catch(() => null);
      const payload = {
        name: formData.name,
        type: formData.campaign_type,
        status: formData.status,
        steps: (formData.sequence_steps || []).map(s => ({
          type: s.type,
          wait_days: s.wait_days,
          subject: s.subject,
          template: s.template,
        })),
        audience: {
          emails: formData.target_contacts,
          companies: formData.target_companies,
        },
        subject_line: formData.subject_line,
        email_template: formData.email_template,
        linkedin_template: formData.linkedin_template,
        created_by: user?.email || undefined,
      };

      await api.post('/crm/campaigns', payload);
      onSave && onSave(payload);
      onClose && onClose();
    } catch (error) {
      console.error('Error saving campaign:', error);
      alert('Failed to save campaign. Please try again.');
    }
  };

  const handleTemplateSelect = (template) => {
    setFormData(prev => ({
      ...prev,
      name: template.name,
      // Campaign type is not explicitly set by template selection in this updated flow,
      // it remains 'email_only' by default or what the user selects manually.
      email_template: template.steps.find(s => s.type === 'email')?.body || '',
      subject_line: template.steps.find(s => s.type === 'email')?.subject || '',
      linkedin_template: template.steps.find(s => s.type === 'linkedin_message')?.message || '',
      sequence_steps: template.steps.map((step, index) => ({
        step_number: index + 1,
        type: step.type,
        wait_days: step.day_offset,
        template: step.body || step.message || '', // Use body for email, message for LinkedIn
        subject: step.subject || '' // Subject only for email steps
      }))
    }));
    setShowTemplateSelector(false);
  };

  // determineType function removed as per outline implication (no longer used by handleTemplateSelect)

  const addStep = () => {
    const newStep = {
      step_number: formData.sequence_steps.length + 1,
      type: 'email',
      wait_days: formData.sequence_steps.length === 0 ? 0 : 3,
      template: '',
      subject: ''
    };
    setFormData({
      ...formData,
      sequence_steps: [...formData.sequence_steps, newStep]
    });
  };

  const updateStep = (index, field, value) => {
    const updatedSteps = [...formData.sequence_steps];
    updatedSteps[index][field] = value;
    setFormData({
      ...formData,
      sequence_steps: updatedSteps
    });
  };

  const removeStep = (index) => {
    const updatedSteps = formData.sequence_steps.filter((_, idx) => idx !== index);
    // Renumber steps
    updatedSteps.forEach((step, idx) => {
      step.step_number = idx + 1;
    });
    setFormData({
      ...formData,
      sequence_steps: updatedSteps
    });
  };

  const getStepIcon = (type) => {
    switch (type) {
      case 'email': return <Mail className="w-4 h-4" />;
      case 'linkedin': return <UserPlus className="w-4 h-4" />;
      case 'linkedin_message': return <MessageSquare className="w-4 h-4" />;
      default: return <Mail className="w-4 h-4" />;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
          <div className="p-6 border-b flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">
              {campaign ? 'Edit Campaign' : 'Create New Campaign'}
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowTemplateSelector(true)}
              >
                Use Template
              </Button>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Basic Information */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Campaign Name</label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Q1 Manufacturing Outreach"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Campaign Type</label>
                    <Select value={formData.campaign_type} onValueChange={(value) => setFormData({ ...formData, campaign_type: value })}>
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
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
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

                {/* Target Companies */}
                <div>
                  <label className="block text-sm font-medium mb-1">Target Companies (comma-separated)</label>
                  <Textarea
                    value={formData.target_companies.join(', ')}
                    onChange={(e) => setFormData({ ...formData, target_companies: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    placeholder="e.g., Google, Microsoft, Apple"
                    rows={2}
                  />
                </div>

                {/* Target Contacts */}
                <div>
                  <label className="block text-sm font-medium mb-1">Target Contacts (email addresses, comma-separated)</label>
                  <Textarea
                    value={formData.target_contacts.join(', ')}
                    onChange={(e) => setFormData({ ...formData, target_contacts: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    placeholder="e.g., john.doe@example.com, jane.smith@example.com"
                    rows={3}
                  />
                  {isLoading ? (
                    <p className="text-sm text-gray-500 mt-1">Loading available contacts...</p>
                  ) : (
                    availableContacts.length > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        Available: {availableContacts.map(c => c.email).join(', ').substring(0, 100)}{availableContacts.length > 5 ? '...' : ''}
                      </p>
                    )
                  )}
                </div>
              </div>

              {/* Sequence Steps */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Campaign Sequence</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addStep}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Step
                  </Button>
                </div>

                {formData.sequence_steps.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                    <p className="text-gray-500 mb-3">No sequence steps yet</p>
                    <Button type="button" variant="outline" onClick={() => setShowTemplateSelector(true)}>
                      <FileText className="w-4 h-4 mr-2" />
                      Use Template
                    </Button>
                    <span className="text-gray-400 mx-2">or</span>
                    <Button type="button" variant="outline" onClick={addStep}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Step
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.sequence_steps.map((step, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                              {step.step_number}
                            </div>
                            <span className="font-medium">Step {step.step_number}</span>
                            {getStepIcon(step.type)}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeStep(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="grid md:grid-cols-3 gap-4 mb-4">
                          <div>
                            <label className="block text-xs font-medium mb-1">Type</label>
                            <Select
                              value={step.type}
                              onValueChange={(value) => updateStep(index, 'type', value)}
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
                            <label className="block text-xs font-medium mb-1">Wait Days</label>
                            <Input
                              type="number"
                              min="0"
                              value={step.wait_days}
                              onChange={(e) => updateStep(index, 'wait_days', parseInt(e.target.value) || 0)}
                            />
                          </div>
                          {step.type === 'email' && (
                            <div>
                              <label className="block text-xs font-medium mb-1">Subject</label>
                              <Input
                                value={step.subject || ''}
                                onChange={(e) => updateStep(index, 'subject', e.target.value)}
                                placeholder="Email subject..."
                              />
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-medium mb-1">
                            {step.type === 'email' ? 'Email Content' : 'LinkedIn Message'}
                          </label>
                          <Textarea
                            value={step.template}
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

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit">
                  {campaign ? 'Update Campaign' : 'Create Campaign'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {showTemplateSelector && (
        <TemplateSelector
          onSelectTemplate={handleTemplateSelect}
          onClose={() => setShowTemplateSelector(false)}
        />
      )}
    </>
  );
}
