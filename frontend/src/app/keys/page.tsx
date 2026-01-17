'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
  Activity,
  AlertTriangle,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/stores/app-store';
import { cn, formatRelativeTime, copyToClipboard } from '@/lib/utils';
import type { ApiKey, ApiKeyScope, CreateApiKeyRequest } from '@/types';

const availableScopes: { value: ApiKeyScope; label: string; description: string }[] = [
  { value: 'full', label: 'Full Access', description: 'Complete access to all features' },
  { value: 'read', label: 'Read Only', description: 'View data without modifications' },
  { value: 'write', label: 'Write', description: 'Create and modify data' },
  { value: 'chat', label: 'Chat', description: 'Access to AI chat features' },
  { value: 'files', label: 'Files', description: 'File upload and management' },
  { value: 'workflows', label: 'Workflows', description: 'Workflow management' },
];

const expiryOptions = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
  { value: 0, label: 'Never' },
];

export default function KeysPage() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  // Form state
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>(['read']);
  const [expiresIn, setExpiresIn] = useState(30);

  // Fetch API keys
  const { data: keys, isLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: () => apiClient.listApiKeys(),
  });

  // Create key mutation
  const createKey = useMutation({
    mutationFn: (data: CreateApiKeyRequest) => apiClient.createApiKey(data),
    onSuccess: (data) => {
      setNewKey(data.fullKey);
      setShowCreateDialog(false);
      setShowKeyDialog(true);
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      // Reset form
      setKeyName('');
      setSelectedScopes(['read']);
      setExpiresIn(30);
    },
    onError: (error) => {
      toast({ title: 'Failed to create key', description: error.message, variant: 'error' });
    },
  });

  // Revoke key mutation
  const revokeKey = useMutation({
    mutationFn: (id: string) => apiClient.revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      toast({ title: 'API key revoked', variant: 'success' });
    },
  });

  // Handle copy
  const handleCopy = async (text: string, id: string) => {
    await copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: 'Copied to clipboard', variant: 'success' });
  };

  // Toggle scope
  const toggleScope = (scope: ApiKeyScope) => {
    if (scope === 'full') {
      setSelectedScopes(['full']);
    } else {
      setSelectedScopes((prev) => {
        if (prev.includes('full')) {
          return [scope];
        }
        if (prev.includes(scope)) {
          return prev.filter((s) => s !== scope);
        }
        return [...prev, scope];
      });
    }
  };

  // Handle create
  const handleCreate = () => {
    if (!keyName.trim()) {
      toast({ title: 'Please enter a name', variant: 'error' });
      return;
    }
    createKey.mutate({
      name: keyName.trim(),
      scopes: selectedScopes,
      expiresIn: expiresIn || undefined,
    });
  };

  const activeKeys = keys?.filter(k => !k.expiresAt || new Date(k.expiresAt) > new Date()) || [];
  const totalUsage = keys?.reduce((sum, k) => sum + k.usageCount, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Keys"
          value={keys?.length || 0}
          description="API keys created"
          icon={<Key className="h-4 w-4 text-zentoria-500" />}
        />
        <StatCard
          title="Active Keys"
          value={activeKeys.length}
          description="Non-expired keys"
          icon={<Shield className="h-4 w-4 text-green-500" />}
        />
        <StatCard
          title="Total Usage"
          value={totalUsage}
          description="Total API calls"
          icon={<Activity className="h-4 w-4 text-blue-500" />}
        />
        <StatCard
          title="Expiring Soon"
          value={keys?.filter(k => {
            if (!k.expiresAt) return false;
            const expires = new Date(k.expiresAt);
            const sevenDays = new Date();
            sevenDays.setDate(sevenDays.getDate() + 7);
            return expires <= sevenDays && expires > new Date();
          }).length || 0}
          description="Within 7 days"
          icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">API Keys</h2>
          <p className="text-sm text-muted-foreground">
            Manage API keys for external access
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Key
        </Button>
      </div>

      {/* Keys list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-20 rounded-lg" />
              ))}
            </div>
          ) : keys && keys.length > 0 ? (
            <div className="divide-y">
              {keys.map((key) => {
                const isExpired = key.expiresAt && new Date(key.expiresAt) < new Date();
                const isExpiringSoon = key.expiresAt && (() => {
                  const expires = new Date(key.expiresAt);
                  const sevenDays = new Date();
                  sevenDays.setDate(sevenDays.getDate() + 7);
                  return expires <= sevenDays && expires > new Date();
                })();

                return (
                  <div
                    key={key.id}
                    className={cn(
                      'p-4 flex items-center gap-4',
                      isExpired && 'opacity-50'
                    )}
                  >
                    <div className={cn(
                      'w-12 h-12 rounded-lg flex items-center justify-center shrink-0',
                      isExpired ? 'bg-gray-500/10' : 'bg-zentoria-500/10'
                    )}>
                      <Key className={cn(
                        'h-6 w-6',
                        isExpired ? 'text-gray-500' : 'text-zentoria-500'
                      )} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{key.name}</h3>
                        {isExpired && <Badge variant="error">Expired</Badge>}
                        {isExpiringSoon && <Badge variant="warning">Expiring soon</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <code className="bg-light-surface dark:bg-dark-elevated px-2 py-0.5 rounded font-mono text-xs">
                          {key.keyPrefix}...
                        </code>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleCopy(key.keyPrefix + '...', key.id)}
                        >
                          {copiedId === key.id ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          {key.usageCount} calls
                        </span>
                        {key.lastUsed && (
                          <span className="flex items-center gap-1">
                            Last used: {formatRelativeTime(key.lastUsed)}
                          </span>
                        )}
                        {key.expiresAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {isExpired
                              ? 'Expired'
                              : `Expires: ${formatRelativeTime(key.expiresAt)}`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-xs">
                          {scope}
                        </Badge>
                      ))}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={() => revokeKey.mutate(key.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center">
              <Key className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No API keys</h3>
              <p className="text-muted-foreground mb-4">
                Create an API key to access Zentoria programmatically
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Generate a new API key for external access
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Name</label>
              <Input
                placeholder="My API Key"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Scopes</label>
              <div className="grid grid-cols-2 gap-2">
                {availableScopes.map((scope) => (
                  <button
                    key={scope.value}
                    onClick={() => toggleScope(scope.value)}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      selectedScopes.includes(scope.value)
                        ? 'border-zentoria-500 bg-zentoria-500/10'
                        : 'border-light-border dark:border-dark-border hover:border-zentoria-500/50'
                    )}
                  >
                    <p className="font-medium text-sm">{scope.label}</p>
                    <p className="text-xs text-muted-foreground">{scope.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Expiration</label>
              <div className="flex flex-wrap gap-2">
                {expiryOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={expiresIn === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setExpiresIn(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createKey.isPending}>
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show key dialog */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Copy your API key now. You won&apos;t be able to see it again!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-light-surface dark:bg-dark-elevated p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Your API Key</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4 mr-1" />
                  ) : (
                    <Eye className="h-4 w-4 mr-1" />
                  )}
                  {showKey ? 'Hide' : 'Show'}
                </Button>
              </div>
              <code className="block w-full p-2 bg-dark-bg text-gray-200 rounded font-mono text-sm break-all">
                {showKey ? newKey : newKey?.replace(/./g, '*')}
              </code>
            </div>

            <Button
              className="w-full"
              onClick={() => newKey && handleCopy(newKey, 'new-key')}
            >
              {copiedId === 'new-key' ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Store this key securely. It will not be shown again.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowKeyDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
