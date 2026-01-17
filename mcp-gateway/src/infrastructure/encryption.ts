/**
 * Encryption Utilities
 *
 * SEC-009: AES-256-GCM encryption for sensitive data at rest
 *
 * Features:
 * - Authenticated encryption (AES-256-GCM)
 * - Unique IV per encryption
 * - Base64 encoding for storage
 * - Type-safe encrypt/decrypt for JSON and strings
 */

import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { logger } from './logger.js';
import { Errors } from '../middleware/error-handler.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;

/**
 * Encrypted data format: base64(salt:iv:authTag:ciphertext)
 */
interface EncryptedPayload {
  salt: Buffer;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

/**
 * Derive a 256-bit key from password using scrypt
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32);
}

/**
 * Parse encrypted payload from base64 string
 */
function parsePayload(encrypted: string): EncryptedPayload {
  const data = Buffer.from(encrypted, 'base64');

  if (data.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw Errors.decryptionError('Invalid encrypted payload: too short');
  }

  let offset = 0;
  const salt = data.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;

  const iv = data.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  const authTag = data.subarray(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;

  const ciphertext = data.subarray(offset);

  return { salt, iv, authTag, ciphertext };
}

/**
 * Serialize encrypted payload to base64 string
 */
function serializePayload(payload: EncryptedPayload): string {
  const combined = Buffer.concat([
    payload.salt,
    payload.iv,
    payload.authTag,
    payload.ciphertext,
  ]);
  return combined.toString('base64');
}

/**
 * Encryption service for sensitive data
 */
export class EncryptionService {
  private readonly encryptionKey: string;
  private readonly enabled: boolean;

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey || process.env.AUDIT_ENCRYPTION_KEY || '';
    this.enabled = this.encryptionKey.length >= 32;

    if (!this.enabled) {
      logger.warn(
        'SEC-009: Audit log encryption disabled - AUDIT_ENCRYPTION_KEY not set or too short (min 32 chars)'
      );
    } else {
      logger.info('SEC-009: Audit log encryption enabled');
    }
  }

  /**
   * Check if encryption is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Encrypt a string value
   */
  encryptString(plaintext: string): string {
    if (!this.enabled || !plaintext) {
      return plaintext;
    }

    try {
      const salt = randomBytes(SALT_LENGTH);
      const key = deriveKey(this.encryptionKey, salt);
      const iv = randomBytes(IV_LENGTH);

      const cipher = createCipheriv(ALGORITHM, key, iv);
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return serializePayload({
        salt,
        iv,
        authTag,
        ciphertext: encrypted,
      });
    } catch (err) {
      logger.error({ err }, 'Encryption failed');
      throw Errors.encryptionError();
    }
  }

  /**
   * Decrypt a string value
   */
  decryptString(encrypted: string): string {
    if (!this.enabled || !encrypted) {
      return encrypted;
    }

    // Check if this looks like an encrypted payload (base64)
    if (!this.isEncrypted(encrypted)) {
      return encrypted; // Return as-is if not encrypted (legacy data)
    }

    try {
      const { salt, iv, authTag, ciphertext } = parsePayload(encrypted);
      const key = deriveKey(this.encryptionKey, salt);

      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (err) {
      logger.error({ err }, 'Decryption failed - returning original value');
      return encrypted; // Return as-is if decryption fails (legacy data)
    }
  }

  /**
   * Encrypt a JSON object
   */
  encryptJson<T extends Record<string, unknown>>(data: T): string {
    if (!this.enabled || !data || Object.keys(data).length === 0) {
      return JSON.stringify(data);
    }

    const jsonString = JSON.stringify(data);
    return this.encryptString(jsonString);
  }

  /**
   * Decrypt a JSON object
   */
  decryptJson<T extends Record<string, unknown>>(encrypted: string): T {
    if (!this.enabled || !encrypted) {
      return JSON.parse(encrypted || '{}') as T;
    }

    // Check if this is encrypted or plain JSON
    if (!this.isEncrypted(encrypted)) {
      return JSON.parse(encrypted) as T;
    }

    const decrypted = this.decryptString(encrypted);
    return JSON.parse(decrypted) as T;
  }

  /**
   * Check if a value appears to be encrypted (base64 with correct length prefix)
   */
  private isEncrypted(value: string): boolean {
    if (!value || value.length < 100) {
      return false;
    }

    // Try to decode as base64
    try {
      const decoded = Buffer.from(value, 'base64');
      // Check minimum length for our format
      return decoded.length >= SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;
    } catch {
      return false;
    }
  }
}

/**
 * Create encryption service from environment
 */
export function createEncryptionService(): EncryptionService {
  return new EncryptionService();
}
