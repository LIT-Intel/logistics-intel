import React from 'react';
import { X, Mail, Phone, LinkedinIcon, MapPin, Briefcase, GraduationCap, Building2, Calendar, Copy, Check, Sparkles, UserRound } from 'lucide-react';
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

const displayName = (c: ContactCore) => c.name || c.fullName || c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown Contact';
const avatarUrl = (c: ContactCore) => c.avatar_url || c.photo_url || c.picture || (c.enrichment_result as any)?.avatar_url || null;
const linkedinUrl = (c: ContactCore) => c.linkedin_url || c.linkedin || (c.enrichment_result as any)?.linkedinUrl || null;

function enrichedFields(contact: ContactCore) {
  const result = (contact.enrichment_result || {}) as Record<string, unknown>;
  return [
    ['Company', contact.company_name || result.companyName],
    ['Provider', contact.enrichment_provider || contact.source_provider],
    ['Personal email', contact.personal_email || result.personalEmail],
    ['Profile image', avatarUrl(contact) ? 'Available' : null],
  ].filter(([, value]) => Boolean(value));
}

export default function ContactProfileModal({ isOpen, contact, onClose, onEnrich }: ContactProfileModalProps) {
  const [copied, setCopied] = React.useState<string | null>(null);
  if (!contact) return null;

  const name = displayName(contact);
  const needsEnrichment = !['complete', 'submitted', 'pending'].includes(contact.enrichment_status || '');
  const jobHistory = Array.isArray(contact.job_history) ? contact.job_history : [];
  const education = Array.isArray(contact.education) ? contact.education : [];
  const linkedIn = linkedinUrl(contact);
  const phone = contact.direct_dial || contact.mobile_phone || contact.phone;
  const extraFields = enrichedFields(contact);
  const provider = contact.enrichment_provider || contact.source_provider;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, x: 96 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 96 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-2xl flex-col overflow-hidden bg-slate-50 shadow-2xl">
            <div className="relative overflow-hidden bg-slate-950 p-6 text-white">
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-cyan-400/0 via-cyan-300/70 to-blue-500/0" />
              <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20" aria-label="Close contact profile">
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-start gap-4 pr-10">
                <div className="relative">
                  <ContactAvatar name={name} src={avatarUrl(contact)} size="xl" className="border-white/20 ring-4 ring-white/10" />
                  {contact.enrichment_status === 'complete' && <div className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 p-1.5 ring-4 ring-slate-950"><Check className="h-3 w-3 text-white" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {provider && <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">{provider}</span>}
                    {contact.enrichment_status && <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold capitalize text-white/85">{contact.enrichment_status}</span>}
                  </div>
                  <h2 className="truncate text-2xl font-bold tracking-tight">{name}</h2>
                  {contact.title && <p className="mt-1 flex items-center gap-2 text-sm text-slate-300"><Briefcase className="h-4 w-4" />{contact.title}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {contact.department && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85">{contact.department}</span>}
                    {contact.seniority && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85">{contact.seniority}</span>}
                  </div>
                </div>
              </div>

              {needsEnrichment && onEnrich && (
                <motion.button type="button" onClick={() => onEnrich(contact)} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-50">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  Enrich profile
                </motion.button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-white p-0">
                  <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">Overview</TabsTrigger>
                  <TabsTrigger value="activity" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">Activity</TabsTrigger>
                  <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-5 p-5">
                  <Section title="Contact Information">
                    <div className="space-y-3">
                      {contact.email && <InfoRow icon={Mail} label="Email" value={contact.email} onCopy={() => copyToClipboard(contact.email!, 'email')} copied={copied === 'email'} />}
                      {phone && <InfoRow icon={Phone} label={contact.direct_dial ? 'Direct Dial' : contact.mobile_phone ? 'Mobile' : 'Phone'} value={phone} onCopy={() => copyToClipboard(phone, 'phone')} copied={copied === 'phone'} />}
                      {contact.location && <StaticInfoRow icon={MapPin} label="Location" value={contact.location} />}
                      {linkedIn && <a href={linkedIn} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 transition-colors hover:bg-blue-100"><LinkedinIcon className="h-5 w-5 flex-shrink-0 text-blue-600" /><div><p className="text-xs text-blue-600">LinkedIn Profile</p><p className="text-sm font-semibold text-blue-950">Open LinkedIn profile</p></div></a>}
                    </div>
                  </Section>

                  {extraFields.length > 0 && <Section title="Enriched Profile" icon={UserRound}><div className="grid gap-2 sm:grid-cols-2">{extraFields.map(([label, value]) => <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="truncate text-sm font-semibold text-slate-900">{String(value)}</p></div>)}</div></Section>}
                  {jobHistory.length > 0 && <HistorySection title="Work Experience" icon={Building2} rows={jobHistory} />}
                  {education.length > 0 && <HistorySection title="Education" icon={GraduationCap} rows={education} education />}
                </TabsContent>

                <TabsContent value="activity" className="p-6"><EmptyPanel icon={Calendar} text="No activity history yet" /></TabsContent>
                <TabsContent value="notes" className="p-6"><EmptyPanel icon={UserRound} text="No notes yet" /></TabsContent>
              </Tabs>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">{Icon && <Icon className="h-4 w-4" />}{title}</h3>{children}</section>;
}

function InfoRow({ icon: Icon, label, value, onCopy, copied }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; onCopy: () => void; copied: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"><div className="flex min-w-0 flex-1 items-center gap-3"><Icon className="h-5 w-5 flex-shrink-0 text-blue-600" /><div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="truncate text-sm font-semibold text-slate-900">{value}</p></div></div><button onClick={onCopy} className="flex-shrink-0 rounded-lg border border-slate-200 p-2 transition-colors hover:bg-slate-100" aria-label={`Copy ${label}`}>{copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-slate-600" />}</button></div>;
}

function StaticInfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"><Icon className="h-5 w-5 flex-shrink-0 text-red-600" /><div><p className="text-xs text-slate-500">{label}</p><p className="text-sm font-semibold text-slate-900">{value}</p></div></div>;
}

function HistorySection({ title, icon, rows, education = false }: { title: string; icon: React.ComponentType<{ className?: string }>; rows: any[]; education?: boolean }) {
  return <Section title={title} icon={icon}><div className="space-y-3">{rows.map((row, idx) => <div key={idx} className="rounded-lg border border-slate-200 p-4"><h4 className="font-semibold text-slate-900">{education ? row.school : row.title}</h4><p className="text-sm text-slate-600">{education ? [row.degree, row.field && `in ${row.field}`].filter(Boolean).join(' ') : row.company}</p>{(row.startDate || row.endDate) && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Calendar className="h-3 w-3" />{row.startDate} - {row.endDate || 'Present'}</p>}</div>)}</div></Section>;
}

function EmptyPanel({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return <div className="py-12 text-center text-slate-500"><Icon className="mx-auto mb-3 h-12 w-12 text-slate-300" /><p className="text-sm">{text}</p></div>;
}
