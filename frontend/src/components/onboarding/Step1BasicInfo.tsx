import React, { useState } from 'react';
import { User, Mail, TrendingUp, Settings, BarChart2, DollarSign, MoreHorizontal } from 'lucide-react';

interface Step1BasicInfoProps {
  onNext: (data: { fullName: string; email: string; role: string }) => void;
  initialData?: {
    fullName?: string;
    email?: string;
    role?: string;
  };
}

const ROLES = [
  { value: 'sales',      label: 'Sales Rep',         icon: TrendingUp },
  { value: 'operations', label: 'Operations',         icon: Settings },
  { value: 'management', label: 'Manager / Director', icon: BarChart2 },
  { value: 'finance',    label: 'Finance',            icon: DollarSign },
  { value: 'other',      label: 'Other',              icon: MoreHorizontal },
];

export function Step1BasicInfo({ onNext, initialData }: Step1BasicInfoProps) {
  const [fullName, setFullName] = useState(initialData?.fullName || '');
  const [email, setEmail]       = useState(initialData?.email || '');
  const [role, setRole]         = useState(initialData?.role || 'sales');
  const [errors, setErrors]     = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Full name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email address';
    if (!role) e.role = 'Please select a role';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) onNext({ fullName, email, role });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Welcome to Logistics Intel</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          Let's set up your account — takes about 5 minutes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
            />
          </div>
          {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Work Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
            />
          </div>
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Your Role</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ROLES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                className={[
                  'flex items-center gap-2.5 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all',
                  role === value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
              >
                <Icon className={`h-4 w-4 shrink-0 ${role === value ? 'text-indigo-500' : 'text-slate-400'}`} />
                {label}
              </button>
            ))}
          </div>
          {errors.role && <p className="mt-1 text-xs text-red-600">{errors.role}</p>}
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          Continue →
        </button>
      </form>
    </div>
  );
}
