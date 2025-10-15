
import React, { useState, useEffect } from 'react';
import { EmailInteraction } from '@/api/entities';
import { Contact } from '@/api/entities';
import { User } from '@/api/entities';
import { Company } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Mail, Send, Inbox, Archive, Plus, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { checkFeatureAccess, checkUsageLimit, getPlanLimits } from '@/components/utils/planLimits';
import LockedFeature from '../components/common/LockedFeature';
import UpgradePrompt from '../components/common/UpgradePrompt';

import EmailComposer from '../components/email/EmailComposer';
import EmailThreadView from '../components/email/EmailThreadView';
import { sendEmail as sendEmailFunction } from '@/api/functions';

export default function EmailCenter() {
    const [emails, setEmails] = useState([]);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [showComposer, setShowComposer] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('inbox');
    const [user, setUser] = useState(null);
    const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
    const [prefilledEmailData, setPrefilledEmailData] = useState(null); // New state for prefill data

    useEffect(() => {
        User.me().then(setUser);
    }, []);

    useEffect(() => {
        if (user && checkFeatureAccess(user, 'campaigns')) {
            loadEmails();
        } else if (user) {
            setIsLoading(false);
        }
    }, [user]);

    // New useEffect for company_id in URL params
    useEffect(() => {
        // Check for company_id in URL params (from Start Outreach button)
        const urlParams = new URLSearchParams(window.location.search);
        const companyId = urlParams.get('company_id');
        
        if (companyId && companyId !== 'undefined' && user && checkFeatureAccess(user, 'campaigns')) {
            // Pre-fill composer with company information
            loadCompanyForOutreach(companyId);
        }
    }, [user]); // Depend on user to ensure it's loaded before checking feature access

    const loadEmails = async () => {
        setIsLoading(true);
        try {
            const data = await EmailInteraction.filter({ direction: 'received' }, '-created_date');
            setEmails(data);
        } catch (error) {
            console.error('Failed to load emails:', error);
        }
        setIsLoading(false);
    };

    const loadCompanyForOutreach = async (companyId) => {
        try {
            const companies = await Company.filter({ id: companyId });
            if (companies.length > 0) {
                const company = companies[0];
                setPrefilledEmailData({
                    to: company.email || '', // Assuming company has an email property
                    subject: `Outreach to ${company.name}`,
                    // body_html: `Hi ${company.name} team,`, // You can add a default body if needed
                    // company_id: companyId, // Pass company ID if EmailComposer needs it for contact association
                });
                setShowComposer(true);
            }
        } catch (error) {
            console.error('Failed to load company for outreach:', error);
        }
    };

    const handleSendEmail = async (emailData) => {
        if (!checkUsageLimit(user, 'emails')) {
            setShowUpgradePrompt(true);
            return;
        }
        try {
            // Call the backend function to send the email
            const { data: sendResult, error: sendError } = await sendEmailFunction({
                to: emailData.to,
                subject: emailData.subject,
                body_html: emailData.body_html
            });

            if (sendError) {
                console.error('Failed to send email:', sendError.data.error);
                alert(`Failed to send email: ${sendError.data.error}`);
                return;
            }

            // Create the interaction record for tracking in the UI
            // This assumes emailData contains necessary info for EmailInteraction.create
            await EmailInteraction.create({
                ...emailData,
                direction: 'sent',
                status: 'sent', // Resend handles delivery status, 'sent' is our initial state
                contact_id: 'temp-contact-id', // This should be linked to an actual contact
            });
            
            // The backend function now handles this, but we can update the local user state
            setUser(prevUser => ({...prevUser, monthly_emails_sent: (prevUser.monthly_emails_sent || 0) + 1}));

            setShowComposer(false);
            setPrefilledEmailData(null); // Clear prefill data after sending
            await loadEmails(); // Reload sent folder if implemented
        } catch (error) {
            console.error('Failed to send email:', error);
            alert('An unexpected error occurred while sending the email.');
        }
    };
    
    const handleComposeClick = () => {
        if (!checkUsageLimit(user, 'emails')) {
            setShowUpgradePrompt(true);
            return;
        }
        setPrefilledEmailData(null); // Clear any previous prefill data for a fresh compose
        setShowComposer(true);
    };

    const getStatusColor = (status) => {
        const colors = {
            sent: 'bg-blue-100 text-blue-800',
            delivered: 'bg-green-100 text-green-800',
            opened: 'bg-purple-100 text-purple-800',
            replied: 'bg-yellow-100 text-yellow-800',
            bounced: 'bg-red-100 text-red-800',
        };
        return colors[status] || colors.sent;
    };

    if (showComposer) {
        return (
            <div className="p-4 md:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-white rounded-lg shadow-lg p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                                <Send className="w-6 h-6 text-blue-600" />
                                Compose Email
                            </h2>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowComposer(false);
                                    setPrefilledEmailData(null); // Clear prefill data on close
                                }}
                                className="text-gray-600 hover:text-gray-800"
                            >
                                <X className="w-4 h-4 mr-2" />
                                Back to Email Center
                            </Button>
                        </div>

                        <EmailComposer 
                            onSend={handleSendEmail}
                            onClose={() => {
                                setShowComposer(false);
                                setPrefilledEmailData(null); // Clear prefill data on close
                            }}
                            isInline={true}
                            initialData={prefilledEmailData}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <LockedFeature
                isLocked={!checkFeatureAccess(user, 'campaigns')}
                onUpgradeClick={() => setShowUpgradePrompt(true)}
                title="Email Center & Automation"
                description="Upgrade to the Growth plan to unlock direct email outreach and campaign automation."
            >
                <div className="p-4 md:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 lg:mb-8 gap-4">
                            <div>
                                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">Email Center</h1>
                                <p className="text-gray-600 mt-2 text-sm md:text-base">Manage your outreach and track email performance.</p>
                                 {user && checkFeatureAccess(user, 'campaigns') && (
                                    <div className="flex items-center gap-4 mt-2">
                                        <Badge className="bg-green-100 text-green-800">
                                            {getPlanLimits(user.plan).name} Plan
                                        </Badge>
                                        <span className="text-xs text-gray-500">
                                            {user.monthly_emails_sent || 0} / {getPlanLimits(user.plan).max_emails} emails this month
                                        </span>
                                    </div>
                                )}
                            </div>
                            <Button 
                                onClick={handleComposeClick}
                                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg w-full sm:w-auto"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Compose Email
                            </Button>
                        </div>

                        <div className="grid lg:grid-cols-4 gap-6 md:gap-8">
                            {/* Sidebar */}
                            <div className="lg:col-span-1">
                                <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
                                    <CardHeader>
                                        <CardTitle>Folders</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            {[
                                                { id: 'inbox', label: 'Inbox', icon: Inbox, count: emails.length },
                                                { id: 'sent', label: 'Sent', icon: Send, count: 0 },
                                                { id: 'archived', label: 'Archived', icon: Archive, count: 0 }
                                            ].map(folder => (
                                                <button
                                                    key={folder.id}
                                                    onClick={() => setActiveTab(folder.id)}
                                                    className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                                                        activeTab === folder.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <folder.icon className="w-4 h-4" />
                                                        <span>{folder.label}</span>
                                                    </div>
                                                    <Badge variant="secondary">{folder.count}</Badge>
                                                </button>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Email List */}
                            <div className="lg:col-span-3">
                                <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <CardTitle>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</CardTitle>
                                            <div className="relative w-full max-w-xs">
                                                <Input placeholder="Search emails..." className="pl-10 bg-gray-50 border-0" />
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                                            {isLoading ? (
                                                <p className="text-center py-4 text-gray-500">Loading emails...</p>
                                            ) : emails.length > 0 ? emails.map(email => (
                                                <div 
                                                    key={email.id}
                                                    onClick={() => setSelectedEmail(email)}
                                                    className="p-4 border border-transparent rounded-lg hover:bg-gray-50 hover:border-gray-200 cursor-pointer transition-colors"
                                                >
                                                    <div className="flex items-start justify-between mb-2">
                                                        <p className="font-medium text-gray-900">{email.subject}</p>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            <Badge className={getStatusColor(email.status)}>{email.status}</Badge>
                                                            <span className="text-xs text-gray-500 w-16 text-right">
                                                                {format(new Date(email.created_date), 'MMM dd')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm text-gray-600 truncate">
                                                        Contact ID: {email.contact_id}
                                                    </p>
                                                </div>
                                            )) : (
                                                <div className="text-center py-12 text-gray-500">
                                                    <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                                    <h3 className="font-semibold text-lg">Your {activeTab} is empty</h3>
                                                    <p className="text-sm">New emails will appear here.</p>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </div>
                </div>
            </LockedFeature>

            <UpgradePrompt 
                isOpen={showUpgradePrompt}
                onClose={() => setShowUpgradePrompt(false)}
                feature="campaigns"
                currentPlan={user?.plan}
            />
            
            {selectedEmail && (
                <EmailThreadView 
                    email={selectedEmail}
                    onClose={() => setSelectedEmail(null)}
                />
            )}
        </>
    );
}
