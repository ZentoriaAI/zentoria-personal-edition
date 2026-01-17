# ADR-002: OpenTelemetry for Distributed Tracing

## Status
Accepted

## Date
2026-01-17

## Context

The Zentoria system comprises multiple services that process AI requests through a complex chain:

```
Frontend → NGINX → MCP Gateway → AI Orchestrator → Ollama
                        ↓
              Redis / PostgreSQL / Qdrant
```

Without distributed tracing:
- **Debugging is difficult**: When an AI request fails, identifying which service caused the failure requires checking multiple log files
- **Performance blind spots**: No visibility into where time is spent across service boundaries
- **No correlation**: Logs from different services for the same request cannot be linked
- **SLA monitoring impossible**: Cannot measure end-to-end latency for AI operations

## Decision

Implement OpenTelemetry SDK with auto-instrumentation in the MCP Gateway service.

### Components Added

1. **OpenTelemetry SDK** (`@opentelemetry/sdk-node`)
2. **Auto-instrumentation** for:
   - HTTP requests (`@opentelemetry/instrumentation-http`)
   - Fastify routes (`@opentelemetry/instrumentation-fastify`)
   - Redis/ioredis (`@opentelemetry/instrumentation-ioredis`)
   - PostgreSQL (`@opentelemetry/instrumentation-pg`)
3. **OTLP Exporters** for traces and metrics
4. **Log-trace correlation** via Pino mixin

### Implementation

```typescript
// telemetry.ts - Initialize BEFORE other imports
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || 'mcp-gateway',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/metrics',
    }),
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

### Log-Trace Correlation

```typescript
// logger.ts - Add trace context to all logs
import { trace } from '@opentelemetry/api';

const logger = pino({
  mixin() {
    const span = trace.getActiveSpan();
    if (span) {
      const ctx = span.spanContext();
      return {
        traceId: ctx.traceId,
        spanId: ctx.spanId,
      };
    }
    return {};
  },
});
```

### Business Operation Tracers

```typescript
// Custom spans for business operations
export async function traceAiCommand<T>(
  command: string,
  fn: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(`ai.command.${command}`, async (span) => {
    span.setAttribute('ai.command', command);
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Configuration

```env
OTEL_ENABLED=true
OTEL_SERVICE_NAME=mcp-gateway
OTEL_SERVICE_VERSION=1.0.0
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_METRICS_EXPORT_INTERVAL_MS=60000
```

## Consequences

### Positive

1. **End-to-end visibility**: Trace requests across all services
2. **Performance insights**: Identify bottlenecks in AI processing
3. **Log correlation**: Link logs to traces via traceId
4. **Auto-instrumentation**: Minimal code changes for framework tracing
5. **Vendor-neutral**: OTLP works with Jaeger, Zipkin, Datadog, etc.
6. **Graceful degradation**: Disabled if OTEL_ENABLED=false

### Negative

1. **Performance overhead**: ~2-5% latency increase (acceptable)
2. **Infrastructure requirement**: Needs OTLP collector (Jaeger/Tempo)
3. **Data volume**: Traces generate significant data at scale
4. **Dependency increase**: 11 new npm packages

### Sampling Strategy

For production, implement sampling to reduce overhead:
```typescript
// Sample 10% of requests, 100% of errors
sampler: new ParentBasedSampler({
  root: new TraceIdRatioBasedSampler(0.1),
}),
```

## Files Changed

- `mcp-gateway/src/infrastructure/telemetry.ts` (new, 327 lines)
- `mcp-gateway/src/infrastructure/logger.ts` (trace context mixin)
- `mcp-gateway/src/infrastructure/shutdown.ts` (graceful shutdown)
- `mcp-gateway/src/index.ts` (early initialization)
- `mcp-gateway/package.json` (11 new dependencies)
- `mcp-gateway/.env.example` (OTEL configuration)

## References

- Issue: ARCH-003
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/instrumentation/js/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
