import { Test, TestingModule } from '@nestjs/testing';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';

const mockHrService = () => ({
  handleEvent: jest.fn().mockResolvedValue({ processed: true, deduped: false }),
});

const mockConfig = () => ({
  get: jest.fn((key: string) => (key === 'HR_WEBHOOK_SECRET' ? 'top-secret' : undefined)),
});

describe('HrController', () => {
  let controller: HrController;
  let hr: ReturnType<typeof mockHrService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HrController],
      providers: [
        { provide: HrService, useFactory: mockHrService },
        { provide: ConfigService, useFactory: mockConfig },
      ],
    }).compile();

    controller = module.get(HrController);
    hr = module.get(HrService) as any;
  });

  it('accepts valid signature', async () => {
    const event = {
      id: 'evt-1',
      type: 'employee.onboarded',
      payload: { email: 'a@company.com' },
    } as const;
    const rawBody = Buffer.from(JSON.stringify(event));
    const signature = crypto.createHmac('sha256', 'top-secret').update(rawBody).digest('hex');
    const result = await controller.handleWebhook(event as any, signature, { rawBody } as any);

    expect(hr.handleEvent).toHaveBeenCalledWith(event);
    expect(result.success).toBe(true);
  });

  it('processes offboard events with valid signature', async () => {
    const event = {
      id: 'evt-2',
      type: 'employee.offboarded',
      payload: { email: 'a@company.com' },
    } as const;
    const rawBody = Buffer.from(JSON.stringify(event));
    const signature = crypto.createHmac('sha256', 'top-secret').update(rawBody).digest('hex');

    await controller.handleWebhook(event as any, signature, { rawBody } as any);
    expect(hr.handleEvent).toHaveBeenCalledWith(event);
  });

  it('rejects invalid signature', async () => {
    const event = {
      id: 'evt-1',
      type: 'employee.onboarded',
      payload: { email: 'a@company.com' },
    } as const;
    await expect(
      controller.handleWebhook(event as any, 'bad-signature', {
        rawBody: Buffer.from(JSON.stringify(event)),
      } as any),
    ).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts prefixed sha256 signature header', async () => {
    const event = {
      id: 'evt-1',
      type: 'employee.onboarded',
      payload: { email: 'a@company.com' },
    } as const;
    const rawBody = Buffer.from(JSON.stringify(event));
    const signature = crypto.createHmac('sha256', 'top-secret').update(rawBody).digest('hex');

    await expect(
      controller.handleWebhook(event as any, `sha256=${signature}`, { rawBody } as any),
    ).resolves.toBeDefined();
  });

  it('rejects missing signature', async () => {
    const event = {
      id: 'evt-3',
      type: 'employee.transferred',
      payload: { email: 'a@company.com' },
    } as const;

    await expect(
      controller.handleWebhook(event as any, undefined, { rawBody: Buffer.from(JSON.stringify(event)) } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects missing raw body', async () => {
    const event = {
      id: 'evt-4',
      type: 'employee.onboarded',
      payload: { email: 'a@company.com' },
    } as const;
    const signature = crypto
      .createHmac('sha256', 'top-secret')
      .update(Buffer.from(JSON.stringify(event)))
      .digest('hex');

    await expect(
      controller.handleWebhook(event as any, signature, { rawBody: undefined } as any),
    ).rejects.toThrow(UnauthorizedException);
  });
});
