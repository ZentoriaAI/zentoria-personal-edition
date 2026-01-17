/**
 * File Validator Infrastructure
 *
 * Magic byte validation for uploaded files to prevent MIME type spoofing
 */

import { Readable } from 'stream';

/**
 * Magic byte signatures for common file types
 * Format: [bytes, offset, mimeTypes[]]
 */
const MAGIC_SIGNATURES: Array<{
  bytes: number[];
  offset?: number;
  mimeTypes: string[];
}> = [
  // Images
  { bytes: [0xFF, 0xD8, 0xFF], mimeTypes: ['image/jpeg'] },
  { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], mimeTypes: ['image/png'] },
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mimeTypes: ['image/gif'] }, // GIF87a
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mimeTypes: ['image/gif'] }, // GIF89a
  { bytes: [0x42, 0x4D], mimeTypes: ['image/bmp'] },
  { bytes: [0x00, 0x00, 0x01, 0x00], mimeTypes: ['image/x-icon', 'image/vnd.microsoft.icon'] },
  { bytes: [0x52, 0x49, 0x46, 0x46], mimeTypes: ['image/webp', 'audio/wav', 'video/webm'] }, // RIFF container

  // PDF
  { bytes: [0x25, 0x50, 0x44, 0x46], mimeTypes: ['application/pdf'] }, // %PDF

  // Archives
  { bytes: [0x50, 0x4B, 0x03, 0x04], mimeTypes: ['application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'] },
  { bytes: [0x1F, 0x8B], mimeTypes: ['application/gzip', 'application/x-gzip'] },
  { bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], mimeTypes: ['application/x-rar-compressed', 'application/vnd.rar'] },
  { bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], mimeTypes: ['application/x-7z-compressed'] },

  // Documents
  { bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], mimeTypes: ['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'] }, // OLE2

  // Audio
  { bytes: [0x49, 0x44, 0x33], mimeTypes: ['audio/mpeg', 'audio/mp3'] }, // ID3
  { bytes: [0xFF, 0xFB], mimeTypes: ['audio/mpeg', 'audio/mp3'] },
  { bytes: [0xFF, 0xF3], mimeTypes: ['audio/mpeg', 'audio/mp3'] },
  { bytes: [0xFF, 0xF2], mimeTypes: ['audio/mpeg', 'audio/mp3'] },
  { bytes: [0x4F, 0x67, 0x67, 0x53], mimeTypes: ['audio/ogg', 'video/ogg'] }, // OggS
  { bytes: [0x66, 0x4C, 0x61, 0x43], mimeTypes: ['audio/flac'] }, // fLaC

  // Video
  { bytes: [0x00, 0x00, 0x00], mimeTypes: ['video/mp4', 'video/quicktime'] }, // MP4/MOV (ftyp follows)
  { bytes: [0x1A, 0x45, 0xDF, 0xA3], mimeTypes: ['video/webm', 'video/x-matroska'] }, // WebM/MKV

  // Executables (blocked by default)
  { bytes: [0x4D, 0x5A], mimeTypes: ['application/x-msdownload', 'application/x-dosexec'] }, // MZ (Windows EXE)
  { bytes: [0x7F, 0x45, 0x4C, 0x46], mimeTypes: ['application/x-executable', 'application/x-elf'] }, // ELF

  // Scripts (check with care)
  { bytes: [0x23, 0x21], mimeTypes: ['text/x-shellscript', 'application/x-sh'] }, // #! (shebang)
];

/**
 * MIME types that should be blocked (security risk)
 */
const BLOCKED_MIME_TYPES = new Set([
  'application/x-msdownload',
  'application/x-dosexec',
  'application/x-executable',
  'application/x-elf',
  'application/x-sh',
  'application/x-shellscript',
  'text/x-shellscript',
  'application/x-bat',
  'application/x-msdos-program',
]);

/**
 * MIME types that are always allowed (text-based, safe to inspect)
 */
const SAFE_TEXT_TYPES = new Set([
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'application/xml',
  'text/xml',
  'text/markdown',
  'text/csv',
  'application/yaml',
  'text/yaml',
]);

export interface FileValidationResult {
  valid: boolean;
  detectedMimeType?: string;
  reason?: string;
}

/**
 * Validate file by checking magic bytes against claimed MIME type
 */
export async function validateFileMagicBytes(
  stream: Readable,
  claimedMimeType: string
): Promise<{ result: FileValidationResult; bufferedChunks: Buffer[] }> {
  const bufferedChunks: Buffer[] = [];
  let headerBytes: Buffer | null = null;

  // Read enough bytes for magic number detection
  const HEADER_SIZE = 16;

  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      bufferedChunks.push(chunk);

      if (!headerBytes && Buffer.concat(bufferedChunks).length >= HEADER_SIZE) {
        headerBytes = Buffer.concat(bufferedChunks).subarray(0, HEADER_SIZE);
        stream.removeListener('data', onData);
        stream.pause();

        const result = validateHeader(headerBytes, claimedMimeType);
        resolve({ result, bufferedChunks });
      }
    };

    stream.on('data', onData);

    // Handle small files that end before we get enough bytes
    stream.on('end', () => {
      if (!headerBytes) {
        headerBytes = Buffer.concat(bufferedChunks);
        const result = validateHeader(headerBytes, claimedMimeType);
        resolve({ result, bufferedChunks });
      }
    });

    stream.on('error', () => {
      resolve({
        result: { valid: false, reason: 'Stream error during validation' },
        bufferedChunks,
      });
    });
  });
}

/**
 * Validate header bytes against claimed MIME type
 */
function validateHeader(header: Buffer, claimedMimeType: string): FileValidationResult {
  // Normalize MIME type
  const normalizedClaim = claimedMimeType.toLowerCase().split(';')[0].trim();

  // Block dangerous file types
  if (BLOCKED_MIME_TYPES.has(normalizedClaim)) {
    return {
      valid: false,
      reason: `File type '${claimedMimeType}' is blocked for security reasons`,
    };
  }

  // Check if detected magic bytes indicate a blocked type
  for (const sig of MAGIC_SIGNATURES) {
    if (matchesSignature(header, sig.bytes, sig.offset)) {
      for (const detectedMime of sig.mimeTypes) {
        if (BLOCKED_MIME_TYPES.has(detectedMime)) {
          return {
            valid: false,
            detectedMimeType: detectedMime,
            reason: `File content detected as blocked type '${detectedMime}'`,
          };
        }
      }
    }
  }

  // Safe text types don't need magic byte validation
  if (SAFE_TEXT_TYPES.has(normalizedClaim)) {
    // But check if it's actually a binary file pretending to be text
    const detectedMime = detectMimeType(header);
    if (detectedMime && !SAFE_TEXT_TYPES.has(detectedMime)) {
      return {
        valid: false,
        detectedMimeType: detectedMime,
        reason: `File claimed to be '${claimedMimeType}' but detected as '${detectedMime}'`,
      };
    }
    return { valid: true };
  }

  // For binary types, verify magic bytes match claimed type
  const detectedMime = detectMimeType(header);

  // If we can't detect the type, allow it (might be a valid unknown format)
  if (!detectedMime) {
    return { valid: true };
  }

  // Check if detected type is compatible with claimed type
  if (isCompatibleMimeType(normalizedClaim, detectedMime)) {
    return { valid: true, detectedMimeType: detectedMime };
  }

  // Mismatch between claimed and detected
  return {
    valid: false,
    detectedMimeType: detectedMime,
    reason: `File claimed to be '${claimedMimeType}' but detected as '${detectedMime}'`,
  };
}

/**
 * Detect MIME type from magic bytes
 */
function detectMimeType(header: Buffer): string | undefined {
  for (const sig of MAGIC_SIGNATURES) {
    if (matchesSignature(header, sig.bytes, sig.offset)) {
      return sig.mimeTypes[0];
    }
  }
  return undefined;
}

/**
 * Check if header matches a magic signature
 */
function matchesSignature(header: Buffer, bytes: number[], offset = 0): boolean {
  if (header.length < offset + bytes.length) {
    return false;
  }

  for (let i = 0; i < bytes.length; i++) {
    if (header[offset + i] !== bytes[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Check if two MIME types are compatible
 * (e.g., detected 'image/jpeg' is compatible with claimed 'image/jpeg')
 */
function isCompatibleMimeType(claimed: string, detected: string): boolean {
  // Exact match
  if (claimed === detected) {
    return true;
  }

  // Same primary type (image/*, text/*, etc.)
  const claimedPrimary = claimed.split('/')[0];
  const detectedPrimary = detected.split('/')[0];

  if (claimedPrimary === detectedPrimary) {
    // Some specific allowances
    // RIFF container can be webp, wav, or avi
    if (detected === 'image/webp' && claimed.startsWith('image/')) {
      return true;
    }
    // Office documents share signatures
    if (detected === 'application/zip' && (
      claimed.includes('openxmlformats') ||
      claimed.includes('vnd.ms-')
    )) {
      return true;
    }
  }

  // Special cases for container formats
  const containerCompatibility: Record<string, string[]> = {
    'application/zip': [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/epub+zip',
      'application/java-archive',
    ],
    'video/mp4': ['video/quicktime', 'audio/mp4'],
    'audio/mpeg': ['audio/mp3'],
  };

  if (containerCompatibility[detected]?.includes(claimed)) {
    return true;
  }

  return false;
}
