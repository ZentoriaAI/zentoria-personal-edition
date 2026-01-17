/**
 * Email Service
 *
 * Handles email sending via SMTP
 */

import { createTransport, Transporter } from 'nodemailer';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';

// Validation schemas
export const SendEmailSchema = z.object({
  to: z.union([
    z.string().email(),
    z.array(z.string().email()).max(50),
  ]),
  cc: z.array(z.string().email()).max(50).optional(),
  bcc: z.array(z.string().email()).max(50).optional(),
  subject: z.string().min(1).max(998),
  body: z.string().max(1000000).optional(),
  htmlBody: z.string().max(2000000).optional(),
  attachments: z.array(z.string()).max(10).optional(),
  replyTo: z.string().email().optional(),
  headers: z.record(z.string()).optional(),
});

export type SendEmailRequest = z.infer<typeof SendEmailSchema>;

export interface EmailResponse {
  id: string;
  status: 'sent' | 'queued' | 'failed';
  messageId?: string;
  sentAt?: string;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private readonly fileService: ContainerCradle['fileService'];
  private readonly auditRepository: ContainerCradle['auditRepository'];
  private readonly logger: ContainerCradle['logger'];

  constructor({
    fileService,
    auditRepository,
    logger,
  }: ContainerCradle) {
    this.fileService = fileService;
    this.auditRepository = auditRepository;
    this.logger = logger;

    this.initTransporter();
  }

  private initTransporter(): void {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    if (!host) {
      this.logger.warn('SMTP not configured, email sending disabled');
      return;
    }

    this.transporter = createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });

    // Verify connection
    this.transporter.verify()
      .then(() => {
        this.logger.info({ host, port }, 'SMTP connection verified');
      })
      .catch((err) => {
        this.logger.error({ err }, 'SMTP connection failed');
      });
  }

  /**
   * Send an email
   */
  async send(userId: string, request: SendEmailRequest): Promise<EmailResponse> {
    if (!this.transporter) {
      throw Errors.serviceUnavailable('Email service');
    }

    const emailId = `email_${nanoid(16)}`;
    const from = process.env.SMTP_FROM || 'noreply@zentoria.ai';

    // Normalize recipients
    const to = Array.isArray(request.to) ? request.to : [request.to];

    this.logger.info(
      { emailId, to: to.length, subject: request.subject },
      'Sending email'
    );

    // Validate that body or htmlBody is provided
    if (!request.body && !request.htmlBody) {
      throw Errors.badRequest('Either body or htmlBody must be provided');
    }

    // Process attachments
    const attachments: Array<{
      filename: string;
      content: Buffer | NodeJS.ReadableStream;
    }> = [];

    if (request.attachments?.length) {
      for (const fileId of request.attachments) {
        try {
          const { stream, metadata } = await this.fileService.getFileStream(userId, fileId);
          attachments.push({
            filename: metadata.filename,
            content: stream,
          });
        } catch (err) {
          this.logger.warn({ err, fileId }, 'Failed to attach file');
          // Continue without this attachment
        }
      }
    }

    try {
      const result = await this.transporter.sendMail({
        from,
        to: to.join(', '),
        cc: request.cc?.join(', '),
        bcc: request.bcc?.join(', '),
        replyTo: request.replyTo,
        subject: request.subject,
        text: request.body,
        html: request.htmlBody,
        attachments,
        headers: request.headers,
      });

      const sentAt = new Date().toISOString();

      // Log audit
      await this.auditRepository.log({
        action: 'email_sent',
        userId,
        metadata: {
          emailId,
          messageId: result.messageId,
          recipientCount: to.length + (request.cc?.length || 0) + (request.bcc?.length || 0),
          hasAttachments: attachments.length > 0,
        },
      });

      this.logger.info({ emailId, messageId: result.messageId }, 'Email sent');

      return {
        id: emailId,
        status: 'sent',
        messageId: result.messageId,
        sentAt,
      };
    } catch (err) {
      this.logger.error({ err, emailId }, 'Email sending failed');

      // Log audit
      await this.auditRepository.log({
        action: 'email_failed',
        userId,
        metadata: {
          emailId,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      });

      throw Errors.internal('Failed to send email');
    }
  }

  /**
   * Check SMTP connection status
   */
  async checkHealth(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.transporter) {
      return { healthy: false, message: 'SMTP not configured' };
    }

    try {
      await this.transporter.verify();
      return { healthy: true };
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }
}
