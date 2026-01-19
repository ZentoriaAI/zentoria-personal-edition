/**
 * Settings Service
 *
 * Handles user settings management for AI preferences, appearance, and configuration.
 * Provides persistence and caching for user-specific settings.
 */

import { z } from 'zod';
import type { UserSettings } from '@prisma/client';
import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';
import { CACHE } from '../config/constants.js';

// ============================================================================
// Types and Schemas
// ============================================================================

export const UpdateSettingsSchema = z.object({
  // AI Settings
  defaultAgentId: z.string().cuid().nullable().optional(),
  defaultModel: z.string().optional(),
  defaultTemperature: z.number().min(0).max(2).optional(),
  defaultMaxTokens: z.number().min(1).max(16384).nullable().optional(),
  defaultSystemPrompt: z.string().max(10000).nullable().optional(),
  contextWindow: z.number().min(1).max(100).optional(),
  streamResponses: z.boolean().optional(),
  showTokenCounts: z.boolean().optional(),
  autoGenerateTitles: z.boolean().optional(),
  saveHistory: z.boolean().optional(),

  // Appearance Settings
  theme: z.enum(['light', 'dark', 'system']).optional(),
  fontSize: z.enum(['small', 'medium', 'large']).optional(),
  codeTheme: z.string().optional(),

  // Behavior Settings
  sendOnEnter: z.boolean().optional(),
  enableSounds: z.boolean().optional(),
  enableNotifications: z.boolean().optional(),

  // Advanced Settings
  keyboardShortcuts: z.record(z.string()).optional(),
  customPrompts: z.array(z.object({
    id: z.string(),
    name: z.string(),
    content: z.string(),
    category: z.string().optional(),
  })).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

export interface SettingsResponse extends UserSettings {
  agent?: {
    id: string;
    name: string;
    displayName: string;
  } | null;
}

// ============================================================================
// Service Implementation
// ============================================================================

export class SettingsService {
  private readonly prisma: ContainerCradle['prisma'];
  private readonly redis: ContainerCradle['redis'];
  private readonly auditRepository: ContainerCradle['auditRepository'];
  private readonly logger: ContainerCradle['logger'];

  constructor({
    prisma,
    redis,
    auditRepository,
    logger,
  }: ContainerCradle) {
    this.prisma = prisma;
    this.redis = redis;
    this.auditRepository = auditRepository;
    this.logger = logger;
  }

  /**
   * Get user settings (creates default if not exists)
   */
  async getSettings(userId: string): Promise<SettingsResponse> {
    const cacheKey = `settings:${userId}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      include: {
        defaultAgent: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
    });

    if (!settings) {
      // Get default agent
      const defaultAgent = await this.prisma.agent.findFirst({
        where: { isDefault: true, isActive: true },
        select: { id: true },
      });

      settings = await this.prisma.userSettings.create({
        data: {
          userId,
          defaultAgentId: defaultAgent?.id,
        },
        include: {
          defaultAgent: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
      });
    }

    const response: SettingsResponse = {
      ...settings,
      agent: settings.defaultAgent,
    };

    await this.redis.setex(cacheKey, CACHE.SETTINGS_TTL_SECONDS, JSON.stringify(response));

    return response;
  }

  /**
   * Update user settings
   */
  async updateSettings(
    userId: string,
    input: UpdateSettingsInput
  ): Promise<SettingsResponse> {
    // Ensure settings exist
    await this.getSettings(userId);

    // Validate agent if provided
    if (input.defaultAgentId !== undefined && input.defaultAgentId !== null) {
      const agent = await this.prisma.agent.findFirst({
        where: { id: input.defaultAgentId, isActive: true },
      });
      if (!agent) {
        throw Errors.notFound('Agent', input.defaultAgentId);
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const settings = await this.prisma.userSettings.update({
      where: { userId },
      data: updateData,
      include: {
        defaultAgent: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
    });

    // Invalidate cache
    await this.redis.del(`settings:${userId}`);

    // Audit log
    await this.auditRepository.logAsync({
      action: 'settings_updated',
      userId,
      metadata: { changes: Object.keys(input) },
    });

    const response: SettingsResponse = {
      ...settings,
      agent: settings.defaultAgent,
    };

    return response;
  }

  /**
   * Reset settings to defaults
   */
  async resetSettings(userId: string): Promise<SettingsResponse> {
    const defaultAgent = await this.prisma.agent.findFirst({
      where: { isDefault: true, isActive: true },
    });

    const settings = await this.prisma.userSettings.update({
      where: { userId },
      data: {
        defaultAgentId: defaultAgent?.id,
        defaultModel: 'llama3.2:3b',
        defaultTemperature: 0.7,
        defaultMaxTokens: null,
        defaultSystemPrompt: null,
        contextWindow: 10,
        streamResponses: true,
        showTokenCounts: false,
        autoGenerateTitles: true,
        saveHistory: true,
        theme: 'system',
        fontSize: 'medium',
        codeTheme: 'github-dark',
        sendOnEnter: true,
        enableSounds: false,
        enableNotifications: true,
        keyboardShortcuts: {},
        customPrompts: [],
        metadata: {},
      },
      include: {
        defaultAgent: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
    });

    await this.redis.del(`settings:${userId}`);

    await this.auditRepository.logAsync({
      action: 'settings_reset',
      userId,
    });

    return {
      ...settings,
      agent: settings.defaultAgent,
    };
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<Array<{
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    description?: string;
  }>> {
    // Return hardcoded list of available models
    // In production, this could be fetched from AI Orchestrator
    return [
      {
        id: 'llama3.2:3b',
        name: 'Llama 3.2 3B',
        provider: 'Ollama',
        contextWindow: 8192,
        description: 'Fast general-purpose model for everyday tasks',
      },
      {
        id: 'codellama:7b',
        name: 'Code Llama 7B',
        provider: 'Ollama',
        contextWindow: 16384,
        description: 'Specialized for code generation and debugging',
      },
      {
        id: 'mistral:7b',
        name: 'Mistral 7B',
        provider: 'Ollama',
        contextWindow: 32768,
        description: 'Efficient model with good reasoning capabilities',
      },
      {
        id: 'mixtral:8x7b',
        name: 'Mixtral 8x7B',
        provider: 'Ollama',
        contextWindow: 32768,
        description: 'High-performance mixture of experts model',
      },
      {
        id: 'phi3:mini',
        name: 'Phi-3 Mini',
        provider: 'Ollama',
        contextWindow: 4096,
        description: 'Small but capable model for quick tasks',
      },
    ];
  }

  /**
   * Add a custom prompt
   */
  async addCustomPrompt(
    userId: string,
    prompt: {
      name: string;
      content: string;
      category?: string;
    }
  ): Promise<SettingsResponse> {
    const settings = await this.getSettings(userId);
    const customPrompts = (settings.customPrompts as unknown[] || []) as Array<{
      id: string;
      name: string;
      content: string;
      category?: string;
    }>;

    const newPrompt = {
      id: `prompt_${Date.now()}`,
      name: prompt.name,
      content: prompt.content,
      category: prompt.category || 'general',
    };

    customPrompts.push(newPrompt);

    return this.updateSettings(userId, { customPrompts });
  }

  /**
   * Remove a custom prompt
   */
  async removeCustomPrompt(
    userId: string,
    promptId: string
  ): Promise<SettingsResponse> {
    const settings = await this.getSettings(userId);
    const customPrompts = (settings.customPrompts as unknown[] || []) as Array<{
      id: string;
      name: string;
      content: string;
      category?: string;
    }>;

    const filtered = customPrompts.filter((p) => p.id !== promptId);

    return this.updateSettings(userId, { customPrompts: filtered });
  }

  /**
   * Export settings for backup
   */
  async exportSettings(userId: string): Promise<Record<string, unknown>> {
    const settings = await this.getSettings(userId);

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings: {
        defaultModel: settings.defaultModel,
        defaultTemperature: settings.defaultTemperature,
        defaultMaxTokens: settings.defaultMaxTokens,
        defaultSystemPrompt: settings.defaultSystemPrompt,
        contextWindow: settings.contextWindow,
        streamResponses: settings.streamResponses,
        showTokenCounts: settings.showTokenCounts,
        autoGenerateTitles: settings.autoGenerateTitles,
        saveHistory: settings.saveHistory,
        theme: settings.theme,
        fontSize: settings.fontSize,
        codeTheme: settings.codeTheme,
        sendOnEnter: settings.sendOnEnter,
        enableSounds: settings.enableSounds,
        enableNotifications: settings.enableNotifications,
        keyboardShortcuts: settings.keyboardShortcuts,
        customPrompts: settings.customPrompts,
      },
    };
  }

  /**
   * Import settings from backup
   */
  async importSettings(
    userId: string,
    backup: Record<string, unknown>
  ): Promise<SettingsResponse> {
    if (backup.version !== '1.0') {
      throw Errors.badRequest('Unsupported settings backup version');
    }

    const settings = backup.settings as Record<string, unknown>;
    if (!settings) {
      throw Errors.badRequest('Invalid settings backup format');
    }

    const validatedInput = UpdateSettingsSchema.parse(settings);

    return this.updateSettings(userId, validatedInput);
  }
}
