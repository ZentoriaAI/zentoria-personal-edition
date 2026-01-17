/**
 * Circuit Breaker Implementation using Cockatiel
 *
 * Provides resilience patterns for external service calls:
 * - Circuit breaker (prevents cascade failures)
 * - Retry with exponential backoff
 * - Timeout handling
 * - Bulkhead isolation
 */

import {
  CircuitBreakerPolicy,
  circuitBreaker,
  ConsecutiveBreaker,
  ExponentialBackoff,
  handleAll,
  IPolicy,
  retry,
  timeout,
  TimeoutStrategy,
  wrap,
  Policy,
  BulkheadPolicy,
  bulkhead,
} from 'cockatiel';
import { logger } from './logger.js';
import { BULKHEAD, RETRY, TIMEOUTS } from '../config/constants.js'; // PERF-009

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit */
  threshold: number;
  /** Time in ms the circuit stays open */
  halfOpenAfter: number;
}

export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Initial delay in ms */
  initialDelay: number;
  /** Maximum delay in ms */
  maxDelay: number;
}

export interface BulkheadConfig {
  /** Maximum concurrent executions */
  maxConcurrent: number;
  /** Maximum queue size */
  maxQueue: number;
}

interface ServicePolicy {
  circuit: CircuitBreakerPolicy;
  withRetry: IPolicy;
  bulkhead: BulkheadPolicy;
}

/**
 * Circuit Breaker Factory
 *
 * Creates pre-configured circuit breakers for each external service
 */
export function createCircuitBreaker(): CircuitBreakerManager {
  return new CircuitBreakerManager();
}

export class CircuitBreakerManager {
  private policies: Map<string, ServicePolicy> = new Map();

  // PERF-009: Use centralized configurable constants
  private readonly defaultCircuitConfig: CircuitBreakerConfig = {
    threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10),
    halfOpenAfter: TIMEOUTS.CIRCUIT_BREAKER_RESET,
  };

  private readonly defaultRetryConfig: RetryConfig = {
    maxAttempts: RETRY.MAX_RETRIES,
    initialDelay: RETRY.INITIAL_DELAY_MS,
    maxDelay: RETRY.MAX_DELAY_MS,
  };

  private readonly timeoutMs = TIMEOUTS.CIRCUIT_BREAKER;

  /**
   * Get or create a policy for a service
   */
  getPolicy(serviceName: string): ServicePolicy {
    let policy = this.policies.get(serviceName);
    if (!policy) {
      policy = this.createPolicy(serviceName);
      this.policies.set(serviceName, policy);
    }
    return policy;
  }

  /**
   * Execute a function with circuit breaker, retry, and timeout
   */
  async execute<T>(
    serviceName: string,
    fn: () => Promise<T>,
    options?: { timeout?: number; useRetry?: boolean }
  ): Promise<T> {
    const policy = this.getPolicy(serviceName);
    const timeoutPolicy = timeout(options?.timeout || this.timeoutMs, TimeoutStrategy.Aggressive);

    let wrapped: IPolicy;
    if (options?.useRetry !== false) {
      wrapped = wrap(timeoutPolicy, policy.withRetry);
    } else {
      wrapped = wrap(timeoutPolicy, policy.circuit);
    }

    return wrapped.execute(fn);
  }

  /**
   * Execute with bulkhead isolation (for high-concurrency scenarios)
   */
  async executeWithBulkhead<T>(
    serviceName: string,
    fn: () => Promise<T>,
    options?: { timeout?: number }
  ): Promise<T> {
    const policy = this.getPolicy(serviceName);
    const timeoutPolicy = timeout(options?.timeout || this.timeoutMs, TimeoutStrategy.Aggressive);
    const wrapped = wrap(policy.bulkhead, timeoutPolicy, policy.circuit);

    return wrapped.execute(fn);
  }

  /**
   * Get circuit state for a service
   */
  getState(serviceName: string): 'closed' | 'open' | 'half-open' | 'unknown' {
    const policy = this.policies.get(serviceName);
    if (!policy) return 'unknown';

    return policy.circuit.state;
  }

  /**
   * Get all circuit states (for health check)
   */
  getAllStates(): Record<string, 'closed' | 'open' | 'half-open' | 'unknown'> {
    const states: Record<string, 'closed' | 'open' | 'half-open' | 'unknown'> = {};
    for (const [name] of this.policies) {
      states[name] = this.getState(name);
    }
    return states;
  }

  /**
   * PERF-009: Get bulkhead config for a specific service
   */
  private getBulkheadConfig(serviceName: string): BulkheadConfig {
    // Normalize service name to uppercase for matching
    const normalizedName = serviceName.toUpperCase().replace(/-/g, '_');

    // Check for service-specific config
    if (normalizedName.includes('AI') || normalizedName.includes('ORCHESTRATOR')) {
      return {
        maxConcurrent: BULKHEAD.SERVICES.AI_ORCHESTRATOR.MAX_CONCURRENT,
        maxQueue: BULKHEAD.SERVICES.AI_ORCHESTRATOR.MAX_QUEUE,
      };
    }

    if (normalizedName.includes('AUTH')) {
      return {
        maxConcurrent: BULKHEAD.SERVICES.AUTH.MAX_CONCURRENT,
        maxQueue: BULKHEAD.SERVICES.AUTH.MAX_QUEUE,
      };
    }

    if (normalizedName.includes('N8N') || normalizedName.includes('WORKFLOW')) {
      return {
        maxConcurrent: BULKHEAD.SERVICES.N8N.MAX_CONCURRENT,
        maxQueue: BULKHEAD.SERVICES.N8N.MAX_QUEUE,
      };
    }

    // Default config
    return {
      maxConcurrent: BULKHEAD.DEFAULT_MAX_CONCURRENT,
      maxQueue: BULKHEAD.DEFAULT_MAX_QUEUE,
    };
  }

  private createPolicy(serviceName: string): ServicePolicy {
    // Circuit breaker
    const circuit = circuitBreaker(handleAll, {
      breaker: new ConsecutiveBreaker(this.defaultCircuitConfig.threshold),
      halfOpenAfter: this.defaultCircuitConfig.halfOpenAfter,
    });

    // Circuit breaker events
    circuit.onBreak(() => {
      logger.warn({ serviceName }, 'Circuit breaker opened');
    });

    circuit.onReset(() => {
      logger.info({ serviceName }, 'Circuit breaker reset');
    });

    circuit.onHalfOpen(() => {
      logger.info({ serviceName }, 'Circuit breaker half-open');
    });

    // Retry policy with exponential backoff
    const retryPolicy = retry(handleAll, {
      maxAttempts: this.defaultRetryConfig.maxAttempts,
      backoff: new ExponentialBackoff({
        initialDelay: this.defaultRetryConfig.initialDelay,
        maxDelay: this.defaultRetryConfig.maxDelay,
      }),
    });

    retryPolicy.onRetry((event) => {
      logger.warn(
        {
          serviceName,
          attempt: event.attempt,
          delay: event.delay,
          error: event.reason,
        },
        'Retrying request'
      );
    });

    // Combine retry with circuit breaker
    const withRetry = wrap(retryPolicy, circuit);

    // PERF-009: Bulkhead with per-service configurable limits
    const bulkheadConfig = this.getBulkheadConfig(serviceName);
    const bulkheadPolicy = bulkhead(
      bulkheadConfig.maxConcurrent,
      bulkheadConfig.maxQueue
    );

    bulkheadPolicy.onReject(() => {
      logger.warn(
        { serviceName, maxConcurrent: bulkheadConfig.maxConcurrent, maxQueue: bulkheadConfig.maxQueue },
        'Bulkhead rejected request'
      );
    });

    logger.debug(
      { serviceName, maxConcurrent: bulkheadConfig.maxConcurrent, maxQueue: bulkheadConfig.maxQueue },
      'Created circuit breaker policy with bulkhead'
    );

    return {
      circuit,
      withRetry,
      bulkhead: bulkheadPolicy,
    };
  }
}
