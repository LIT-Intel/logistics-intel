import React, { useState } from 'react';
import { Building2, Zap } from 'lucide-react';

interface Step2OrganizationProps {
  onNext: (data: {
    orgName: string;
    industry: string;
    companySize: string;
  }) => void;
  initialData?: {
    orgName?: string;
    industry?: string;
    companySize?: string;
  };
}

const INDUSTRIES = [
  { value: 'logistics',     label: 'Logistics & Transportation' },
  { value: 'supply-chain',  label: 'Supply Chain' },
  { value: 'freight',       label: 'Freight & 3PL' },
  { value: 'ecommerce',     label: 'E-Commerce' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'retail',        label: 'Retail' },
  { value: 'other',         label: 'Other' },
];

const COMPANY_SIZES = [
  { value: '1-10',      label: '1–10' },
  { value: '10-50',     label: '10–50' },
  { value: '50-200',    label: '50–200' },
  { value: '200-1000',  label: '200–1k' },
  { value: '1000+',     label: '1k+' },
];

export function Step2Organization({ onNext, initialData }: Step2OrganizationProps) {
  const [orgName, setOrgName]       = useState(initialData?.orgName || '');
  const [industry, setIndustry]     = useState(initialData?.industry || 'logistics');
  const [companySize, setCompanySize] = useState(initialData?.companySize || '10-50');
  const [errors, setErrors]         = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!orgName.trim()) e.orgName = 'Organization name is required';
    if (!industry) e.industry = 'Industry is required';
    if (!companySize) e.companySize = 'Company size is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) onNext({ orgName, industry, companySize });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Tell us about your company</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          We'll tailor your workspace experience based on your setup.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Organization Name
          </label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Freight Co."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
            />
          </div>
          {errors.orgName && <p className="mt-1 text-xs text-red-600">{errors.orgName}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Industry</label>
          <div className="relative">
            <Zap className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
            >
              {INDUSTRIES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          {errors.industry && <p className="mt-1 text-xs text-red-600">{errors.industry}</p>}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Company Size
          </label>
          <div className="flex flex-wrap gap-2">
            {COMPANY_SIZES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCompanySize(value)}
                className={[
                  'rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all',
                  companySize === value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
          {errors.companySize && <p className="mt-1 text-xs text-red-600">{errors.companySize}</p>}
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
