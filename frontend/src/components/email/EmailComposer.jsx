
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { sendEmail as sendEmailFunction } from '@/api/functions';
import { Contact } from '@/api/entities';
import { Company } from '@/api/entities';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { X, Send, Paperclip, AlertTriangle, Bold, Italic, Link } from 'lucide-react';

export default function EmailComposer({ onSend, onClose, prefilledData = {}, isInline = false }) {
  const [toEmail, setToEmail] = useState(prefilledData.to || '');
  const [subject, setSubject] = useState(prefilledData.subject || '');
  const [bodyText, setBodyText] = useState(prefilledData.bodyHtml || '');
  const [selectedContactId, setSelectedContactId] = useState(prefilledData.contactId || '');
  const [selectedCompanyId, setSelectedCompanyId] = useState(prefilledData.companyId || '');
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const contactsData = await Contact.list();
        setContacts(contactsData || []);
        const companiesData = await Company.list();
        setCompanies(companiesData || []);
      } catch (error) {
        console.error('Failed to load contacts/companies:', error);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (selectedContactId) {
      const contact = contacts.find(c => c.id === selectedContactId);
      if (contact) {
        setToEmail(contact.email);
        if (contact.company_id) {
          setSelectedCompanyId(contact.company_id);
        }
      }
    }
  }, [selectedContactId, contacts]);

  // Simple text formatting functions
  const wrapSelectedText = (before, after) => {
    const textarea = document.getElementById('message-textarea');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = bodyText.substring(start, end);
    const newText = bodyText.substring(0, start) + before + selectedText + after + bodyText.substring(end);
    
    setBodyText(newText);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const handleSend = async () => {
    if (!toEmail || !subject || !bodyText) {
      setErrorMessage('"To", "Subject", and "Message" fields are required.');
      return;
    }
    setIsSending(true);
    setErrorMessage('');
    
    try {
      // Convert plain text to basic HTML
      const bodyHtml = bodyText.replace(/\n/g, '<br>');
      
      console.log('DEBUG: Data being sent to sendEmailFunction:', { 
        to: toEmail, 
        subject, 
        body_html: bodyHtml 
      });
      
      const response = await sendEmailFunction({
        to: toEmail,
        subject: subject,
        body_html: bodyHtml,
      });

      console.log('DEBUG: Raw response received from sendEmailFunction:', response);

      // Check for errors in the response
      if (response.status >= 400) {
        const errorMessage = response.data?.error || response.error || 'Unknown error occurred';
        console.error('Backend Error:', errorMessage);
        setErrorMessage(`Failed to send email: ${errorMessage}`);
        setIsSending(false);
        return;
      }

      // Check for success
      if (response.data?.success) {
        setIsSending(false);
        onSend({ to: toEmail, subject, bodyHtml });
        if (!isInline) {
          onClose();
        }
      } else {
        // Handle unexpected response format
        console.error('Unexpected response format:', response);
        setErrorMessage('Unexpected response from server. Please try again.');
        setIsSending(false);
      }
    } catch (e) {
      console.error('Failed to send email:', e);
      setErrorMessage(`Failed to send email: ${e.message || 'Unknown error'}`);
      setIsSending(false);
    }
  };

  // If inline, return just the form content without Dialog wrapper
  if (isInline) {
    return (
      <div className="space-y-6">
        {errorMessage && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="toEmail">To *</Label>
            <Input
              id="toEmail"
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full"
            />
          </div>

          {/* TEMPORARILY REMOVED FOR TESTING - Contact Select
          <div className="space-y-2">
            <Label htmlFor="contactSelect">Contact (Optional)</Label>
            <Select value={selectedContactId} onValueChange={setSelectedContactId}>
              <SelectTrigger>
                <SelectValue placeholder="Select contact" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.full_name} ({contact.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          */}

          <div className="space-y-2">
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              className="w-full"
            />
          </div>

          {/* TEMPORARILY REMOVED FOR TESTING - Company Select
          <div className="space-y-2">
            <Label htmlFor="companySelect">Company (Optional)</Label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Associate with company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          */}

          <div className="space-y-2">
            <Label htmlFor="message">Message *</Label>
            
            <div className="flex gap-2 p-2 bg-gray-50 rounded-t border border-b-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => wrapSelectedText('**', '**')}
                className="h-8 px-2"
              >
                <Bold className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => wrapSelectedText('*', '*')}
                className="h-8 px-2"
              >
                <Italic className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => wrapSelectedText('[', '](url)')}
                className="h-8 px-2"
              >
                <Link className="w-4 h-4" />
              </Button>
            </div>

            <Textarea
              id="message-textarea"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Write your message here..."
              className="min-h-[300px] resize-y rounded-t-none"
            />
            <p className="text-xs text-gray-500">
              Use **bold**, *italic*, and [link text](url) for basic formatting
            </p>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>💡 Pro Tip:</strong> Use placeholders like [Name], [Company], and [Route] in your templates. They'll be automatically replaced when sending to specific contacts.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={isSending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Email
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Keep the original Dialog version for backward compatibility
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px] bg-white rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row justify-between items-center">
          <DialogTitle className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-600" />
            Compose Email
          </DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-4">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="toEmail">To *</Label>
              <Input
                id="toEmail"
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="recipient@example.com"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject *</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message *</Label>
              
              <div className="flex gap-2 p-2 bg-gray-50 rounded-t border border-b-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => wrapSelectedText('**', '**')}
                  className="h-8 px-2"
                >
                  <Bold className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => wrapSelectedText('*', '*')}
                  className="h-8 px-2"
                >
                  <Italic className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => wrapSelectedText('[', '](url)')}
                  className="h-8 px-2"
                >
                  <Link className="w-4 h-4" />
                </Button>
              </div>

              <Textarea
                id="message-textarea"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Write your message here..."
                className="min-h-[200px] resize-y rounded-t-none"
              />
              <p className="text-xs text-gray-500">
                Use **bold**, *italic*, and [link text](url) for basic formatting
              </p>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>💡 Pro Tip:</strong> Use placeholders like [Name], [Company], and [Route] in your templates. They'll be automatically replaced when sending to specific contacts.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between items-center mt-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-gray-600">
              <Paperclip className="w-4 h-4 mr-1" />
              Attach File
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSend} 
              disabled={isSending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
