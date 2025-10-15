
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, Edit, Trash2, Mail, Linkedin, MoreVertical, Phone, Users, MessageSquare, Loader2, Search, Bookmark, Plus, Lock } from 'lucide-react';
import AddContactForm from './AddContactForm';
import { Contact } from '@/api/entities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { phantombusterLinkedIn } from '@/api/functions';
import { format } from 'date-fns';
import { toggleCompanySave } from '@/api/functions'; // New import for company saving

// Helper functions for badge colors
const getSourceColor = (source) => {
  switch (source?.toLowerCase()) {
    case 'linkedin': return 'bg-blue-100 text-blue-800';
    case 'email': return 'bg-yellow-100 text-yellow-800';
    case 'referral': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getResponseColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'responded': return 'bg-green-100 text-green-800';
    case 'pending': return 'bg-yellow-100 text-yellow-800';
    case 'not_contacted': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

// Extracted ContactCard component for better modularity
const ContactCard = ({ contact, onRefresh, onEdit }) => {
  const [linkedinLoading, setLinkedinLoading] = useState({});

  const handleDeleteContact = async (contactId) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      await Contact.delete(contactId);
      onRefresh(); // Refresh contacts list after delete
    }
  };

  const handleLinkedInAction = async (contact, action) => {
    if (!contact.linkedin) {
      alert('No LinkedIn profile available for this contact.');
      return;
    }

    const actionKey = `${contact.id}_${action}`;
    setLinkedinLoading({ ...linkedinLoading, [actionKey]: true });

    try {
      const message = action === 'connect'
        ? `Hi ${contact.full_name?.split(' ')[0] || ''}, I'd like to connect and share some insights about your industry.`
        : `Hi ${contact.full_name?.split(' ')[0] || ''}, I have some valuable market intelligence that might interest your team. Would you be open to a quick conversation?`;

      const response = await phantombusterLinkedIn({
        action: action,
        profile_url: contact.linkedin,
        message: message,
        contactId: contact.id
      });

      if (response.status === 200) {
        alert(`LinkedIn ${action} initiated for ${contact.full_name}.`);
        // Update contact record to track the action
        await Contact.update(contact.id, {
          last_contacted: new Date().toISOString()
        });
        onRefresh(); // Refresh contacts list after LinkedIn action
      } else {
        throw new Error(response.data?.error || `LinkedIn ${action} failed`);
      }
    } catch (error) {
      console.error(`LinkedIn ${action} error:`, error);
      alert(`Failed to ${action} ${contact.full_name}. ${error.message}`);
    } finally {
      setLinkedinLoading({ ...linkedinLoading, [actionKey]: false });
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-600 font-semibold text-lg">
              {contact.full_name?.charAt(0) || '?'}
            </span>
          </div>
          <div>
            <h5 className="font-semibold text-gray-900">{contact.full_name}</h5>
            <p className="text-sm text-gray-600">{contact.title}</p>
            {contact.dept && (
              <p className="text-sm text-gray-500">{contact.dept}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-sm">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {contact.email}
                </a>
              )}
              {contact.phone && (
                <span className="text-gray-600 flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  {contact.phone}
                </span>
              )}
              {contact.linkedin && (
                <a
                  href={contact.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Linkedin className="w-4 h-4" />
                  LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* LinkedIn Actions */}
          {contact.linkedin && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleLinkedInAction(contact, 'connect')}
                disabled={linkedinLoading[`${contact.id}_connect`]}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                {linkedinLoading[`${contact.id}_connect`] ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                ) : (
                  <>
                    <Linkedin className="w-4 h-4 mr-1" />
                    Connect
                  </>
                )}
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleLinkedInAction(contact, 'message')}
                disabled={linkedinLoading[`${contact.id}_message`]}
                className="text-green-600 border-green-200 hover:bg-green-50"
              >
                {linkedinLoading[`${contact.id}_message`] ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4 mr-1" />
                    Message
                  </>
                )}
              </Button>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={onEdit}> {/* Call onEdit prop from parent */}
                <Edit className="w-4 h-4 mr-2" />
                Edit Contact
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDeleteContact(contact.id)}
                className="text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Contact Status Badges */}
      <div className="flex flex-wrap gap-2 mt-3">
        {contact.verified && (
          <Badge className="bg-green-100 text-green-800">Verified</Badge>
        )}
        {contact.source && (
          <Badge className={`${getSourceColor(contact.source)}`}>
            {contact.source}
          </Badge>
        )}
        {contact.response_status && (
          <Badge className={`${getResponseColor(contact.response_status)}`}>
            {contact.response_status?.replace('_', ' ')}
          </Badge>
        )}
        {contact.last_contacted && (
          <Badge variant="outline">
            Contacted {format(new Date(contact.last_contacted), 'MMM dd')}
          </Badge>
        )}
      </div>
    </Card>
  );
};


export default function ContactsTab({
  company,
  contacts,
  onAddContact, // Now expects contactData from AddContactForm on save
  onFindContacts, // New prop for finding contacts
  isLoadingContacts, // New prop for loading state of find contacts
  onRefresh, // Retained for general list refresh (e.g., after delete/linkedin action)
  user // New prop for current user info
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContact, setEditingContact] = useState(null); // Used for editing existing contacts
  const [isCompanySaved, setIsCompanySaved] = useState(false); // New state to track if company is saved

  // Check if company is saved by current user on component mount and when company/user changes
  useEffect(() => {
    const checkIfSaved = async () => {
      try {
        const { data } = await toggleCompanySave({ list: true });
        const savedIds = new Set(data.map(item => item.company_id));
        setIsCompanySaved(savedIds.has(company.company_id || company.id));
      } catch (error) {
        console.error('Error checking save status:', error);
        // Fallback to true if error, or handle specific error states
        setIsCompanySaved(false); // Assume not saved on error
      }
    };

    if (company && user) {
      checkIfSaved();
    } else {
      setIsCompanySaved(false); // If no company or user, it's not saved
    }
  }, [company, user]);

  // Handler for saving the company and then showing the Add Contact form
  const handleSaveAndAddContact = async () => {
    try {
      await toggleCompanySave({ companyId: company.company_id || company.id });
      setIsCompanySaved(true);
      setEditingContact(null); // Ensure no contact is being edited when adding new
      setShowAddForm(true);
    } catch (error) {
      console.error('Error saving company:', error);
      alert('Failed to save company.');
    }
  };

  // Handler for editing an existing contact
  const handleEdit = (contact) => {
    setEditingContact(contact);
    setShowAddForm(true);
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Contacts ({contacts?.length || 0})
        </h3>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onFindContacts}
            disabled={isLoadingContacts || !isCompanySaved} // Disable if company not saved or loading
            className="flex items-center gap-2"
          >
            {isLoadingContacts ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Find Contacts
          </Button>

          {isCompanySaved ? (
            <Button
              onClick={() => { setEditingContact(null); setShowAddForm(true); }} // Reset editingContact for new add
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add Contact
            </Button>
          ) : (
            <Button
              onClick={handleSaveAndAddContact}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Bookmark className="w-4 h-4" />
              Save Company to Add Contacts
            </Button>
          )}
        </div>
      </div>

      {/* Gating Message for Non-Saved Companies */}
      {!isCompanySaved && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-800">Save Company Required</p>
              <p className="text-sm text-amber-700 mt-1">
                You need to save this company to your CRM before adding or managing contacts.
                This helps organize your prospects and enables campaign features.
              </p>
            </div>
          </div>
          <Button
            onClick={handleSaveAndAddContact}
            className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
          >
            Save Company & Add Contacts
          </Button>
        </div>
      )}

      {/* Add/Edit Contact Form */}
      {showAddForm && (
        <AddContactForm
          company={company}
          contact={editingContact} // Pass existing contact for editing
          onSave={(contactData) => { // Expects contactData from AddContactForm
            onAddContact(contactData); // Call parent's onAddContact to handle save
            setShowAddForm(false);
            setEditingContact(null); // Clear editing state after save
          }}
          onCancel={() => {
            setShowAddForm(false);
            setEditingContact(null); // Clear editing state on cancel
          }}
        />
      )}

      {/* Contacts List */}
      {contacts && contacts.length > 0 ? (
        <div className="grid gap-4">
          {contacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onRefresh={onRefresh} // Pass onRefresh for actions like delete/LinkedIn
              onEdit={() => handleEdit(contact)} // Pass handler to open form in edit mode
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium mb-2">No contacts found</p>
          <p className="text-sm mb-4">
            Start building your prospect database by finding or adding contacts
          </p>
          {isCompanySaved && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={onFindContacts}
                disabled={isLoadingContacts}
              >
                Find Contacts
              </Button>
              <Button onClick={() => { setEditingContact(null); setShowAddForm(true); }}>
                Add Contact Manually
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
