/**
 * Step 5: Team Invitations
 * Allows inviting team members during onboarding
 */

import React, { useState } from 'react';
import { Mail, Plus, X } from 'lucide-react';

interface TeamMember {
  id: string;
  email: string;
  role: 'member' | 'admin';
}

interface Step5TeamInviteProps {
  onNext: (data: { teamMembers: TeamMember[] }) => void;
  isOptional?: boolean;
}

export function Step5TeamInvite({ onNext, isOptional = true }: Step5TeamInviteProps) {
  const [invites, setInvites] = useState<TeamMember[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'member' | 'admin'>('member');
  const [error, setError] = useState('');

  const addMember = () => {
    setError('');

    if (!newEmail.trim()) {
      setError('Email is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setError('Invalid email address');
      return;
    }

    if (invites.some((m) => m.email === newEmail)) {
      setError('This email is already added');
      return;
    }

    setInvites([...invites, { id: Date.now().toString(), email: newEmail, role: newRole }]);
    setNewEmail('');
    setNewRole('member');
  };

  const removeMember = (id: string) => {
    setInvites(invites.filter((m) => m.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ teamMembers: invites });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Invite your team</h2>
        <p className="mt-2 text-slate-600">
          {isOptional ? 'Add team members now or skip this step' : 'Add at least one team member'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Invite Form */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email Address
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addMember()}
                  placeholder="colleague@company.com"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-slate-900 placeholder-slate-500 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition"
                />
              </div>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'member' | 'admin')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                onClick={addMember}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg transition-colors font-medium flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>
        </div>

        {/* Invited Members List */}
        {invites.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900 mb-3">Invited members</h3>
            <div className="space-y-2">
              {invites.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between bg-white p-3 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{member.email}</p>
                    <p className="text-xs text-slate-600 capitalize">{member.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMember(member.id)}
                    className="text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
          <p className="text-sm text-blue-900">
            💡 Team members will receive an invitation email and can join your workspace with
            the role you assign.
          </p>
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-4">
          {isOptional && (
            <button
              type="button"
              onClick={() => onNext({ teamMembers: [] })}
              className="flex-1 border-2 border-slate-300 hover:border-slate-400 text-slate-900 font-semibold py-3 rounded-lg transition-colors"
            >
              Skip for now
            </button>
          )}
          <button
            type="submit"
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
