import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProfileSettings from '../components/settings/ProfileSettings';
import BrandingSettings from '../components/settings/BrandingSettings';
import EmailProviderSettings from '../components/settings/EmailProviderSettings';

export default function Settings() {
  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50/70 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>
        
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="email">Email Provider</TabsTrigger>
          </TabsList>
          
          <TabsContent value="profile">
            <ProfileSettings />
          </TabsContent>
          
          <TabsContent value="branding">
            <BrandingSettings />
          </TabsContent>
          
          <TabsContent value="email">
            <EmailProviderSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
