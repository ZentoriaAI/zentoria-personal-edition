# API Versioning Strategy

This document describes the API versioning approach for the Zentoria Personal Edition MCP Gateway.

## Table of Contents

- [Overview](#overview)
- [Version Format](#version-format)
- [URL Structure](#url-structure)
- [Version Lifecycle](#version-lifecycle)
- [Breaking vs Non-Breaking Changes](#breaking-vs-non-breaking-changes)
- [Migration Guidelines](#migration-guidelines)
- [Deprecation Policy](#deprecation-policy)
- [Client Implementation](#client-implementation)

---

## Overview

The Zentoria MCP Gateway uses **URL path versioning** with a semantic version prefix. This approach provides:

- **Clear visibility**: Version is explicit in every request
- **Easy routing**: NGINX and reverse proxies can route by path
- **Simple caching**: Different versions have different URLs
- **Independent deployments**: Multiple versions can run concurrently

### Current Versions

| Version | Status | Supported Until |
|---------|--------|-----------------|
| `v1` | **Active** | - |
| `v2` | Planned | - |

---

## Version Format

### URL Pattern

```
/api/{version}/{resource}/{action}
```

**Examples:**

```
GET  /api/v1/health
POST /api/v1/mcp/command
GET  /api/v1/mcp/files
POST /api/v1/mcp/upload
POST /api/v1/mcp/create-key
POST /api/v1/auth/refresh
```

### Version Identifier

- Format: `v{major}` (e.g., `v1`, `v2`)
- Major version only in URL
- Minor/patch versions indicated via headers or response metadata

### Response Version Header

All responses include version metadata:

```http
X-API-Version: 1.3.0
X-API-Deprecated: false
```

---

## URL Structure

### Route Registration

```typescript
// server.ts
async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Health routes (no auth required)
  await server.register(healthRoutes, { prefix: '/api/v1' });

  // Auth routes
  await server.register(authRoutes, { prefix: '/api/v1/auth' });

  // API routes (auth required)
  await server.register(mcpRoutes, { prefix: '/api/v1/mcp' });
  await server.register(fileRoutes, { prefix: '/api/v1/mcp' });
  await server.register(keyRoutes, { prefix: '/api/v1/mcp' });
  await server.register(workflowRoutes, { prefix: '/api/v1/mcp' });

  // WebSocket routes (unversioned)
  await server.register(websocketRoutes, { prefix: '/ws' });
}
```

### Endpoint Organization

| Prefix | Purpose | Auth Required |
|--------|---------|---------------|
| `/api/v1/health` | Health checks | No |
| `/api/v1/auth` | Authentication | Partial |
| `/api/v1/mcp/command` | AI commands | Yes |
| `/api/v1/mcp/files` | File operations | Yes |
| `/api/v1/mcp/create-key` | API key management | Yes |
| `/api/v1/mcp/workflow` | Workflow triggers | Yes |
| `/ws` | WebSocket connections | Yes |

---

## Version Lifecycle

### Stages

```
┌─────────┐    ┌─────────┐    ┌────────────┐    ┌──────────┐
│ Preview │ → │ Current │ → │ Deprecated │ → │ Retired  │
└─────────┘    └─────────┘    └────────────┘    └──────────┘
```

| Stage | Description | Support Level |
|-------|-------------|---------------|
| **Preview** | Beta testing, may change | Community support |
| **Current** | Stable, recommended | Full support |
| **Deprecated** | Still works, migration encouraged | Security fixes only |
| **Retired** | No longer available | None |

### Timeline

- **Current → Deprecated**: 6 months notice minimum
- **Deprecated → Retired**: 12 months minimum
- **Total lifecycle**: 18+ months from deprecation announcement

### Version Matrix

| Version | Released | Deprecated | Retired | Status |
|---------|----------|------------|---------|--------|
| v1 | 2026-01-01 | - | - | Current |
| v2 | TBD | - | - | Planned |

---

## Breaking vs Non-Breaking Changes

### Non-Breaking Changes (Patch/Minor)

These changes can be released without a new major version:

- ✅ Adding new endpoints
- ✅ Adding optional request fields
- ✅ Adding response fields
- ✅ Adding new error codes
- ✅ Adding new enum values (if client handles unknown values)
- ✅ Increasing rate limits
- ✅ Performance improvements
- ✅ Bug fixes (that don't change contracts)

### Breaking Changes (Major)

These changes require a new major version:

- ❌ Removing endpoints
- ❌ Removing required request fields
- ❌ Removing response fields
- ❌ Changing field types
- ❌ Changing endpoint paths
- ❌ Changing authentication methods
- ❌ Changing error response format
- ❌ Reducing rate limits significantly
- ❌ Changing default values with side effects

### Example: Non-Breaking Addition

```typescript
// v1.0.0 Response
{
  "id": "file_123",
  "name": "document.pdf",
  "size": 1024
}

// v1.1.0 Response (added field - non-breaking)
{
  "id": "file_123",
  "name": "document.pdf",
  "size": 1024,
  "mimeType": "application/pdf"  // NEW - clients should ignore unknown fields
}
```

### Example: Breaking Change

```typescript
// v1 Response
{
  "files": [...]
}

// v2 Response (changed structure - breaking)
{
  "data": {
    "files": [...],
    "pagination": {...}
  }
}
```

---

## Migration Guidelines

### For API Consumers

1. **Check version headers** in responses
2. **Handle unknown fields** gracefully (ignore them)
3. **Subscribe to deprecation notices**
4. **Test against new versions** before production migration
5. **Update client libraries** to latest versions

### Migration Example

```typescript
// Before (v1)
const response = await fetch('/api/v1/mcp/files', {
  headers: { 'X-API-Key': apiKey }
});
const { files } = await response.json();

// After (v2)
const response = await fetch('/api/v2/mcp/files', {
  headers: { 'X-API-Key': apiKey }
});
const { data: { files, pagination } } = await response.json();
```

### Version Detection

```typescript
// Check API version from response
const response = await fetch('/api/v1/health');
const apiVersion = response.headers.get('X-API-Version');
const isDeprecated = response.headers.get('X-API-Deprecated') === 'true';

if (isDeprecated) {
  console.warn(`API ${apiVersion} is deprecated. Please migrate.`);
}
```

---

## Deprecation Policy

### Announcement

Deprecation is announced through:

1. **Response headers**: `X-API-Deprecated: true`
2. **Sunset header**: `Sunset: Sat, 01 Jul 2027 00:00:00 GMT`
3. **Documentation**: Changelog and migration guide
4. **Release notes**: Included in release announcements

### Response Headers for Deprecated Endpoints

```http
HTTP/1.1 200 OK
X-API-Version: 1.3.0
X-API-Deprecated: true
Sunset: Sat, 01 Jul 2027 00:00:00 GMT
Link: </api/v2/mcp/files>; rel="successor-version"
Warning: 299 - "API v1 deprecated. Migrate to v2 by 2027-07-01."
```

### Deprecation Response Example

```json
{
  "data": { ... },
  "meta": {
    "deprecation": {
      "deprecated": true,
      "sunset": "2027-07-01T00:00:00Z",
      "successor": "/api/v2/mcp/files",
      "message": "This endpoint is deprecated. Please migrate to v2."
    }
  }
}
```

---

## Client Implementation

### Recommended Client Pattern

```typescript
class ZentoriaClient {
  private baseUrl: string;
  private apiVersion: string;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.apiVersion = options.apiVersion || 'v1';
  }

  private async request<T>(
    method: string,
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}/api/${this.apiVersion}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    // Check for deprecation
    const deprecated = response.headers.get('X-API-Deprecated');
    const sunset = response.headers.get('Sunset');

    if (deprecated === 'true') {
      console.warn(
        `API ${this.apiVersion} is deprecated. ` +
        `Sunset date: ${sunset}. Please upgrade.`
      );
    }

    return response.json();
  }

  // Versioned endpoints
  async getFiles(): Promise<File[]> {
    return this.request('GET', '/mcp/files');
  }

  async processCommand(command: string): Promise<CommandResponse> {
    return this.request('POST', '/mcp/command', {
      body: { command },
    });
  }
}
```

### Version Negotiation

For clients that need to support multiple versions:

```typescript
class VersionedClient {
  private supportedVersions = ['v2', 'v1'];

  async detectVersion(): Promise<string> {
    for (const version of this.supportedVersions) {
      try {
        const response = await fetch(`${this.baseUrl}/api/${version}/health`);
        if (response.ok) {
          return version;
        }
      } catch {
        continue;
      }
    }
    throw new Error('No supported API version found');
  }
}
```

---

## OpenAPI Documentation

### Version in OpenAPI Spec

```yaml
openapi: 3.1.0
info:
  title: Zentoria MCP Gateway
  version: 1.3.0
  description: API Gateway for Zentoria Personal Edition
servers:
  - url: http://localhost:4000/api/v1
    description: Development server (v1)
  - url: http://localhost:4000/api/v2
    description: Development server (v2)
```

### Accessing Documentation

| Endpoint | Purpose |
|----------|---------|
| `/docs` | Swagger UI |
| `/docs/json` | OpenAPI JSON spec |
| `/docs/yaml` | OpenAPI YAML spec |

---

## Future Considerations

### Planned for v2

- GraphQL endpoint alongside REST
- Pagination envelope for list endpoints
- Batch operations
- Streaming responses for large data

### Header-Based Versioning (Alternative)

Not currently used, but available for minor version selection:

```http
Accept: application/vnd.zentoria.v1.3+json
```

---

## References

- [Semantic Versioning](https://semver.org/)
- [RFC 8594 - Sunset HTTP Header](https://www.rfc-editor.org/rfc/rfc8594)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
- Internal: `infrastructure/docs/API_REFERENCE.md`
