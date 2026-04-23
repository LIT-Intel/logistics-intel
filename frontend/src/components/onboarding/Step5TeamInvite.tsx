import React, { useState } from 'react';
import { Mail, Plus, X, Users } from 'lucide-react';

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
  const [invites, setInvites]   = useState<TeamMember[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole]   = useState<'member' | 'admin'>('member');
  const [error, setError]       = useState('');

  const addMember = () => {
    setError('');
    if (!newEmail.trim()) { setError('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { setError('Invalid email address'); return; }
    if (invites.some((m) => m.email === newEmail)) { setError('This email is already added'); return; }
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
        <p className="mt-1.5 text-sm text-slate-500">
          They'll receive an email with a secure link to join your workspace.
          {isOptional && ' You can also skip this and invite teammates later from Settings.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Add invite row */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Add a team member
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMember(); } }}
                placeholder="colleague@company.com"
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              />
            </div>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'member' | 'admin')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              onClick={addMember}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>

        {/* Invited list */}
        {invites.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900">
                {invites.length} {invites.length === 1 ? 'invite' : 'invites'} queued
              </h3>
            </div>
            <div className="space-y-2">
              {invites.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{member.email}</p>
                    <p className="text-xs capitalize text-slate-500">{member.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMember(member.id)}
                    className="text-slate-400 transition hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Invite emails are sent immediately after you complete setup.
            </p>
          </div>
        )}

        {/* Info */}
        {invites.length === 0 && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              💡 Team members receive a branded email with a secure one-click join link scoped to your workspace.
            </p>
          </div>
        )}

        {/* CTAs */}
        <div className="flex gap-3">
          {isOptional && (
            <button
              type="button"
              onClick={() => onNext({ teamMembers: [] })}
              className="flex-1 rounded-xl border-2 border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Skip for now
            </button>
          )}
          <button
            type="submit"
            className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            {invites.length > 0 ? 'Send Invites & Continue' : 'Continue →'}
          </button>
        </div>
      </form>
    </div>
  );
}
