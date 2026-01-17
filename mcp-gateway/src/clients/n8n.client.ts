/**
 * n8n Workflow HTTP Client
 *
 * Communicates with n8n Workflow Engine (Container 402)
 */

import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';

export interface TriggerWorkflowPayload {
  workflowId: string;
  payload?: Record<string, unknown>;
  webhookPath?: string;
  waitForCompletion?: boolean;
}

export interface TriggerResult {
  executionId: string;
  status?: 'success' | 'error';
  data?: Record<string, unknown>;
}

export interface ExecutionStatus {
  executionId: string;
  status: 'queued' | 'running' | 'success' | 'error' | 'cancelled';
  progress?: number;
  currentNode?: string;
  data?: Record<string, unknown>;
  error?: string;
  finishedAt?: string;
}

export class N8nClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger: ContainerCradle['logger'];

  constructor({ logger }: ContainerCradle) {
    this.baseUrl = process.env.N8N_URL || 'http://n8n:5678';
    this.apiKey = process.env.N8N_API_KEY || '';
    this.logger = logger;
  }

  /**
   * Trigger a workflow
   */
  async triggerWorkflow(payload: TriggerWorkflowPayload): Promise<TriggerResult> {
    let url: string;
    let method: string;
    let body: string | undefined;

    if (payload.webhookPath) {
      // Trigger via webhook
      url = `${this.baseUrl}/webhook/${payload.webhookPath}`;
      method = 'POST';
      body = JSON.stringify(payload.payload || {});
    } else {
      // Trigger via API
      url = `${this.baseUrl}/api/v1/workflows/${payload.workflowId}/activate`;
      method = 'POST';
      body = JSON.stringify({
        runData: payload.payload || {},
        waitTillFinished: payload.waitForCompletion ?? false,
      });
    }

    this.logger.debug(
      { workflowId: payload.workflowId, url },
      'Triggering n8n workflow'
    );

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'X-N8N-API-KEY': this.apiKey }),
      },
      body,
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        { status: response.status, error, workflowId: payload.workflowId },
        'n8n workflow trigger failed'
      );
      throw Errors.workflowError(response.status, error);
    }

    const data = await response.json() as {
      id?: string;
      executionId?: string;
      data?: Record<string, unknown>;
    };

    return {
      executionId: data.executionId || data.id || 'unknown',
      status: 'success',
      data: data.data,
    };
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId: string): Promise<ExecutionStatus> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/executions/${executionId}`,
      {
        method: 'GET',
        headers: {
          ...(this.apiKey && { 'X-N8N-API-KEY': this.apiKey }),
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return {
          executionId,
          status: 'queued',
        };
      }
      throw Errors.workflowError(response.status, 'Failed to get execution status');
    }

    const data = await response.json() as {
      id: string;
      finished: boolean;
      stoppedAt?: string;
      data?: {
        resultData?: {
          runData?: Record<string, unknown>;
          error?: { message: string };
        };
      };
    };

    let status: ExecutionStatus['status'] = 'running';
    if (data.finished) {
      status = data.data?.resultData?.error ? 'error' : 'success';
    }

    return {
      executionId,
      status,
      data: data.data?.resultData?.runData,
      error: data.data?.resultData?.error?.message,
      finishedAt: data.stoppedAt,
    };
  }

  /**
   * List available workflows
   */
  async listWorkflows(): Promise<Array<{ id: string; name: string; active: boolean }>> {
    const response = await fetch(`${this.baseUrl}/api/v1/workflows`, {
      method: 'GET',
      headers: {
        ...(this.apiKey && { 'X-N8N-API-KEY': this.apiKey }),
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as {
      data: Array<{ id: string; name: string; active: boolean }>;
    };

    return data.data || [];
  }

  /**
   * Check service health
   */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
