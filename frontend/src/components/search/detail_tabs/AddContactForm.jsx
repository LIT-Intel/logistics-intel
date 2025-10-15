import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AddContactForm({ onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    full_name: '',
    title: '',
    dept: '',
    email: '',
    phone: '',
    linkedin: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      alert('Full name is required');
      return;
    }
    onSubmit(formData);
    setFormData({
      full_name: '',
      title: '',
      dept: '',
      email: '',
      phone: '',
      linkedin: ''
    });
  };

  const departments = [
    'Logistics',
    'Supply Chain',
    'Procurement', 
    'Operations',
    'Sales',
    'Marketing',
    'Finance',
    'Executive',
    'Other'
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Full Name (Required)</Label>
          <Input
            value={formData.full_name}
            onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
            placeholder="Enter full name"
            required
          />
        </div>
        <div>
          <Label>Job Title</Label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., Logistics Manager"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Department</Label>
          <Select value={formData.dept} onValueChange={(value) => setFormData(prev => ({ ...prev, dept: value }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map(dept => (
                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Email Address</Label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            placeholder="contact@company.com"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Phone Number</Label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="+1 (555) 123-4567"
          />
        </div>
        <div>
          <Label>LinkedIn Profile URL</Label>
          <Input
            value={formData.linkedin}
            onChange={(e) => setFormData(prev => ({ ...prev, linkedin: e.target.value }))}
            placeholder="https://linkedin.com/in/profile"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
          Save Contact
        </Button>
      </div>
    </form>
  );
}