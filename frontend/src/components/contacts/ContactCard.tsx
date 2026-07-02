import React from 'react';
import { Mail, Phone, LinkedinIcon, MapPin, Briefcase, Award, Database, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import ContactAvatar from '@/components/command-center/ContactAvatar';
import AddToListPicker from '@/features/pulse/AddToListPicker';
import type { ContactCore } from '@/types/contacts';

interface ContactCardProps {
  contact: ContactCore & { company_id?: string };
  onViewProfile?: (contact: ContactCore) => void;
  onEnrich?: (contact: ContactCore) => void;
  index?: number;
  companyId?: string;
}

const getEnrichmentStatusColor = (status?: string) => {
  switch (status) {
    case 'complete': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'partial': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'submitted':
    case 'pending': return 'bg-blue-100 text-blue-700 border-blue-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

const getEnrichmentStatusLabel = (status?: string, provider?: string) => {
  if (status === 'complete') return provider ? `${provider} enriched` : 'Enriched';
  if (status === 'partial') return 'Partially enriched';
  if (status === 'submitted' || status === 'pending') return 'Enrichment pending';
  return 'Not enriched';
};

function displayName(contact: ContactCore) {
  return contact.name || contact.fullName || contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown Contact';
}

function avatarUrl(contact: ContactCore) {
  return contact.avatar_url || contact.photo_url || contact.picture || (contact.enrichment_result as any)?.avatar_url || null;
}

function linkedinUrl(contact: ContactCore) {
  return contact.linkedin_url || contact.linkedin || (contact.enrichment_result as any)?.linkedinUrl || null;
}

export default function ContactCard({ contact, onViewProfile, onEnrich, index = 0, companyId }: ContactCardProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const needsEnrichment = !['complete', 'submitted', 'pending'].includes(contact.enrichment_status || '');
  const resolvedCompanyId = companyId || contact.company_id || undefined;
  const canAddToList = Boolean(contact.id);
  const name = displayName(contact);
  const provider = contact.enrichment_provider || contact.source_provider;
  const linkedIn = linkedinUrl(contact);
  const phone = contact.direct_dial || contact.mobile_phone || contact.phone;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:border-blue-300 hover:shadow-lg"
    >
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none" />

      <div className="relative space-y-3">
        <div className="flex items-start gap-3">
          <ContactAvatar name={name} src={avatarUrl(contact)} size="md" className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-slate-900 transition-colors group-hover:text-blue-600">{name}</h3>
            {contact.title && (
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-600">
                <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                {contact.title}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {contact.department && <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{contact.department}</span>}
              {contact.seniority && <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"><Award className="h-3 w-3" />{contact.seniority}</span>}
            </div>
          </div>
          <span className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize ${getEnrichmentStatusColor(contact.enrichment_status)}`}>
            {getEnrichmentStatusLabel(contact.enrichment_status, provider)}
          </span>
        </div>

        <div className="space-y-2 text-sm">
          {contact.email && (
            <div className="flex items-center gap-2 text-slate-600">
              <Mail className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <a href={`mailto:${contact.email}`} className="truncate hover:text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{contact.email}</a>
            </div>
          )}
          {phone && (
            <div className="flex items-center gap-2 text-slate-600">
              <Phone className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <span className="truncate">{phone}</span>
            </div>
          )}
          {contact.location && (
            <div className="flex items-center gap-2 text-slate-600">
              <MapPin className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <span className="truncate">{contact.location}</span>
            </div>
          )}
          {linkedIn && (
            <div className="flex items-center gap-2 text-slate-600">
              <LinkedinIcon className="h-4 w-4 flex-shrink-0 text-blue-600" />
              <a href={linkedIn} target="_blank" rel="noopener noreferrer" className="truncate hover:text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>LinkedIn profile</a>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2">
          {onViewProfile && (
            <motion.button type="button" onClick={() => onViewProfile(contact)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-slate-800">
              View Profile
              <motion.span animate={{ x: isHovered ? 2 : 0 }} transition={{ duration: 0.2 }}>→</motion.span>
            </motion.button>
          )}
          {onEnrich && needsEnrichment && (
            <motion.button type="button" onClick={() => onEnrich(contact)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              Enrich profile
            </motion.button>
          )}
          {canAddToList && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }} title="Add this contact to a List" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50">
              <Database className="h-3.5 w-3.5 text-slate-500" />
              List
            </button>
          )}
        </div>
      </div>
      <AddToListPicker open={pickerOpen} onClose={() => setPickerOpen(false)} contactId={contact.id} contactName={name} companyId={resolvedCompanyId} />
    </motion.div>
  );
}
