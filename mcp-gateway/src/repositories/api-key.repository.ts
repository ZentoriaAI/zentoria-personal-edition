/**
 * API Key Repository
 */

import type { ContainerCradle } from '../container.js';

export interface ApiKeyRecord {
  id: string;
  userId: string;
  userEmail: string;
  name: string;
  scopes: string[];
  hashedKey: string;
  prefix: string;
  lastUsedAt?: Date;
  expiresAt?: Date;
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyData {
  id: string;
  userId: string;
  userEmail: string;
  name: string;
  scopes: string[];
  hashedKey: string;
  prefix: string;
  expiresAt?: Date;
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
}

export class ApiKeyRepository {
  private readonly prisma: ContainerCradle['prisma'];

  constructor({ prisma }: ContainerCradle) {
    this.prisma = prisma;
  }

  async create(data: CreateApiKeyData): Promise<ApiKeyRecord> {
    const result = await this.prisma.apiKey.create({
      data: {
        id: data.id,
        userId: data.userId,
        userEmail: data.userEmail,
        name: data.name,
        scopes: data.scopes,
        hashedKey: data.hashedKey,
        prefix: data.prefix,
        expiresAt: data.expiresAt,
        rateLimitPerMinute: data.rateLimitPerMinute,
        rateLimitPerDay: data.rateLimitPerDay,
      },
    });

    return this.mapToRecord(result);
  }

  async findById(id: string): Promise<ApiKeyRecord | null> {
    const result = await this.prisma.apiKey.findUnique({
      where: { id },
    });

    return result ? this.mapToRecord(result) : null;
  }

  async findByPrefix(prefix: string): Promise<ApiKeyRecord[]> {
    const results = await this.prisma.apiKey.findMany({
      where: { prefix },
    });

    return results.map(this.mapToRecord);
  }

  async findByUser(userId: string): Promise<ApiKeyRecord[]> {
    const results = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return results.map(this.mapToRecord);
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.apiKey.delete({
      where: { id },
    });
  }

  private mapToRecord(data: {
    id: string;
    userId: string;
    userEmail: string;
    name: string;
    scopes: string[];
    hashedKey: string;
    prefix: string;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    rateLimitPerMinute: number | null;
    rateLimitPerDay: number | null;
    createdAt: Date;
    updatedAt: Date;
  }): ApiKeyRecord {
    return {
      id: data.id,
      userId: data.userId,
      userEmail: data.userEmail,
      name: data.name,
      scopes: data.scopes,
      hashedKey: data.hashedKey,
      prefix: data.prefix,
      lastUsedAt: data.lastUsedAt || undefined,
      expiresAt: data.expiresAt || undefined,
      rateLimitPerMinute: data.rateLimitPerMinute || undefined,
      rateLimitPerDay: data.rateLimitPerDay || undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
