import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from 'lucide-react';

export default function ProfileSettings({ user, onUpdate }) {
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setFullName(user?.full_name || '');
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setIsSaved(false);
    await onUpdate({ full_name: fullName });
    setIsSaving(false);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const isChanged = fullName !== user?.full_name;

  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-none">
      <form onSubmit={handleSave}>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>This is how your name will be displayed in the app and in communications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={user?.email || ''} readOnly disabled className="bg-gray-100 cursor-not-allowed" />
            <p className="text-xs text-gray-500">Your email address cannot be changed.</p>
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button type="submit" disabled={isSaving || !isChanged}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? 'Saving...' : isSaved ? 'Saved!' : 'Save Changes'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}