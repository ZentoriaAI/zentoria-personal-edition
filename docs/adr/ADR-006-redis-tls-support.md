# ADR-006: Redis TLS/SSL Support

## Status
Accepted

## Date
2026-01-17

## Context

Redis connections in both the MCP Gateway (Node.js) and AI Orchestrator (Python) were configured for plaintext communication:

```typescript
// Before - plaintext
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
});
```

### Security Concerns

1. **Network sniffing**: Redis traffic (including auth passwords) visible on network
2. **Man-in-the-middle**: Attacker could intercept and modify data
3. **Compliance**: Many security standards require encryption in transit
4. **Cloud environments**: Cloud Redis (AWS ElastiCache, Azure Cache) often require TLS

### Production Requirements

- Support TLS for managed Redis services
- Support mutual TLS (mTLS) for high-security environments
- Backward compatible with plaintext for development
- Configurable certificate verification

## Decision

Add TLS support to both Node.js and Python Redis clients with comprehensive configuration options.

### Node.js (ioredis) Implementation

```typescript
// redis.ts
function buildTlsOptions(): tls.ConnectionOptions | undefined {
  if (!process.env.REDIS_TLS || process.env.REDIS_TLS === 'false') {
    return undefined;
  }

  const options: tls.ConnectionOptions = {
    rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false',
  };

  // Custom CA certificate
  if (process.env.REDIS_TLS_CA_CERT) {
    options.ca = fs.readFileSync(process.env.REDIS_TLS_CA_CERT);
  }

  // Client certificate for mutual TLS
  if (process.env.REDIS_TLS_CERT && process.env.REDIS_TLS_KEY) {
    options.cert = fs.readFileSync(process.env.REDIS_TLS_CERT);
    options.key = fs.readFileSync(process.env.REDIS_TLS_KEY);
  }

  return options;
}

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  tls: buildTlsOptions(),
});
```

### Python (redis-py) Implementation

```python
# context.py
def _build_ssl_context(self) -> ssl.SSLContext | None:
    tls_enabled = (
        self.settings.redis_tls or
        self.settings.redis_url.startswith("rediss://")
    )

    if not tls_enabled:
        return None

    ssl_context = ssl.create_default_context()

    # Certificate verification
    if not self.settings.redis_tls_verify:
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
    else:
        ssl_context.verify_mode = ssl.CERT_REQUIRED
        ssl_context.check_hostname = True

    # Custom CA certificate
    if self.settings.redis_tls_ca_cert:
        ssl_context.load_verify_locations(self.settings.redis_tls_ca_cert)

    # Client certificate for mutual TLS
    if self.settings.redis_tls_cert and self.settings.redis_tls_key:
        ssl_context.load_cert_chain(
            self.settings.redis_tls_cert,
            self.settings.redis_tls_key
        )

    return ssl_context

self._redis = redis.Redis.from_url(
    self.settings.redis_url,
    ssl=ssl_context,
)
```

### Configuration Options

```env
# Basic TLS
REDIS_TLS=true

# Custom CA (for self-signed certs)
REDIS_TLS_CA_CERT=/path/to/ca.crt

# Disable verification (development only!)
REDIS_TLS_REJECT_UNAUTHORIZED=false  # Node.js
REDIS_TLS_VERIFY=false               # Python

# Mutual TLS (client certificate)
REDIS_TLS_CERT=/path/to/client.crt
REDIS_TLS_KEY=/path/to/client.key
```

### URL-based TLS Detection

```typescript
// Automatically enable TLS for rediss:// URLs
const url = process.env.REDIS_URL;
if (url?.startsWith('rediss://')) {
  // TLS enabled automatically
}
```

## Consequences

### Positive

1. **Encrypted transit**: All Redis traffic encrypted
2. **Cloud compatibility**: Works with AWS ElastiCache, Azure Cache
3. **Mutual TLS support**: High-security environments supported
4. **Backward compatible**: Default is plaintext (development)
5. **Flexible configuration**: Multiple ways to configure TLS

### Negative

1. **Performance overhead**: ~5-10% latency increase for TLS handshake
2. **Certificate management**: Need to manage and rotate certificates
3. **Debugging complexity**: Encrypted traffic harder to inspect
4. **Connection pooling**: TLS connections more resource-intensive

### Cloud Provider Configurations

**AWS ElastiCache:**
```env
REDIS_URL=rediss://my-cluster.xxxxx.cache.amazonaws.com:6379
REDIS_TLS=true
# AWS uses Amazon root CA, no custom cert needed
```

**Azure Cache for Redis:**
```env
REDIS_URL=rediss://my-cache.redis.cache.windows.net:6380
REDIS_TLS=true
REDIS_PASSWORD=your-access-key
```

**Self-hosted with custom CA:**
```env
REDIS_TLS=true
REDIS_TLS_CA_CERT=/etc/redis/ca.crt
REDIS_TLS_CERT=/etc/redis/client.crt
REDIS_TLS_KEY=/etc/redis/client.key
```

## Files Changed

**Node.js:**
- `mcp-gateway/src/infrastructure/redis.ts`
- `mcp-gateway/.env.example`

**Python:**
- `ai-orchestrator/src/core/context.py`
- `ai-orchestrator/src/config.py`
- `ai-orchestrator/.env.example`

## References

- Issue: SEC-008
- [ioredis TLS](https://github.com/redis/ioredis#tls-options)
- [redis-py SSL](https://redis-py.readthedocs.io/en/stable/examples/ssl_connection_examples.html)
- [AWS ElastiCache TLS](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/in-transit-encryption.html)
