import React, { useState } from "react";
import { Settings, Bell, Lock, Mail, Database, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: false,
    weeklyReports: true,
    importYetiEnabled: false,
    geminiEnabled: false,
    lushaEnabled: false,
    autoSave: true,
  });

  const handleToggle = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-gray-900" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-1">
              Manage your account preferences (Mock Mode)
            </p>
          </div>
          <Badge variant="outline" className="ml-auto bg-blue-50 text-blue-700 border-blue-200">
            Mock Data
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-gray-600" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <CardDescription>
              Control how and when you receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email-notifications" className="text-base font-medium">
                  Email Notifications
                </Label>
                <p className="text-sm text-gray-600">
                  Receive updates via email
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={settings.emailNotifications}
                onCheckedChange={() => handleToggle("emailNotifications")}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <Label htmlFor="push-notifications" className="text-base font-medium">
                  Push Notifications
                </Label>
                <p className="text-sm text-gray-600">
                  Receive push notifications in browser
                </p>
              </div>
              <Switch
                id="push-notifications"
                checked={settings.pushNotifications}
                onCheckedChange={() => handleToggle("pushNotifications")}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <Label htmlFor="weekly-reports" className="text-base font-medium">
                  Weekly Reports
                </Label>
                <p className="text-sm text-gray-600">
                  Get weekly summary emails
                </p>
              </div>
              <Switch
                id="weekly-reports"
                checked={settings.weeklyReports}
                onCheckedChange={() => handleToggle("weeklyReports")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-gray-600" />
              <CardTitle>Data Sources</CardTitle>
            </div>
            <CardDescription>
              Configure external data integrations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="importyeti" className="text-base font-medium">
                  ImportYeti API
                </Label>
                <p className="text-sm text-gray-600">
                  Enable company search and shipment data
                </p>
              </div>
              <Switch
                id="importyeti"
                checked={settings.importYetiEnabled}
                onCheckedChange={() => handleToggle("importYetiEnabled")}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <Label htmlFor="gemini" className="text-base font-medium">
                  Gemini Enrichment
                </Label>
                <p className="text-sm text-gray-600">
                  AI-powered company analysis
                </p>
              </div>
              <Switch
                id="gemini"
                checked={settings.geminiEnabled}
                onCheckedChange={() => handleToggle("geminiEnabled")}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <Label htmlFor="lusha" className="text-base font-medium">
                  Lusha Contacts
                </Label>
                <p className="text-sm text-gray-600">
                  Enrich contact information
                </p>
              </div>
              <Switch
                id="lusha"
                checked={settings.lushaEnabled}
                onCheckedChange={() => handleToggle("lushaEnabled")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-gray-600" />
              <CardTitle>Preferences</CardTitle>
            </div>
            <CardDescription>
              Customize your experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-save" className="text-base font-medium">
                  Auto-save searches
                </Label>
                <p className="text-sm text-gray-600">
                  Automatically save search results
                </p>
              </div>
              <Switch
                id="auto-save"
                checked={settings.autoSave}
                onCheckedChange={() => handleToggle("autoSave")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-gray-600" />
              <CardTitle>Security</CardTitle>
            </div>
            <CardDescription>
              Manage your password and security settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                placeholder="Enter current password"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password"
                className="mt-1"
              />
            </div>
            <Button onClick={() => alert("Password update coming soon!")}>
              Update Password
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-gray-600" />
              <CardTitle>Account Information</CardTitle>
            </div>
            <CardDescription>
              Your profile details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value="user@example.com"
                disabled
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                type="text"
                placeholder="Acme Corp"
                className="mt-1"
              />
            </div>
            <Button onClick={() => alert("Profile update coming soon!")}>
              Save Changes
            </Button>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-4">
          <Button
            variant="outline"
            onClick={() => {
              const confirmed = confirm("Are you sure you want to reset all settings to defaults?");
              if (confirmed) {
                setSettings({
                  emailNotifications: true,
                  pushNotifications: false,
                  weeklyReports: true,
                  importYetiEnabled: false,
                  geminiEnabled: false,
                  lushaEnabled: false,
                  autoSave: true,
                });
                alert("Settings reset to defaults!");
              }
            }}
          >
            Reset to Defaults
          </Button>
        </div>
      </div>
    </div>
  );
}
