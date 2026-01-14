import React from 'react';
import {
  X,
  Mail,
  Phone,
  LinkedinIcon,
  MapPin,
  Briefcase,
  GraduationCap,
  Building2,
  Calendar,
  Copy,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ContactAvatar from '@/components/command-center/ContactAvatar';
import type { ContactCore } from '@/types/contacts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ContactProfileModalProps {
  isOpen: boolean;
  contact: ContactCore | null;
  onClose: () => void;
  onEnrich?: (contact: ContactCore) => void;
}

export default function ContactProfileModal({
  isOpen,
  contact,
  onClose,
  onEnrich,
}: ContactProfileModalProps) {
  const [copied, setCopied] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!contact) return null;

  const needsEnrichment = contact.enrichment_status !== 'complete';
  const jobHistory = Array.isArray(contact.job_history) ? contact.job_history : [];
  const education = Array.isArray(contact.education) ? contact.education : [];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl bg-white shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 rounded-full bg-white/20 p-2 hover:bg-white/30 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-start gap-4">
                <div className="relative">
                  <ContactAvatar name={contact.name} size="xl" className="ring-4 ring-white/20" />
                  {contact.enrichment_status === 'complete' && (
                    <div className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 p-1.5 ring-4 ring-white">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-bold mb-1">{contact.name}</h2>
                  {contact.title && (
                    <p className="text-blue-100 flex items-center gap-2 mb-2">
                      <Briefcase className="h-4 w-4" />
                      {contact.title}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {contact.department && (
                      <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                        {contact.department}
                      </span>
                    )}
                    {contact.seniority && (
                      <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                        {contact.seniority}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {needsEnrichment && onEnrich && (
                <motion.button
                  type="button"
                  onClick={() => onEnrich(contact)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="mt-4 w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  Enrich Contact with Lusha
                </motion.button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0">
                  <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="activity" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">
                    Activity
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">
                    Notes
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="p-6 space-y-6">
                  <section>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                      Contact Information
                    </h3>
                    <div className="space-y-3">
                      {contact.email && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Mail className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs text-slate-500">Email</p>
                              <p className="text-sm font-medium text-slate-900 truncate">{contact.email}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => copyToClipboard(contact.email!, 'email')}
                            className="flex-shrink-0 rounded-lg border border-slate-200 p-2 hover:bg-slate-100 transition-colors"
                          >
                            {copied === 'email' ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4 text-slate-600" />
                            )}
                          </button>
                        </div>
                      )}

                      {(contact.phone || contact.mobile_phone || contact.direct_dial) && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Phone className="h-5 w-5 text-green-600 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs text-slate-500">
                                {contact.direct_dial ? 'Direct Dial' : contact.mobile_phone ? 'Mobile' : 'Phone'}
                              </p>
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {contact.direct_dial || contact.mobile_phone || contact.phone}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => copyToClipboard(
                              contact.direct_dial || contact.mobile_phone || contact.phone || '',
                              'phone'
                            )}
                            className="flex-shrink-0 rounded-lg border border-slate-200 p-2 hover:bg-slate-100 transition-colors"
                          >
                            {copied === 'phone' ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4 text-slate-600" />
                            )}
                          </button>
                        </div>
                      )}

                      {contact.location && (
                        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                          <MapPin className="h-5 w-5 text-red-600 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-slate-500">Location</p>
                            <p className="text-sm font-medium text-slate-900">{contact.location}</p>
                          </div>
                        </div>
                      )}

                      {contact.linkedin_url && (
                        <a
                          href={contact.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 hover:bg-blue-100 transition-colors"
                        >
                          <LinkedinIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-blue-600">LinkedIn Profile</p>
                            <p className="text-sm font-medium text-blue-900">View on LinkedIn →</p>
                          </div>
                        </a>
                      )}
                    </div>
                  </section>

                  {jobHistory.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Work Experience
                      </h3>
                      <div className="space-y-3">
                        {jobHistory.map((job: any, idx: number) => (
                          <div key={idx} className="rounded-lg border border-slate-200 p-4">
                            <h4 className="font-semibold text-slate-900">{job.title}</h4>
                            <p className="text-sm text-slate-600">{job.company}</p>
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                              <Calendar className="h-3 w-3" />
                              {job.startDate} - {job.endDate || 'Present'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {education.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" />
                        Education
                      </h3>
                      <div className="space-y-3">
                        {education.map((edu: any, idx: number) => (
                          <div key={idx} className="rounded-lg border border-slate-200 p-4">
                            <h4 className="font-semibold text-slate-900">{edu.school}</h4>
                            <p className="text-sm text-slate-600">{edu.degree} {edu.field && `in ${edu.field}`}</p>
                            {(edu.startDate || edu.endDate) && (
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                <Calendar className="h-3 w-3" />
                                {edu.startDate} - {edu.endDate}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </TabsContent>

                <TabsContent value="activity" className="p-6">
                  <div className="text-center text-slate-500 py-12">
                    <Calendar className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                    <p className="text-sm">No activity history yet</p>
                  </div>
                </TabsContent>

                <TabsContent value="notes" className="p-6">
                  <div className="text-center text-slate-500 py-12">
                    <p className="text-sm">No notes yet</p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
