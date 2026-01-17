'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Globe,
  Bot,
  HardDrive,
  Bell,
  Save,
  RotateCcw,
  Moon,
  Sun,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { apiClient } from '@/lib/api-client';
import { toast, useThemeStore, useUIPreferencesStore } from '@/stores/app-store';
import { cn, formatBytes } from '@/lib/utils';
import type { SystemSettings } from '@/types';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useThemeStore();
  const { fileViewMode, setPreference, chatFontSize, showTimestamps, animationsEnabled, resetPreferences } = useUIPreferencesStore();

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  // Local state for editing
  const [editedSettings, setEditedSettings] = useState<Partial<SystemSettings> | null>(null);

  // Save settings mutation
  const saveSettings = useMutation({
    mutationFn: (data: Partial<SystemSettings>) => apiClient.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({ title: 'Settings saved', variant: 'success' });
      setEditedSettings(null);
    },
    onError: (error) => {
      toast({ title: 'Failed to save', description: error.message, variant: 'error' });
    },
  });

  // Get current value (edited or original)
  const getValue = <T extends keyof SystemSettings>(
    section: T,
    key: keyof SystemSettings[T]
  ): unknown => {
    const edited = editedSettings?.[section] as Record<string, unknown> | undefined;
    const original = settings?.[section] as Record<string, unknown> | undefined;
    if (edited?.[key as string] !== undefined) {
      return edited[key as string];
    }
    return original?.[key as string];
  };

  // Update value
  const setValue = <T extends keyof SystemSettings>(
    section: T,
    key: keyof SystemSettings[T],
    value: unknown
  ) => {
    setEditedSettings((prev) => ({
      ...prev,
      [section]: {
        ...(prev?.[section] || settings?.[section] || {}),
        [key]: value,
      },
    }));
  };

  const hasChanges = editedSettings !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure your Zentoria Personal instance
          </p>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditedSettings(null)}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Discard
            </Button>
            <Button
              onClick={() => editedSettings && saveSettings.mutate(editedSettings)}
              disabled={saveSettings.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="ai">AI Settings</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-zentoria-500" />
                General Settings
              </CardTitle>
              <CardDescription>
                Basic configuration for your instance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Application Name</label>
                <Input
                  value={getValue('general', 'appName') as string || ''}
                  onChange={(e) => setValue('general', 'appName', e.target.value)}
                  placeholder="Zentoria Personal"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Displayed in the browser tab and throughout the app
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Timezone</label>
                <select
                  value={getValue('general', 'timezone') as string || 'Europe/Amsterdam'}
                  onChange={(e) => setValue('general', 'timezone', e.target.value)}
                  className="w-full h-10 rounded-lg border border-input bg-transparent px-3"
                >
                  <option value="Europe/Amsterdam">Europe/Amsterdam (CET)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Language</label>
                <select
                  value={getValue('general', 'language') as string || 'nl'}
                  onChange={(e) => setValue('general', 'language', e.target.value)}
                  className="w-full h-10 rounded-lg border border-input bg-transparent px-3"
                >
                  <option value="nl">Nederlands</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Francais</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Settings */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-zentoria-500" />
                AI Settings
              </CardTitle>
              <CardDescription>
                Configure AI behavior and model settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Default Model</label>
                <select
                  value={getValue('ai', 'defaultModel') as string || 'gpt-4'}
                  onChange={(e) => setValue('ai', 'defaultModel', e.target.value)}
                  className="w-full h-10 rounded-lg border border-input bg-transparent px-3"
                >
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="claude-3-opus">Claude 3 Opus</option>
                  <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                  <option value="local">Local Model</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Temperature: {(getValue('ai', 'temperature') as number || 0.7).toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={getValue('ai', 'temperature') as number || 0.7}
                  onChange={(e) => setValue('ai', 'temperature', parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Max Tokens</label>
                <Input
                  type="number"
                  value={getValue('ai', 'maxTokens') as number || 4096}
                  onChange={(e) => setValue('ai', 'maxTokens', parseInt(e.target.value))}
                  min={256}
                  max={128000}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum response length (256 - 128,000)
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">System Prompt</label>
                <textarea
                  value={getValue('ai', 'systemPrompt') as string || ''}
                  onChange={(e) => setValue('ai', 'systemPrompt', e.target.value)}
                  placeholder="You are a helpful assistant..."
                  className="w-full h-32 rounded-lg border border-input bg-transparent px-3 py-2 text-sm resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Custom instructions for the AI assistant
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Storage Settings */}
        <TabsContent value="storage">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-zentoria-500" />
                Storage Settings
              </CardTitle>
              <CardDescription>
                Configure file storage and retention
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Max File Size</label>
                <select
                  value={getValue('storage', 'maxFileSize') as number || 104857600}
                  onChange={(e) => setValue('storage', 'maxFileSize', parseInt(e.target.value))}
                  className="w-full h-10 rounded-lg border border-input bg-transparent px-3"
                >
                  <option value={10485760}>10 MB</option>
                  <option value={52428800}>50 MB</option>
                  <option value={104857600}>100 MB</option>
                  <option value={524288000}>500 MB</option>
                  <option value={1073741824}>1 GB</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Allowed File Types</label>
                <Input
                  value={(getValue('storage', 'allowedTypes') as string[] || []).join(', ')}
                  onChange={(e) => setValue('storage', 'allowedTypes', e.target.value.split(',').map(s => s.trim()))}
                  placeholder="jpg, png, pdf, doc, xlsx"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Comma-separated list of allowed extensions
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Retention Period</label>
                <select
                  value={getValue('storage', 'retentionDays') as number || 365}
                  onChange={(e) => setValue('storage', 'retentionDays', parseInt(e.target.value))}
                  className="w-full h-10 rounded-lg border border-input bg-transparent px-3"
                >
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>1 year</option>
                  <option value={730}>2 years</option>
                  <option value={0}>Forever</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Files older than this will be automatically deleted
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Settings */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Moon className="h-5 w-5 text-zentoria-500" />
                Appearance
              </CardTitle>
              <CardDescription>
                Customize the look and feel
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-3 block">Theme</label>
                <div className="flex gap-2">
                  {(['light', 'dark', 'system'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={cn(
                        'flex-1 p-3 rounded-lg border transition-all',
                        theme === t
                          ? 'border-zentoria-500 bg-zentoria-500/10'
                          : 'border-light-border dark:border-dark-border hover:border-zentoria-500/50'
                      )}
                    >
                      <div className="flex flex-col items-center gap-2">
                        {t === 'light' && <Sun className="h-5 w-5" />}
                        {t === 'dark' && <Moon className="h-5 w-5" />}
                        {t === 'system' && <Monitor className="h-5 w-5" />}
                        <span className="text-sm capitalize">{t}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-3 block">File View</label>
                <div className="flex gap-2">
                  {(['grid', 'list'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setPreference('fileViewMode', mode)}
                      className={cn(
                        'flex-1 p-3 rounded-lg border transition-all',
                        fileViewMode === mode
                          ? 'border-zentoria-500 bg-zentoria-500/10'
                          : 'border-light-border dark:border-dark-border hover:border-zentoria-500/50'
                      )}
                    >
                      <span className="text-sm capitalize">{mode}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-3 block">Chat Font Size</label>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setPreference('chatFontSize', size)}
                      className={cn(
                        'flex-1 p-3 rounded-lg border transition-all',
                        chatFontSize === size
                          ? 'border-zentoria-500 bg-zentoria-500/10'
                          : 'border-light-border dark:border-dark-border hover:border-zentoria-500/50'
                      )}
                    >
                      <span className={cn(
                        'capitalize',
                        size === 'small' && 'text-xs',
                        size === 'medium' && 'text-sm',
                        size === 'large' && 'text-base'
                      )}>{size}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Show Timestamps</p>
                  <p className="text-sm text-muted-foreground">Display time on messages</p>
                </div>
                <button
                  onClick={() => setPreference('showTimestamps', !showTimestamps)}
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors',
                    showTimestamps ? 'bg-zentoria-500' : 'bg-gray-300 dark:bg-gray-600'
                  )}
                >
                  <div className={cn(
                    'w-5 h-5 rounded-full bg-white transition-transform',
                    showTimestamps ? 'translate-x-5' : 'translate-x-0.5'
                  )} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Animations</p>
                  <p className="text-sm text-muted-foreground">Enable UI animations</p>
                </div>
                <button
                  onClick={() => setPreference('animationsEnabled', !animationsEnabled)}
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors',
                    animationsEnabled ? 'bg-zentoria-500' : 'bg-gray-300 dark:bg-gray-600'
                  )}
                >
                  <div className={cn(
                    'w-5 h-5 rounded-full bg-white transition-transform',
                    animationsEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  )} />
                </button>
              </div>

              <Button variant="outline" onClick={resetPreferences}>
                Reset to Defaults
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-zentoria-500" />
                Notifications
              </CardTitle>
              <CardDescription>
                Configure notification settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Notifications</p>
                  <p className="text-sm text-muted-foreground">Receive alerts for important events</p>
                </div>
                <button
                  onClick={() => setValue('notifications', 'enabled', !getValue('notifications', 'enabled'))}
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors',
                    getValue('notifications', 'enabled') ? 'bg-zentoria-500' : 'bg-gray-300 dark:bg-gray-600'
                  )}
                >
                  <div className={cn(
                    'w-5 h-5 rounded-full bg-white transition-transform',
                    getValue('notifications', 'enabled') ? 'translate-x-5' : 'translate-x-0.5'
                  )} />
                </button>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Email Address</label>
                <Input
                  type="email"
                  value={getValue('notifications', 'email') as string || ''}
                  onChange={(e) => setValue('notifications', 'email', e.target.value)}
                  placeholder="your@email.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Receive email notifications for critical alerts
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Webhook URL</label>
                <Input
                  value={getValue('notifications', 'webhookUrl') as string || ''}
                  onChange={(e) => setValue('notifications', 'webhookUrl', e.target.value)}
                  placeholder="https://hooks.example.com/..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Send notifications to a webhook endpoint
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
