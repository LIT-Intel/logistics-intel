/**
 * Step 2: Organization Setup
 * Collects organization name, industry, and company size
 */

import React, { useState } from 'react';
import { Building2, Zap, Users } from 'lucide-react';

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

export function Step2Organization({ onNext, initialData }: Step2OrganizationProps) {
  const [orgName, setOrgName] = useState(initialData?.orgName || '');
  const [industry, setIndustry] = useState(initialData?.industry || 'logistics');
  const [companySize, setCompanySize] = useState(initialData?.companySize || '10-50');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!orgName.trim()) newErrors.orgName = 'Organization name is required';
    if (!industry) newErrors.industry = 'Industry is required';
    if (!companySize) newErrors.companySize = 'Company size is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onNext({ orgName, industry, companySize });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Set up your organization</h2>
        <p className="mt-2 text-slate-600">Help us understand your company better</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Organization Name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Organization Name
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Your company name"
              className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-slate-900 placeholder-slate-500 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition"
            />
          </div>
          {errors.orgName && <p className="mt-1 text-sm text-red-600">{errors.orgName}</p>}
        </div>

        {/* Industry */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Industry
          </label>
          <div className="relative">
            <Zap className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition appearance-none"
            >
              <option value="logistics">Logistics & Transportation</option>
              <option value="supply-chain">Supply Chain</option>
              <option value="freight">Freight & 3PL</option>
              <option value="ecommerce">E-Commerce</option>
              <option value="manufacturing">Manufacturing</option>
              <option value="retail">Retail</option>
              <option value="other">Other</option>
            </select>
          </div>
          {errors.industry && <p className="mt-1 text-sm text-red-600">{errors.industry}</p>}
        </div>

        {/* Company Size */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Company Size
          </label>
          <div className="relative">
            <Users className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <select
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition appearance-none"
            >
              <option value="1-10">1-10 employees</option>
              <option value="10-50">10-50 employees</option>
              <option value="50-200">50-200 employees</option>
              <option value="200-1000">200-1000 employees</option>
              <option value="1000+">1000+ employees</option>
            </select>
          </div>
          {errors.companySize && (
            <p className="mt-1 text-sm text-red-600">{errors.companySize}</p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
