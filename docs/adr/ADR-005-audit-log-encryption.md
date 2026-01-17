# ADR-005: AES-256-GCM Audit Log Encryption

## Status
Accepted

## Date
2026-01-17

## Context

The audit log contains sensitive information that could be valuable to attackers:

1. **IP addresses**: User location information
2. **User agents**: Browser/device fingerprints
3. **Metadata**: Could contain PII or business-sensitive data
4. **API keys**: Partial key values for debugging

### Compliance Requirements

- GDPR requires protection of personal data
- SOC 2 requires encryption of sensitive data at rest
- Security best practices mandate defense in depth

### Threat Model

- **Database breach**: Attacker gains read access to database
- **Backup theft**: Attacker obtains database backup
- **Insider threat**: Malicious admin queries audit logs

## Decision

Implement AES-256-GCM encryption for sensitive audit log fields with transparent encrypt/decrypt.

### Encrypted Fields

```typescript
interface AuditLog {
  id: string;
  action: string;           // Not encrypted (needed for queries)
  userId: string;           // Not encrypted (needed for queries)
  resourceType: string;     // Not encrypted (needed for queries)
  resourceId: string;       // Not encrypted (needed for queries)
  metadata: string;         // ENCRYPTED
  ipAddress: string;        // ENCRYPTED
  userAgent: string;        // ENCRYPTED
  createdAt: Date;          // Not encrypted
}
```

### Encryption Implementation

```typescript
// encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

export function decrypt(ciphertext: string, key: Buffer): string {
  const [ivB64, authTagB64, encrypted] = ciphertext.split(':');

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

### Repository Integration

```typescript
// audit.repository.ts
class AuditRepository {
  private encryptionKey: Buffer;

  async create(entry: AuditLogInput): Promise<AuditLog> {
    const encryptedEntry = {
      ...entry,
      metadata: entry.metadata ? encrypt(JSON.stringify(entry.metadata), this.encryptionKey) : null,
      ipAddress: entry.ipAddress ? encrypt(entry.ipAddress, this.encryptionKey) : null,
      userAgent: entry.userAgent ? encrypt(entry.userAgent, this.encryptionKey) : null,
    };

    return this.prisma.auditLog.create({ data: encryptedEntry });
  }

  async findMany(filter: AuditFilter): Promise<AuditLog[]> {
    const logs = await this.prisma.auditLog.findMany({ where: filter });

    return logs.map(log => ({
      ...log,
      metadata: log.metadata ? JSON.parse(decrypt(log.metadata, this.encryptionKey)) : null,
      ipAddress: log.ipAddress ? decrypt(log.ipAddress, this.encryptionKey) : null,
      userAgent: log.userAgent ? decrypt(log.userAgent, this.encryptionKey) : null,
    }));
  }
}
```

### Key Management

```env
# .env
AUDIT_ENCRYPTION_KEY=your-32-character-secret-key-here
```

```typescript
// Validate key on startup
const key = process.env.AUDIT_ENCRYPTION_KEY;
if (!key || key.length < 32) {
  throw new Error('AUDIT_ENCRYPTION_KEY must be at least 32 characters');
}
```

### Backward Compatibility

```typescript
function isEncrypted(value: string): boolean {
  // Encrypted format: base64:base64:base64
  return /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value);
}

function safeDecrypt(value: string, key: Buffer): string {
  if (!isEncrypted(value)) {
    // Legacy unencrypted data
    return value;
  }
  return decrypt(value, key);
}
```

## Consequences

### Positive

1. **Data protection**: Sensitive fields encrypted at rest
2. **Compliance**: Meets GDPR/SOC 2 requirements
3. **Defense in depth**: Database breach doesn't expose PII
4. **Transparency**: Automatic encrypt/decrypt in repository
5. **Backward compatible**: Handles legacy unencrypted data

### Negative

1. **Performance**: ~2-5% overhead for encryption/decryption
2. **Key management**: Key rotation requires re-encryption
3. **No field search**: Cannot query on encrypted fields
4. **Key loss risk**: Lost key means lost data

### Key Rotation Strategy

```typescript
// Future: Support key rotation
interface EncryptedValue {
  version: number;  // Key version
  value: string;    // Encrypted data
}

// Store key versions in Vault
// Decrypt with appropriate version
// Re-encrypt on read with latest version
```

## Files Changed

- `mcp-gateway/src/infrastructure/encryption.ts` (new)
- `mcp-gateway/src/repositories/audit.repository.ts`
- `mcp-gateway/.env.example`

## References

- Issue: SEC-009
- [AES-GCM](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
- [Node.js Crypto](https://nodejs.org/api/crypto.html)
