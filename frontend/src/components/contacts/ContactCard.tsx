import React from 'react';
import { Mail, Phone, LinkedinIcon, MapPin, Briefcase, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import ContactAvatar from '@/components/command-center/ContactAvatar';
import type { ContactCore } from '@/types/contacts';

interface ContactCardProps {
  contact: ContactCore;
  onViewProfile?: (contact: ContactCore) => void;
  onEnrich?: (contact: ContactCore) => void;
  index?: number;
}

const getEnrichmentStatusColor = (status?: string) => {
  switch (status) {
    case 'complete':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'partial':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

const getEnrichmentStatusLabel = (status?: string) => {
  switch (status) {
    case 'complete':
      return 'Complete';
    case 'partial':
      return 'Partial';
    default:
      return 'Not Enriched';
  }
};

export default function ContactCard({
  contact,
  onViewProfile,
  onEnrich,
  index = 0,
}: ContactCardProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const needsEnrichment = contact.enrichment_status !== 'complete';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all duration-200"
    >
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="relative space-y-3">
        <div className="flex items-start gap-3">
          <ContactAvatar name={contact.name} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
              {contact.name || 'Unknown Contact'}
            </h3>
            {contact.title && (
              <p className="text-sm text-slate-600 truncate flex items-center gap-1.5 mt-0.5">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                {contact.title}
              </p>
            )}
            {contact.department && (
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {contact.department}
                </span>
                {contact.seniority && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                    <Award className="w-3 h-3" />
                    {contact.seniority}
                  </span>
                )}
              </div>
            )}
          </div>
          <span className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getEnrichmentStatusColor(contact.enrichment_status)}`}>
            {getEnrichmentStatusLabel(contact.enrichment_status)}
          </span>
        </div>

        <div className="space-y-2 text-sm">
          {contact.email && (
            <div className="flex items-center gap-2 text-slate-600">
              <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <a
                href={`mailto:${contact.email}`}
                className="hover:text-blue-600 hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {contact.email}
              </a>
            </div>
          )}
          {(contact.phone || contact.mobile_phone || contact.direct_dial) && (
            <div className="flex items-center gap-2 text-slate-600">
              <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="truncate">
                {contact.direct_dial || contact.mobile_phone || contact.phone}
              </span>
            </div>
          )}
          {contact.location && (
            <div className="flex items-center gap-2 text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="truncate">{contact.location}</span>
            </div>
          )}
          {contact.linkedin_url && (
            <div className="flex items-center gap-2 text-slate-600">
              <LinkedinIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                View LinkedIn Profile
              </a>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2">
          {onViewProfile && (
            <motion.button
              type="button"
              onClick={() => onViewProfile(contact)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-all"
            >
              View Profile
              <motion.span
                animate={{ x: isHovered ? 2 : 0 }}
                transition={{ duration: 0.2 }}
              >
                →
              </motion.span>
            </motion.button>
          )}
          {onEnrich && needsEnrichment && (
            <motion.button
              type="button"
              onClick={() => onEnrich(contact)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-all"
            >
              Enrich with Lusha
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
