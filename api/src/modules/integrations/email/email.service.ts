import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { createTransport, Transporter } from 'nodemailer';
import { EMAIL_TEMPLATES, EmailTemplateId } from './email.types';
import { OneTimeTokenService } from './one-time-token.service';

const SEND_RETRY_LIMIT = 3;
const RETRY_DELAYS_MS = [250, 500];

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;
  private fromAddress: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokenService: OneTimeTokenService,
  ) {}

  onModuleInit(): void {
    const host = this.requireEnv('SMTP_HOST');
    const user = this.requireEnv('SMTP_USER');
    const password = this.requireEnv('SMTP_PASSWORD');
    const from = this.requireEnv('SMTP_FROM');
    this.parseEmailList(this.requireEnv('AIHUB_OPS_EMAILS'));
    this.parseEmailList(this.requireEnv('REPORT_RECIPIENTS'));
    this.requireEnv('AIHUB_SUPPORT_EMAIL');

    const port = Number(this.config.get('SMTP_PORT', '587'));
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error('SMTP_PORT must be a positive integer');
    }

    this.fromAddress = from;
    this.transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
      requireTLS: port !== 465,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  }

  async sendToUser(
    userId: string,
    template: EmailTemplateId,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true },
    });
    if (!user) throw new Error(`User not found: ${userId}`);
    if (user.status !== 'ACTIVE') return;
    await this.send(template, [user.email], payload);
  }

  async sendToGroup(
    group: 'ops' | 'report_recipients',
    template: EmailTemplateId,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const envName = group === 'ops' ? 'AIHUB_OPS_EMAILS' : 'REPORT_RECIPIENTS';
    const recipients = this.parseEmailList(this.requireEnv(envName));
    if (recipients.length === 0) {
      this.logger.warn(`No recipients configured for group ${group}`);
      return;
    }
    await this.send(template, recipients, payload);
  }

  async sendOnboardingKeyDelivery(input: {
    userId: string;
    email: string;
    keyId: string;
    keyPlaintext: string;
  }): Promise<void> {
    const token = await this.tokenService.issue({
      subject: input.userId,
      purpose: 'key_reveal',
      resourceId: input.keyId,
      ttlHours: 24,
      keyPlaintext: input.keyPlaintext,
    });
    const portalBaseUrl = this.config.get<string>('ADMIN_PORTAL_URL', 'http://localhost:5173');
    await this.send(EMAIL_TEMPLATES.ONBOARDING_KEY_DELIVERY, [input.email], {
      revealUrl: `${portalBaseUrl}/keys/reveal?token=${token}`,
      expiresInHours: 24,
    });
  }

  private async send(
    template: EmailTemplateId,
    recipients: string[],
    payload: Record<string, unknown>,
  ): Promise<void> {
    const content = this.renderTemplate(template, payload);
    await this.sendWithRetry({
      from: this.fromAddress,
      to: recipients.join(','),
      subject: content.subject,
      text: content.text,
    });
  }

  private async sendWithRetry(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    let attempt = 0;
    while (attempt < SEND_RETRY_LIMIT) {
      try {
        await this.transporter.sendMail(message);
        return;
      } catch (error) {
        attempt += 1;
        if (attempt >= SEND_RETRY_LIMIT) throw error;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1] ?? 1000));
      }
    }
  }

  private renderTemplate(
    template: EmailTemplateId,
    payload: Record<string, unknown>,
  ): { subject: string; text: string } {
    switch (template) {
      case EMAIL_TEMPLATES.BUDGET_ALERT:
        return {
          subject: '[AIHub] Budget threshold reached',
          text: `Your usage reached ${payload.threshold}% of budget. Current: $${payload.currentCost} / $${payload.budgetCap}.`,
        };
      case EMAIL_TEMPLATES.TEAM_BUDGET_ALERT:
        return {
          subject: '[AIHub] Team budget threshold reached',
          text: `Team ${payload.teamId} reached ${payload.threshold}% of budget.`,
        };
      case EMAIL_TEMPLATES.KEY_ROTATION_REMINDER:
        return {
          subject: '[AIHub] Key rotation reminder',
          text: 'Your API key is due for rotation. Please rotate from the Admin Portal.',
        };
      case EMAIL_TEMPLATES.SPIKE_DETECTED:
        return {
          subject: '[AIHub] Usage spike detected',
          text: `Team ${payload.teamId} has unusual spend spike: $${payload.currentCost} vs 7-day avg $${payload.baselineCost}.`,
        };
      case EMAIL_TEMPLATES.MONTHLY_REPORT_READY:
        return {
          subject: '[AIHub] Monthly usage report is ready',
          text: `Monthly report is ready. View in portal: ${payload.reportUrl ?? 'N/A'}`,
        };
      case EMAIL_TEMPLATES.ONBOARDING_KEY_DELIVERY:
        return {
          subject: '[AIHub] Your API key setup link',
          text: `Open this one-time setup link: ${payload.revealUrl}. Link expires in ${payload.expiresInHours} hours.`,
        };
      default:
        throw new Error(`Unknown email template: ${template}`);
    }
  }

  private requireEnv(name: string): string {
    const value = this.config.get<string>(name);
    if (!value || !value.trim()) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value.trim();
  }

  private parseEmailList(raw: string): string[] {
    return raw
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean)
      .map((email) => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error(`Invalid email address in list: ${email}`);
        }
        return email;
      });
  }
}
