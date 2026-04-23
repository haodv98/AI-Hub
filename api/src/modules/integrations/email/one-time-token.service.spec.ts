import { OneTimeTokenService } from './one-time-token.service';
import { RedisService } from '../../../redis/redis.service';
import { ConfigService } from '@nestjs/config';

const mockRedis = () => ({
  setNx: jest.fn().mockResolvedValue(true),
  getDel: jest.fn(),
});

const mockConfig = () => ({
  get: jest.fn((key: string) => (key === 'CLAIM_TOKEN_ENCRYPTION_KEY' ? 'local-secret-key' : undefined)),
});

describe('OneTimeTokenService', () => {
  let service: OneTimeTokenService;
  let redis: ReturnType<typeof mockRedis>;
  let config: ReturnType<typeof mockConfig>;

  beforeEach(() => {
    redis = mockRedis();
    config = mockConfig();
    service = new OneTimeTokenService(
      redis as unknown as RedisService,
      config as unknown as ConfigService,
    );
  });

  it('issues token with ttl in seconds', async () => {
    const token = await service.issue({
      subject: 'user-1',
      purpose: 'key_reveal',
      resourceId: 'key-1',
      ttlHours: 24,
    });

    expect(token.length).toBeGreaterThan(20);
    expect(redis.setNx).toHaveBeenCalledWith(
      expect.stringContaining('email:onetime:'),
      expect.any(String),
      86400,
    );
    const storedPayload = JSON.parse((redis.setNx as jest.Mock).mock.calls[0][1] as string);
    expect(storedPayload.keyPlaintext).toBeUndefined();
  });

  it('throws when ttl is invalid', async () => {
    await expect(
      service.issue({
        subject: 'user-1',
        purpose: 'key_reveal',
        resourceId: 'key-1',
        ttlHours: 0,
      }),
    ).rejects.toThrow('Token TTL must be greater than 0');
  });

  it('consumes token once and validates purpose', async () => {
    redis.getDel.mockResolvedValueOnce(
      JSON.stringify({
        subject: 'user-1',
        purpose: 'key_reveal',
        resourceId: 'key-1',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        keyPlaintext: 'dGVzdA==.dGVzdA==.dGVzdA==',
      }),
    );
    await expect(service.consume('token-1234567890123456', 'key_reveal')).resolves.toBeNull();

    redis.getDel.mockResolvedValueOnce(null);
    const secondTry = await service.consume('token-1234567890123456', 'key_reveal');
    expect(secondTry).toBeNull();
  });

  it('returns null for malformed token input', async () => {
    const payload = await service.consume('short', 'key_reveal');
    expect(payload).toBeNull();
    expect(redis.getDel).not.toHaveBeenCalled();
  });

  it('returns null when token is expired', async () => {
    redis.getDel.mockResolvedValueOnce(
      JSON.stringify({
        subject: 'user-1',
        purpose: 'key_reveal',
        resourceId: 'key-1',
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    );

    const payload = await service.consume('token-1234567890123456', 'key_reveal');
    expect(payload).toBeNull();
  });

  it('decrypts plaintext key during consume when encrypted payload exists', async () => {
    const token = await service.issue({
      subject: 'user-1',
      purpose: 'key_reveal',
      resourceId: 'key-1',
      ttlHours: 1,
      keyPlaintext: 'aihub_prod_secret',
    });
    expect(token).toBeTruthy();

    const [, storedValue] = (redis.setNx as jest.Mock).mock.calls[0];
    redis.getDel.mockResolvedValueOnce(storedValue);

    const validPayload = await service.consume(token, 'key_reveal');
    expect(validPayload?.keyPlaintext).toBe('aihub_prod_secret');
  });
});
