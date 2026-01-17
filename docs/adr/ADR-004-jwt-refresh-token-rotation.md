# ADR-004: JWT Refresh Token with Rotation

## Status
Accepted

## Date
2026-01-17

## Context

The initial authentication implementation used only short-lived access tokens (15 minutes). This caused poor user experience:

1. **Frequent re-authentication**: Users had to log in repeatedly
2. **No secure logout**: Tokens couldn't be invalidated server-side
3. **Session management**: No visibility into active sessions
4. **Token theft risk**: If a token was stolen, it remained valid until expiry

### Security Requirements

- Access tokens should be short-lived (15 minutes)
- Refresh tokens should enable seamless token renewal
- Stolen tokens should be detectable and revocable
- Users should be able to see and revoke active sessions

## Decision

Implement JWT refresh tokens with rotation strategy, stored in Redis.

### Token Structure

```typescript
interface RefreshToken {
  id: string;           // Unique token ID
  userId: string;       // User identifier
  familyId: string;     // Token family for rotation tracking
  token: string;        // The actual token (hashed)
  expiresAt: Date;      // Expiration time
  createdAt: Date;      // Creation time
  userAgent?: string;   // Browser/device info
  ipAddress?: string;   // Client IP
  isRevoked: boolean;   // Revocation status
}
```

### Token Rotation Flow

```
1. User logs in
   → Issue access token (15 min) + refresh token (7 days)
   → Store refresh token in Redis with familyId

2. Access token expires
   → Client sends refresh token to /api/v1/auth/refresh
   → Server validates refresh token
   → Server issues NEW access token + NEW refresh token
   → Server revokes OLD refresh token
   → Same familyId maintained

3. Stolen token detection
   → If revoked token is reused, entire family is invalidated
   → User must re-authenticate
```

### Implementation

```typescript
// refresh-token.service.ts
class RefreshTokenService {
  async createToken(userId: string, metadata: TokenMetadata): Promise<string> {
    const familyId = generateId();
    const token = generateSecureToken();

    await this.redis.setex(
      `refresh:${hashToken(token)}`,
      SEVEN_DAYS_IN_SECONDS,
      JSON.stringify({
        userId,
        familyId,
        createdAt: new Date().toISOString(),
        ...metadata,
      })
    );

    return token;
  }

  async rotateToken(oldToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenData = await this.validateAndRevoke(oldToken);

    // Check if already revoked (potential theft)
    if (tokenData.isRevoked) {
      await this.revokeFamily(tokenData.familyId);
      throw new SecurityError('Token reuse detected');
    }

    // Issue new tokens with same family
    const newRefreshToken = await this.createTokenInFamily(
      tokenData.userId,
      tokenData.familyId
    );
    const newAccessToken = this.jwtService.sign({ userId: tokenData.userId });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
}
```

### API Endpoints

```
POST /api/v1/auth/refresh
  Body: { refreshToken: string }
  Response: { accessToken, refreshToken, expiresIn }

POST /api/v1/auth/logout
  Body: { refreshToken: string }
  Effect: Revokes the specific token

POST /api/v1/auth/logout-all
  Effect: Revokes all tokens for user (all families)

GET /api/v1/auth/sessions
  Response: List of active sessions with device info
```

### Redis Storage

```
refresh:{tokenHash} → TokenData (7 day TTL)
user:sessions:{userId} → Set of token IDs
family:{familyId} → Set of token IDs in family
```

## Consequences

### Positive

1. **Seamless UX**: Users stay logged in for up to 7 days
2. **Revocable tokens**: Logout actually invalidates tokens
3. **Theft detection**: Token reuse triggers family revocation
4. **Session visibility**: Users can see and manage active sessions
5. **Device tracking**: Sessions include device/browser info
6. **Scalable**: Redis provides fast token lookups

### Negative

1. **Redis dependency**: Token validation requires Redis
2. **Complexity**: More complex than simple JWT-only auth
3. **Storage overhead**: Each session stored in Redis
4. **Clock sync**: Token expiry requires synchronized clocks

### Security Considerations

1. **Token storage**: Refresh tokens stored in httpOnly cookies
2. **Hashing**: Tokens hashed (SHA-256) before storage
3. **Rate limiting**: Refresh endpoint rate-limited
4. **Family revocation**: Suspicious activity invalidates all family tokens

## Files Changed

- `mcp-gateway/src/services/refresh-token.service.ts` (new)
- `mcp-gateway/src/routes/auth.ts` (new endpoints)
- `mcp-gateway/src/infrastructure/redis.ts`

## References

- Issue: SEC-010
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-jwt-bcp)
- [Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
