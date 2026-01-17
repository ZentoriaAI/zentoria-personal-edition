/**
 * Auth Service HTTP Client
 *
 * Communicates with Auth Service (Container 409)
 */

import type { ContainerCradle } from '../container.js';

export interface TokenValidationResult {
  valid: boolean;
  userId: string;
  email: string;
  name?: string;
  scopes?: string[];
  roles?: string[];
  metadata?: Record<string, unknown>;
}

export interface UserResult {
  id: string;
  email: string;
  name?: string;
  scopes?: string[];
  roles?: string[];
  metadata?: Record<string, unknown>;
}

export class AuthClient {
  private readonly baseUrl: string;
  private readonly logger: ContainerCradle['logger'];

  constructor({ logger }: ContainerCradle) {
    this.baseUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:4009';
    this.logger = logger;
  }

  /**
   * Validate a JWT token
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    const response = await fetch(`${this.baseUrl}/api/v1/token/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      this.logger.warn(
        { status: response.status },
        'Auth service token validation failed'
      );
      return {
        valid: false,
        userId: '',
        email: '',
      };
    }

    const data = await response.json() as TokenValidationResult;
    return data;
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<UserResult | null> {
    const response = await fetch(`${this.baseUrl}/api/v1/users/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Service-to-service auth would go here
        'X-Service-Auth': process.env.SERVICE_AUTH_TOKEN || '',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      this.logger.warn(
        { status: response.status, userId },
        'Auth service get user failed'
      );
      return null;
    }

    return response.json() as Promise<UserResult>;
  }

  /**
   * Check service health
   */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
