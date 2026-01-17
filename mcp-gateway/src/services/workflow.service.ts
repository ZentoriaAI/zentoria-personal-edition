/**
 * Workflow Service
 *
 * Handles n8n workflow triggers and status tracking
 */

import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';

// Validation schemas
export const TriggerWorkflowSchema = z.object({
  workflowId: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  async: z.boolean().default(true),
  webhookPath: z.string().optional(),
});

export type TriggerWorkflowRequest = z.infer<typeof TriggerWorkflowSchema>;

export interface WorkflowResponse {
  executionId: string;
  status: 'success' | 'error';
  data?: Record<string, unknown>;
  startedAt: string;
  finishedAt: string;
}

export interface AsyncWorkflowResponse {
  executionId: string;
  status: 'queued' | 'running';
  statusUrl: string;
}

export interface WorkflowStatusResponse {
  executionId: string;
  workflowId: string;
  status: 'queued' | 'running' | 'success' | 'error' | 'cancelled';
  progress?: number;
  currentNode?: string;
  data?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export class WorkflowService {
  private readonly n8nClient: ContainerCradle['n8nClient'];
  private readonly circuitBreaker: ContainerCradle['circuitBreaker'];
  private readonly redis: ContainerCradle['redis'];
  private readonly auditRepository: ContainerCradle['auditRepository'];
  private readonly logger: ContainerCradle['logger'];

  constructor({
    n8nClient,
    circuitBreaker,
    redis,
    auditRepository,
    logger,
  }: ContainerCradle) {
    this.n8nClient = n8nClient;
    this.circuitBreaker = circuitBreaker;
    this.redis = redis;
    this.auditRepository = auditRepository;
    this.logger = logger;
  }

  /**
   * Trigger a workflow synchronously
   */
  async triggerSync(
    userId: string,
    request: TriggerWorkflowRequest
  ): Promise<WorkflowResponse> {
    const executionId = `exec_${nanoid(16)}`;

    this.logger.info(
      { executionId, workflowId: request.workflowId, userId },
      'Triggering workflow synchronously'
    );

    const startedAt = new Date();

    try {
      const result = await this.circuitBreaker.execute(
        'n8n',
        () => this.n8nClient.triggerWorkflow({
          workflowId: request.workflowId,
          payload: request.payload,
          webhookPath: request.webhookPath,
          waitForCompletion: true,
        }),
        { timeout: 300000 } // 5 minutes max for sync workflows
      );

      const finishedAt = new Date();

      // Log audit
      await this.auditRepository.log({
        action: 'workflow_triggered',
        userId,
        metadata: {
          executionId,
          workflowId: request.workflowId,
          status: 'success',
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
      });

      return {
        executionId: result.executionId || executionId,
        status: 'success',
        data: result.data,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      };
    } catch (err) {
      this.logger.error({ err, executionId }, 'Workflow execution failed');

      // Check circuit state
      const state = this.circuitBreaker.getState('n8n');
      if (state === 'open') {
        throw Errors.serviceUnavailable('Workflow service (n8n)');
      }

      throw err;
    }
  }

  /**
   * Trigger a workflow asynchronously
   */
  async triggerAsync(
    userId: string,
    request: TriggerWorkflowRequest
  ): Promise<AsyncWorkflowResponse> {
    const executionId = `exec_${nanoid(16)}`;

    this.logger.info(
      { executionId, workflowId: request.workflowId, userId },
      'Triggering workflow asynchronously'
    );

    // Store execution in Redis for tracking
    const executionData = {
      id: executionId,
      workflowId: request.workflowId,
      userId,
      status: 'queued',
      payload: request.payload,
      createdAt: new Date().toISOString(),
    };

    await this.redis.setex(
      `workflow:${executionId}`,
      86400, // 24 hour TTL
      JSON.stringify(executionData)
    );

    // Trigger n8n without waiting
    try {
      const result = await this.circuitBreaker.execute(
        'n8n',
        () => this.n8nClient.triggerWorkflow({
          workflowId: request.workflowId,
          payload: {
            ...request.payload,
            _zentoriaExecutionId: executionId,
          },
          webhookPath: request.webhookPath,
          waitForCompletion: false,
        }),
        { timeout: 30000 }
      );

      // Update with n8n execution ID
      executionData.status = 'running';
      await this.redis.setex(
        `workflow:${executionId}`,
        86400,
        JSON.stringify({
          ...executionData,
          n8nExecutionId: result.executionId,
          status: 'running',
        })
      );

      // Log audit
      await this.auditRepository.log({
        action: 'workflow_triggered',
        userId,
        metadata: {
          executionId,
          workflowId: request.workflowId,
          async: true,
        },
      });

      const baseUrl = process.env.BASE_URL || 'http://localhost:4000';

      return {
        executionId,
        status: 'running',
        statusUrl: `${baseUrl}/api/v1/mcp/workflow/${executionId}`,
      };
    } catch (err) {
      // Update status to error
      await this.redis.setex(
        `workflow:${executionId}`,
        3600,
        JSON.stringify({
          ...executionData,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      );

      throw err;
    }
  }

  /**
   * Get workflow execution status
   */
  async getStatus(executionId: string): Promise<WorkflowStatusResponse> {
    const data = await this.redis.get(`workflow:${executionId}`);

    if (!data) {
      throw Errors.notFound('Workflow execution', executionId);
    }

    const execution = JSON.parse(data);

    // If running, try to get updated status from n8n
    if (execution.status === 'running' && execution.n8nExecutionId) {
      try {
        const n8nStatus = await this.n8nClient.getExecutionStatus(
          execution.n8nExecutionId
        );

        // Update cached status
        const updatedExecution = {
          ...execution,
          status: n8nStatus.status,
          progress: n8nStatus.progress,
          currentNode: n8nStatus.currentNode,
          data: n8nStatus.data,
          error: n8nStatus.error,
          finishedAt: n8nStatus.finishedAt,
        };

        await this.redis.setex(
          `workflow:${executionId}`,
          86400,
          JSON.stringify(updatedExecution)
        );

        return {
          executionId,
          workflowId: execution.workflowId,
          status: n8nStatus.status,
          progress: n8nStatus.progress,
          currentNode: n8nStatus.currentNode,
          data: n8nStatus.data,
          error: n8nStatus.error,
          startedAt: execution.createdAt,
          finishedAt: n8nStatus.finishedAt,
        };
      } catch (err) {
        this.logger.warn({ err, executionId }, 'Failed to get n8n status');
        // Fall through to return cached data
      }
    }

    return {
      executionId,
      workflowId: execution.workflowId,
      status: execution.status,
      progress: execution.progress,
      currentNode: execution.currentNode,
      data: execution.data,
      error: execution.error,
      startedAt: execution.createdAt,
      finishedAt: execution.finishedAt,
    };
  }

  /**
   * Callback handler for n8n workflow completion
   * (Called by n8n webhook at the end of workflows)
   */
  async handleCallback(
    executionId: string,
    status: 'success' | 'error',
    data?: Record<string, unknown>,
    error?: string
  ): Promise<void> {
    const cached = await this.redis.get(`workflow:${executionId}`);

    if (!cached) {
      this.logger.warn({ executionId }, 'Callback for unknown execution');
      return;
    }

    const execution = JSON.parse(cached);

    const updatedExecution = {
      ...execution,
      status,
      data,
      error,
      finishedAt: new Date().toISOString(),
    };

    await this.redis.setex(
      `workflow:${executionId}`,
      86400,
      JSON.stringify(updatedExecution)
    );

    // Log audit
    await this.auditRepository.log({
      action: 'workflow_completed',
      userId: execution.userId,
      metadata: {
        executionId,
        workflowId: execution.workflowId,
        status,
      },
    });

    this.logger.info({ executionId, status }, 'Workflow callback processed');
  }
}
