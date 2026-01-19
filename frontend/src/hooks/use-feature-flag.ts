/**
 * Feature Flags Hook
 *
 * Provides React hook for checking feature flag status
 */

import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface FeatureFlagResult {
  isEnabled: boolean;
  rolloutPercentage: number;
  reason: 'disabled' | 'rollout' | 'exception' | 'blocked' | 'not_found';
}

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  description?: string;
  exceptionUsers?: string[];
  blockedUsers?: string[];
}

/**
 * Hook: Check if a feature flag is enabled
 *
 * Usage:
 * const { isEnabled, rolloutPercentage, isLoading } = useFeatureFlag('chat-v2');
 * if (isEnabled) <ChatV2Component />
 */
export function useFeatureFlag(flagName: string, userId?: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['featureFlag', flagName, userId],
    queryFn: async () => {
      if (userId) {
        // Check flag for specific user
        const response = await apiClient.post<FeatureFlagResult>(
          `/api/v1/features/${flagName}/check`,
          { userId }
        );
        return response.data;
      } else {
        // Get flag details
        const response = await apiClient.get<FeatureFlag>(
          `/api/v1/features/${flagName}`
        );
        return {
          isEnabled: response.data.enabled,
          rolloutPercentage: response.data.rolloutPercentage,
          reason: 'not_found' as const,
        };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    isEnabled: data?.isEnabled ?? false,
    rolloutPercentage: data?.rolloutPercentage ?? 0,
    reason: data?.reason ?? 'not_found',
    isLoading,
    error,
  };
}

/**
 * Hook: Get all feature flags
 *
 * Usage:
 * const { flags, isLoading } = useAllFeatureFlags();
 */
export function useAllFeatureFlags() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['featureFlags', 'all'],
    queryFn: async () => {
      const response = await apiClient.get<Record<string, FeatureFlag>>(
        '/api/v1/features'
      );
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    flags: data ?? {},
    isLoading,
    error,
  };
}

/**
 * Hook: Admin feature flag management
 *
 * Usage:
 * const { updateFlag, setRollout, addException } = useFeatureFlagAdmin();
 * await updateFlag('chat-v2', { enabled: true });
 */
export function useFeatureFlagAdmin() {
  const updateFlag = useCallback(
    async (flagName: string, updates: Partial<FeatureFlag>) => {
      return apiClient.put(`/api/v1/features/${flagName}`, updates);
    },
    []
  );

  const setRollout = useCallback(
    async (flagName: string, percentage: number) => {
      return apiClient.post(`/api/v1/features/${flagName}/rollout`, {
        rolloutPercentage: percentage,
      });
    },
    []
  );

  const addException = useCallback(
    async (flagName: string, userId: string) => {
      return apiClient.post(`/api/v1/features/${flagName}/exceptions`, {
        userId,
      });
    },
    []
  );

  const removeException = useCallback(
    async (flagName: string, userId: string) => {
      return apiClient.delete(
        `/api/v1/features/${flagName}/exceptions/${userId}`
      );
    },
    []
  );

  const blockUser = useCallback(
    async (flagName: string, userId: string) => {
      return apiClient.post(`/api/v1/features/${flagName}/block`, { userId });
    },
    []
  );

  const unblockUser = useCallback(
    async (flagName: string, userId: string) => {
      return apiClient.delete(`/api/v1/features/${flagName}/blocked/${userId}`);
    },
    []
  );

  const createFlag = useCallback(
    async (flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>) => {
      return apiClient.post('/api/v1/features', flag);
    },
    []
  );

  const deleteFlag = useCallback(async (flagName: string) => {
    return apiClient.delete(`/api/v1/features/${flagName}`);
  }, []);

  return {
    updateFlag,
    setRollout,
    addException,
    removeException,
    blockUser,
    unblockUser,
    createFlag,
    deleteFlag,
  };
}

/**
 * Component Wrapper: Only render if feature is enabled
 *
 * Usage:
 * <FeatureGate flagName="chat-v2" userId={userId}>
 *   <ChatV2Component />
 * </FeatureGate>
 */
export function FeatureGate({
  flagName,
  userId,
  children,
  fallback = null,
}: {
  flagName: string;
  userId?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { isEnabled, isLoading } = useFeatureFlag(flagName, userId);

  if (isLoading) {
    return null;
  }

  return isEnabled ? <>{children}</> : <>{fallback}</>;
}
