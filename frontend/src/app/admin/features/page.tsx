'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Flag,
  Plus,
  Trash2,
  Settings,
  Users,
  Percent,
  ToggleLeft,
  ToggleRight,
  Search,
  RefreshCw,
  ChevronRight,
  X,
  UserPlus,
  UserMinus,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/stores/app-store';
import type { FeatureFlag, CreateFeatureFlagRequest } from '@/types';

export default function AdminFeaturesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
  const [showExceptionModal, setShowExceptionModal] = useState(false);

  // Fetch all flags
  const { data: flags, isLoading, error, refetch } = useQuery({
    queryKey: ['featureFlags'],
    queryFn: () => apiClient.listFeatureFlags(),
  });

  // Create flag mutation
  const createMutation = useMutation({
    mutationFn: (flag: CreateFeatureFlagRequest) => apiClient.createFeatureFlag(flag),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['featureFlags'] });
      setShowCreateModal(false);
      toast({ title: 'Feature flag created', variant: 'success' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to create flag', description: err.message, variant: 'error' });
    },
  });

  // Update flag mutation
  const updateMutation = useMutation({
    mutationFn: ({ name, updates }: { name: string; updates: Partial<FeatureFlag> }) =>
      apiClient.updateFeatureFlag(name, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['featureFlags'] });
      toast({ title: 'Flag updated', variant: 'success' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update flag', description: err.message, variant: 'error' });
    },
  });

  // Delete flag mutation
  const deleteMutation = useMutation({
    mutationFn: (name: string) => apiClient.deleteFeatureFlag(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['featureFlags'] });
      setSelectedFlag(null);
      toast({ title: 'Flag deleted', variant: 'success' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to delete flag', description: err.message, variant: 'error' });
    },
  });

  // Set rollout mutation
  const rolloutMutation = useMutation({
    mutationFn: ({ name, percentage }: { name: string; percentage: number }) =>
      apiClient.setFeatureFlagRollout(name, percentage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['featureFlags'] });
      toast({ title: 'Rollout updated', variant: 'success' });
    },
  });

  // Add exception mutation
  const addExceptionMutation = useMutation({
    mutationFn: ({ name, userId }: { name: string; userId: string }) =>
      apiClient.addFeatureFlagException(name, userId, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['featureFlags'] });
      toast({ title: 'User added to exceptions', variant: 'success' });
    },
  });

  // Remove exception mutation
  const removeExceptionMutation = useMutation({
    mutationFn: ({ name, userId }: { name: string; userId: string }) =>
      apiClient.removeFeatureFlagException(name, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['featureFlags'] });
      toast({ title: 'User removed from exceptions', variant: 'success' });
    },
  });

  // Filter flags by search
  const flagsList = flags ? Object.values(flags) : [];
  const filteredFlags = flagsList.filter(
    (flag) =>
      flag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flag.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag className="h-6 w-6 text-zentoria-500" />
            Feature Flags
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage feature toggles and rollout percentages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Flag
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search flags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-500">Failed to load feature flags: {(error as Error).message}</p>
          </CardContent>
        </Card>
      )}

      {/* Flags grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          // Loading skeleton
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-1/2" />
                <div className="h-3 bg-muted rounded w-3/4 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded" />
              </CardContent>
            </Card>
          ))
        ) : filteredFlags.length === 0 ? (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Flag className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No matching flags found' : 'No feature flags yet'}
              </p>
              <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Flag
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredFlags.map((flag) => (
            <FlagCard
              key={flag.name}
              flag={flag}
              onToggle={() =>
                updateMutation.mutate({
                  name: flag.name,
                  updates: { enabled: !flag.enabled },
                })
              }
              onSelect={() => setSelectedFlag(flag)}
            />
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateFlagModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* Detail Panel */}
      {selectedFlag && (
        <FlagDetailPanel
          flag={selectedFlag}
          onClose={() => setSelectedFlag(null)}
          onDelete={() => deleteMutation.mutate(selectedFlag.name)}
          onUpdateRollout={(percentage) =>
            rolloutMutation.mutate({ name: selectedFlag.name, percentage })
          }
          onAddException={(userId) =>
            addExceptionMutation.mutate({ name: selectedFlag.name, userId })
          }
          onRemoveException={(userId) =>
            removeExceptionMutation.mutate({ name: selectedFlag.name, userId })
          }
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// Flag Card Component
function FlagCard({
  flag,
  onToggle,
  onSelect,
}: {
  flag: FeatureFlag;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        flag.enabled && 'border-green-500/50'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-medium">{flag.name}</CardTitle>
            <CardDescription className="text-xs mt-1 line-clamp-2">
              {flag.description || 'No description'}
            </CardDescription>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-1"
          >
            {flag.enabled ? (
              <ToggleRight className="h-6 w-6 text-green-500" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-muted-foreground" />
            )}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={flag.enabled ? 'default' : 'secondary'}>
            {flag.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Percent className="h-3 w-3" />
            {flag.rolloutPercentage}%
          </Badge>
          {flag.exceptionUsers && flag.exceptionUsers.length > 0 && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {flag.exceptionUsers.length}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Create Flag Modal
function CreateFlagModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (data: CreateFeatureFlagRequest) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [rollout, setRollout] = useState(100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      description,
      enabled,
      rolloutPercentage: rollout,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-md mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Create Feature Flag</CardTitle>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="feature-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="What does this flag control?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Enabled by default</Label>
              <button type="button" onClick={() => setEnabled(!enabled)}>
                {enabled ? (
                  <ToggleRight className="h-6 w-6 text-green-500" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                )}
              </button>
            </div>

            <div className="space-y-2">
              <Label>Rollout Percentage: {rollout}%</Label>
              <input
                type="range"
                min="0"
                max="100"
                value={rollout}
                onChange={(e) => setRollout(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !name.trim()}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Flag'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Flag Detail Panel
function FlagDetailPanel({
  flag,
  onClose,
  onDelete,
  onUpdateRollout,
  onAddException,
  onRemoveException,
  isDeleting,
}: {
  flag: FeatureFlag;
  onClose: () => void;
  onDelete: () => void;
  onUpdateRollout: (percentage: number) => void;
  onAddException: (userId: string) => void;
  onRemoveException: (userId: string) => void;
  isDeleting: boolean;
}) {
  const [rollout, setRollout] = useState(flag.rolloutPercentage);
  const [newUserId, setNewUserId] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {flag.name}
                <Badge variant={flag.enabled ? 'default' : 'secondary'}>
                  {flag.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">{flag.description}</CardDescription>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Rollout Section */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Rollout Percentage
              </Label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={rollout}
                  onChange={(e) => setRollout(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-lg font-medium w-12 text-right">{rollout}%</span>
              </div>
              {rollout !== flag.rolloutPercentage && (
                <Button
                  size="sm"
                  onClick={() => onUpdateRollout(rollout)}
                  className="w-full"
                >
                  Save Rollout
                </Button>
              )}
            </div>

            {/* Exceptions Section */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                User Exceptions ({flag.exceptionUsers?.length || 0})
              </Label>

              <div className="flex gap-2">
                <Input
                  placeholder="User ID"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  onClick={() => {
                    if (newUserId.trim()) {
                      onAddException(newUserId.trim());
                      setNewUserId('');
                    }
                  }}
                  disabled={!newUserId.trim()}
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>

              {flag.exceptionUsers && flag.exceptionUsers.length > 0 && (
                <div className="space-y-2">
                  {flag.exceptionUsers.map((userId) => (
                    <div
                      key={userId}
                      className="flex items-center justify-between p-2 bg-muted rounded-lg"
                    >
                      <span className="text-sm font-mono">{userId}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRemoveException(userId)}
                      >
                        <UserMinus className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Blocked Users Section */}
            {flag.blockedUsers && flag.blockedUsers.length > 0 && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  Blocked Users ({flag.blockedUsers.length})
                </Label>
                <div className="space-y-2">
                  {flag.blockedUsers.map((userId) => (
                    <div
                      key={userId}
                      className="flex items-center justify-between p-2 bg-red-500/10 border border-red-500/20 rounded-lg"
                    >
                      <span className="text-sm font-mono">{userId}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="pt-4 border-t space-y-2 text-sm text-muted-foreground">
              {flag.createdAt && (
                <p>Created: {new Date(flag.createdAt).toLocaleString()}</p>
              )}
              {flag.updatedAt && (
                <p>Updated: {new Date(flag.updatedAt).toLocaleString()}</p>
              )}
            </div>

            {/* Delete Section */}
            <div className="pt-4 border-t">
              {showDeleteConfirm ? (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg space-y-3">
                  <p className="text-sm text-red-500">
                    Are you sure you want to delete this flag? This action cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={onDelete}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full text-red-500 hover:bg-red-500/10"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Flag
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
