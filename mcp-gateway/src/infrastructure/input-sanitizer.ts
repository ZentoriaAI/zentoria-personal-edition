/**
 * Input Sanitizer - SEC-006
 *
 * Sanitizes user input and detects potential prompt injection attacks.
 * This helps protect AI systems from malicious input manipulation.
 */

import type { Logger } from 'pino';

// ============================================================================
// Types
// ============================================================================

export interface SanitizationResult {
  /** Sanitized input (safe to use) */
  sanitized: string;
  /** Whether the input was modified during sanitization */
  wasModified: boolean;
  /** Whether potential injection patterns were detected */
  suspiciousPatterns: string[];
  /** Risk level based on detected patterns */
  riskLevel: 'low' | 'medium' | 'high';
  /** Whether the input should be blocked entirely */
  shouldBlock: boolean;
}

export interface SanitizationOptions {
  /** Maximum allowed input length */
  maxLength?: number;
  /** Whether to strip HTML tags */
  stripHtml?: boolean;
  /** Whether to normalize unicode */
  normalizeUnicode?: boolean;
  /** Whether to detect prompt injection patterns */
  detectInjection?: boolean;
  /** Strict mode blocks suspicious inputs instead of just flagging */
  strictMode?: boolean;
}

// ============================================================================
// Prompt Injection Patterns
// ============================================================================

/**
 * Known prompt injection patterns and techniques
 * These patterns are detected but not all result in blocking
 */
const INJECTION_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high';
  description: string;
}> = [
  // High severity - direct system prompt manipulation
  {
    name: 'system_prompt_override',
    pattern: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|context)/i,
    severity: 'high',
    description: 'Attempt to override system prompt',
  },
  {
    name: 'new_instructions',
    pattern: /\b(new|updated|real|actual|true)\s+(instructions?|prompts?|rules?|system\s+prompt)/i,
    severity: 'high',
    description: 'Attempt to inject new instructions',
  },
  {
    name: 'role_impersonation',
    pattern: /\b(you\s+are\s+now|act\s+as|pretend\s+(to\s+be|you'?re?)|roleplay\s+as|assume\s+the\s+role)/i,
    severity: 'high',
    description: 'Attempt to change AI role',
  },
  {
    name: 'jailbreak_attempt',
    pattern: /\b(DAN|do\s+anything\s+now|jailbreak|bypass\s+safety|remove\s+restrictions?|developer\s+mode|god\s+mode)/i,
    severity: 'high',
    description: 'Known jailbreak technique',
  },

  // Medium severity - manipulation techniques
  {
    name: 'delimiter_injection',
    pattern: /```(system|instructions?|prompt|config|settings?)\b/i,
    severity: 'medium',
    description: 'Code block delimiter injection',
  },
  {
    name: 'xml_tag_injection',
    pattern: /<\/?(?:system|instructions?|prompt|user|assistant|human|ai|message)\s*>/i,
    severity: 'medium',
    description: 'XML tag injection attempt',
  },
  {
    name: 'prompt_leaking',
    pattern: /\b(reveal|show|display|print|output|repeat)\s+(your|the|system|original)\s+(prompt|instructions?|rules?|context)/i,
    severity: 'medium',
    description: 'Attempt to leak system prompt',
  },
  {
    name: 'context_manipulation',
    pattern: /\b(end\s+of\s+(context|conversation|prompt)|from\s+now\s+on|starting\s+now)/i,
    severity: 'medium',
    description: 'Context boundary manipulation',
  },
  {
    name: 'output_manipulation',
    pattern: /\b(respond\s+with|only\s+say|reply\s+with|output\s+exactly|just\s+print)\s*['":]?\s*$/im,
    severity: 'medium',
    description: 'Output format manipulation',
  },

  // Low severity - suspicious but often benign
  {
    name: 'base64_encoded',
    pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/,
    severity: 'low',
    description: 'Potential base64 encoded content',
  },
  {
    name: 'excessive_special_chars',
    pattern: /[<>{}[\]\\|^~`]{10,}/,
    severity: 'low',
    description: 'Excessive special characters',
  },
  {
    name: 'unicode_lookalikes',
    pattern: /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/,
    severity: 'low',
    description: 'Unicode characters that may be lookalikes',
  },
];

/**
 * Patterns that indicate specific harmful intents
 */
const HARMFUL_INTENT_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
}> = [
  {
    name: 'data_exfiltration',
    pattern: /\b(send|transmit|email|post|upload)\s+(to|the)\s+(data|information|keys?|credentials?|secrets?|passwords?)/i,
  },
  {
    name: 'code_execution',
    pattern: /\b(execute|run|eval|exec)\s+(this|the|following)?\s*(code|script|command)/i,
  },
  {
    name: 'file_access',
    pattern: /\b(read|write|access|delete|modify)\s+(the|a)?\s*\/?(etc|var|home|root|windows|system32)/i,
  },
];

// ============================================================================
// Sanitization Functions
// ============================================================================

/**
 * Remove or escape HTML tags
 */
function stripHtmlTags(input: string): string {
  // Replace HTML tags with empty string but preserve content
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags entirely
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove style tags entirely
    .replace(/<[^>]+>/g, ' ') // Replace other tags with space
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Normalize unicode to prevent homograph attacks
 */
function normalizeUnicode(input: string): string {
  // NFKC normalization converts lookalike characters to their canonical form
  return input.normalize('NFKC');
}

/**
 * Escape potential delimiter characters
 */
function escapeDelimiters(input: string): string {
  // Escape backticks that could be used for code block injection
  return input.replace(/`{3,}/g, '\\`\\`\\`');
}

/**
 * Detect prompt injection patterns
 */
function detectInjectionPatterns(input: string): Array<{
  name: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}> {
  const detected: Array<{
    name: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }> = [];

  for (const { name, pattern, severity, description } of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      detected.push({ name, severity, description });
    }
  }

  return detected;
}

/**
 * Check for harmful intent patterns
 */
function detectHarmfulIntent(input: string): string[] {
  const detected: string[] = [];

  for (const { name, pattern } of HARMFUL_INTENT_PATTERNS) {
    if (pattern.test(input)) {
      detected.push(name);
    }
  }

  return detected;
}

/**
 * Calculate risk level based on detected patterns
 */
function calculateRiskLevel(patterns: Array<{ severity: 'low' | 'medium' | 'high' }>): 'low' | 'medium' | 'high' {
  if (patterns.some(p => p.severity === 'high')) {
    return 'high';
  }
  if (patterns.filter(p => p.severity === 'medium').length >= 2) {
    return 'high';
  }
  if (patterns.some(p => p.severity === 'medium')) {
    return 'medium';
  }
  if (patterns.length > 0) {
    return 'low';
  }
  return 'low';
}

// ============================================================================
// Main Sanitization Function
// ============================================================================

const DEFAULT_OPTIONS: Required<SanitizationOptions> = {
  maxLength: 32000,
  stripHtml: true,
  normalizeUnicode: true,
  detectInjection: true,
  strictMode: false,
};

/**
 * Sanitize user input and detect potential prompt injection attacks
 *
 * SEC-006: Provides multi-layer protection including truncation, unicode normalization,
 * HTML stripping, delimiter escaping, and injection pattern detection.
 *
 * @param input - The raw user input string to sanitize
 * @param options - Optional configuration for sanitization behavior
 * @returns Sanitization result with sanitized string, risk level, and detection metadata
 *
 * @example
 * ```ts
 * const result = sanitizeInput('Hello, world!');
 * if (result.shouldBlock) {
 *   throw new Error('Suspicious input detected');
 * }
 * // Use result.sanitized for safe input
 * ```
 */
export function sanitizeInput(
  input: string,
  options: SanitizationOptions = {}
): SanitizationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let sanitized = input;
  let wasModified = false;

  // Truncate if too long
  if (sanitized.length > opts.maxLength) {
    sanitized = sanitized.slice(0, opts.maxLength);
    wasModified = true;
  }

  // Normalize unicode
  if (opts.normalizeUnicode) {
    const normalized = normalizeUnicode(sanitized);
    if (normalized !== sanitized) {
      sanitized = normalized;
      wasModified = true;
    }
  }

  // Strip HTML
  if (opts.stripHtml) {
    const stripped = stripHtmlTags(sanitized);
    if (stripped !== sanitized) {
      sanitized = stripped;
      wasModified = true;
    }
  }

  // Escape delimiters
  const escaped = escapeDelimiters(sanitized);
  if (escaped !== sanitized) {
    sanitized = escaped;
    wasModified = true;
  }

  // Detect injection patterns
  const injectionPatterns = opts.detectInjection
    ? detectInjectionPatterns(input) // Check original input for patterns
    : [];

  const harmfulPatterns = detectHarmfulIntent(input);
  const suspiciousPatterns = [
    ...injectionPatterns.map(p => p.name),
    ...harmfulPatterns,
  ];

  const riskLevel = calculateRiskLevel(injectionPatterns);

  // Determine if should block
  const shouldBlock =
    opts.strictMode &&
    (riskLevel === 'high' || harmfulPatterns.length > 0);

  return {
    sanitized,
    wasModified,
    suspiciousPatterns,
    riskLevel,
    shouldBlock,
  };
}

/**
 * Sanitize system prompt with stricter length limits
 *
 * Unlike user input, system prompts are trusted so injection detection is disabled.
 *
 * @param input - The system prompt to sanitize
 * @param options - Optional configuration (detectInjection and strictMode are ignored)
 * @returns The sanitized system prompt string
 */
export function sanitizeSystemPrompt(
  input: string,
  options: Omit<SanitizationOptions, 'detectInjection' | 'strictMode'> = {}
): string {
  const result = sanitizeInput(input, {
    ...options,
    maxLength: options.maxLength || 4000,
    detectInjection: false, // System prompts are trusted
    strictMode: false,
  });
  return result.sanitized;
}

/**
 * Log suspicious input for security review and audit
 *
 * Logs at appropriate severity level based on risk:
 * - high: logger.warn
 * - medium: logger.info
 * - low: logger.debug
 *
 * @param logger - Pino logger instance
 * @param userId - The user ID who submitted the input
 * @param input - The original input string
 * @param result - The sanitization result from sanitizeInput()
 */
export function logSuspiciousInput(
  logger: Logger,
  userId: string,
  input: string,
  result: SanitizationResult
): void {
  if (result.suspiciousPatterns.length === 0) {
    return;
  }

  const logData = {
    userId,
    riskLevel: result.riskLevel,
    patterns: result.suspiciousPatterns,
    inputLength: input.length,
    wasModified: result.wasModified,
    shouldBlock: result.shouldBlock,
    // Include truncated input for review (first 200 chars)
    inputPreview: input.slice(0, 200) + (input.length > 200 ? '...' : ''),
  };

  if (result.riskLevel === 'high') {
    logger.warn(logData, 'SEC-006: High-risk input detected');
  } else if (result.riskLevel === 'medium') {
    logger.info(logData, 'SEC-006: Medium-risk input detected');
  } else {
    logger.debug(logData, 'SEC-006: Low-risk input detected');
  }
}

/**
 * Create a sanitizer function with pre-configured default options
 *
 * Useful for creating module-specific sanitizers with consistent settings.
 *
 * @param defaultOptions - Default options to apply to all sanitization calls
 * @returns A sanitizer function that accepts input and optional override options
 */
export function createSanitizer(defaultOptions: SanitizationOptions = {}) {
  return (input: string, options: SanitizationOptions = {}) =>
    sanitizeInput(input, { ...defaultOptions, ...options });
}
