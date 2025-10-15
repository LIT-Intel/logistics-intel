import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

const GoogleIcon = () => <svg className="w-5 h-5 mr-3" height="100%" viewBox="0 0 512 512" width="100%"><path d="M490.4,256.2C490.4,239,488.9,223,486,208H262.2v89.8h125.9c-5.8,29-23.9,53.2-50.5,70.3v58.3h74.6C469.3,391.8,490.4,328.8,490.4,256.2z" fill="#4285f4"></path><path d="M262.2,492c67.3,0,123.9-22.3,165.2-60.3l-74.6-58.3c-22.3,15-50.9,23.9-89.6,23.9c-69,0-127.5-46.8-148.4-109.8H29.9v60.5C71.3,444.6,160.7,492,262.2,492z" fill="#34a853"></path><path d="M113.8,303.9c-4.7-15-7.4-30.8-7.4-47.9s2.7-32.9,7.4-47.9V147.6H29.9c-18.5,37-29.9,79.5-29.9,124.4s11.3,87.4,29.9,124.4L113.8,303.9z" fill="#fbbc05"></path><path d="M262.2,107.9c36.7,0,69.9,12.7,96.3,38.2l66.2-66.2C386.1,23.9,329.5,0,262.2,0C160.7,0,71.3,47.4,29.9,119.5l83.9,60.5C134.7,154.7,193.2,107.9,262.2,107.9z" fill="#ea4335"></path></svg>;
const OutlookIcon = () => <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24"><path fill="#0072C6" d="M14.5,14.25h-5V9.75h5V14.25z M14,5H4C3.72,5,3.5,5.22,3.5,5.5v13C3.5,18.78,3.72,19,4,19h10c2.48,0,4.5-2.02,4.5-4.5V9.5c0-2.48-2.02-4.5-4.5-4.5z M14.5,15c0,0.41-0.34,0.75-0.75,0.75h-5c-0.41,0-0.75-0.34-0.75-0.75V9c0-0.41,0.34,0.75,0.75-0.75h5c0.41,0,0.75,0.34,0.75,0.75V15z M20,9.5C20,12.54,17.54,15,14.5,15h-1V9h1c1.38,0,2.5,1.12,2.5,2.5V9.5z"></path></svg>;

export default function EmailProviderSettings({ user, onUpdate }) {
  
  const handleConnect = (provider) => {
    // This is where the actual OAuth flow would start.
    // For now, it's a placeholder.
    alert(`Connecting with ${provider} is a future feature. This would typically redirect you to ${provider} to authorize the application.`);
  };

  return (
    <div>
      <CardHeader className="p-0 mb-6">
        <CardTitle>Connect Your Email</CardTitle>
        <CardDescription>
          Connect your email account to send outreach directly from the platform and track replies automatically.
        </CardDescription>
      </CardHeader>
      
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <GoogleIcon />
              <span className="font-medium">Gmail</span>
            </div>
            <Button onClick={() => handleConnect('Gmail')}>
              Connect
            </Button>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <OutlookIcon />
              <span className="font-medium">Outlook</span>
            </div>
            <Button onClick={() => handleConnect('Outlook')}>
              Connect
            </Button>
          </div>
        </Card>
      </div>

      <Alert className="mt-6 bg-yellow-50 border-yellow-200 text-yellow-800">
        <AlertCircle className="h-4 w-4 !text-yellow-600" />
        <AlertTitle>Feature in Development</AlertTitle>
        <AlertDescription>
          Full email integration is currently under development. Connecting your account now will prepare you for when this feature is fully launched. No emails will be sent from your account until you enable a campaign.
        </AlertDescription>
      </Alert>
    </div>
  );
}