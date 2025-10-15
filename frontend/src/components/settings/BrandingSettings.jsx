import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UploadCloud, Trash2 } from 'lucide-react';
import { UploadFile } from '@/api/integrations';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

export default function BrandingSettings({ user, onUpdate }) {
  const [settings, setSettings] = useState({
    company_name: '',
    company_website: '',
    company_logo_url: '',
    email_signature_html: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setSettings({
        company_name: user.company_name || '',
        company_website: user.company_website || '',
        company_logo_url: user.company_logo_url || '',
        email_signature_html: user.email_signature_html || ''
      });
    }
  }, [user]);
  
  const handleChange = (e) => {
    const { id, value } = e.target;
    setSettings(prev => ({...prev, [id]: value}));
  };
  
  const handleSignatureChange = (value) => {
      setSettings(prev => ({...prev, email_signature_html: value}));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { file_url } = await UploadFile({ file });
      setSettings(prev => ({ ...prev, company_logo_url: file_url }));
    } catch (error) {
      console.error("Logo upload failed:", error);
      alert("Logo upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setIsSaved(false);
    await onUpdate(settings);
    setIsSaving(false);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };
  
  const isChanged = settings.company_name !== (user?.company_name || '') ||
                    settings.company_website !== (user?.company_website || '') ||
                    settings.company_logo_url !== (user?.company_logo_url || '') ||
                    settings.email_signature_html !== (user?.email_signature_html || '');

  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
      <form onSubmit={handleSave}>
        <CardHeader>
          <CardTitle>Company Branding</CardTitle>
          <CardDescription>Customize how your brand appears on quotes, emails, and other communications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input id="company_name" value={settings.company_name} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_website">Company Website</Label>
              <Input id="company_website" value={settings.company_website} onChange={handleChange} placeholder="https://example.com" />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Company Logo</Label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-lg border flex items-center justify-center bg-gray-50 overflow-hidden">
                {settings.company_logo_url ? (
                  <img src={settings.company_logo_url} alt="Company Logo" className="w-full h-full object-contain" />
                ) : (
                  <UploadCloud className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => document.getElementById('logo-upload').click()} disabled={isUploading}>
                  {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UploadCloud className="mr-2 h-4 w-4"/>}
                  {isUploading ? 'Uploading...' : 'Upload Logo'}
                </Button>
                {settings.company_logo_url && (
                   <Button type="button" variant="ghost" size="icon" onClick={() => setSettings(prev => ({...prev, company_logo_url: ''}))}>
                     <Trash2 className="w-4 h-4 text-red-500"/>
                   </Button>
                )}
                <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
              <Label htmlFor="email_signature_html">Email Signature</Label>
              <div className="bg-white rounded-lg">
                <ReactQuill 
                    theme="snow" 
                    value={settings.email_signature_html} 
                    onChange={handleSignatureChange}
                    modules={{ toolbar: [
                        [{ 'header': [1, 2, false] }],
                        ['bold', 'italic', 'underline','strike'],
                        [{'list': 'ordered'}, {'list': 'bullet'}],
                        ['link'],
                        ['clean']
                    ]}}
                />
              </div>
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button type="submit" disabled={isSaving || !isChanged}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? 'Saving...' : isSaved ? 'Saved!' : 'Save Branding'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}