import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { OneTimeTokenService } from './one-time-token.service';
import { EMAIL_TEMPLATES } from './email.types';

const sendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail,
  })),
}));

const mockConfig = (overrides: Record<string, string> = {}) => ({
  get: jest.fn((key: string, fallback?: string) => {
    const defaults: Record<string, string> = {
      SMTP_HOST: 'smtp.company.local',
      SMTP_PORT: '587',
      SMTP_USER: 'bot',
      SMTP_PASSWORD: 'secret',
      SMTP_FROM: 'aihub@company.local',
      AIHUB_OPS_EMAILS: 'ops1@company.local,ops2@company.local',
      REPORT_RECIPIENTS: 'cto@company.local,cfo@company.local',
      AIHUB_SUPPORT_EMAIL: 'support@company.local',
      ADMIN_PORTAL_URL: 'https://portal.company.local',
    };
    return overrides[key] ?? defaults[key] ?? fallback;
  }),
});

const mockPrisma = () => ({
  user: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'user@company.local',
      status: 'ACTIVE',
    }),
  },
});

const mockTokenService = () => ({
  issue: jest.fn().mockResolvedValue('token-abc'),
});

describe('EmailService', () => {
  let service: EmailService;
  let config: ReturnType<typeof mockConfig>;
  let prisma: ReturnType<typeof mockPrisma>;
  let tokenService: ReturnType<typeof mockTokenService>;

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({});
    config = mockConfig();
    prisma = mockPrisma();
    tokenService = mockTokenService();
    service = new EmailService(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
      tokenService as unknown as OneTimeTokenService,
    );
    service.onModuleInit();
  });

  it('sends user budget alert email', async () => {
    await service.sendToUser('user-1', EMAIL_TEMPLATES.BUDGET_ALERT, {
      threshold: 90,
      currentCost: 90,
      budgetCap: 100,
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@company.local',
        subject: '[AIHub] Budget threshold reached',
      }),
    );
  });

  it('skips inactive users gracefully', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-2',
      email: 'inactive@company.local',
      status: 'OFFBOARDED',
    });

    await service.sendToUser('user-2', EMAIL_TEMPLATES.BUDGET_ALERT, {
      threshold: 70,
      currentCost: 70,
      budgetCap: 100,
    });

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('retries transient send errors', async () => {
    sendMail
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({});

    await service.sendToGroup('ops', EMAIL_TEMPLATES.TEAM_BUDGET_ALERT, {
      threshold: 90,
      teamId: 'team-1',
    });

    expect(sendMail).toHaveBeenCalledTimes(3);
  });

  it('generates onboarding mail with one-time tokenized link', async () => {
    await service.sendOnboardingKeyDelivery({
      userId: 'user-1',
      email: 'user@company.local',
      keyId: 'key-1',
      keyPlaintext: 'aihub_prod_plaintext',
    });

    expect(tokenService.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'user-1',
        purpose: 'key_reveal',
        resourceId: 'key-1',
        keyPlaintext: 'aihub_prod_plaintext',
      }),
    );
    const call = sendMail.mock.calls[0][0];
    expect(call.text).toContain('token-abc');
    expect(call.text).not.toContain('aihub_prod_');
  });

  it('throws on invalid recipient list format at startup', () => {
    const badConfig = mockConfig({ AIHUB_OPS_EMAILS: 'invalid-email' });
    const instance = new EmailService(
      badConfig as unknown as ConfigService,
      prisma as unknown as PrismaService,
      tokenService as unknown as OneTimeTokenService,
    );
    expect(() => instance.onModuleInit()).toThrow('Invalid email address in list');
  });
});
