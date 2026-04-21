import { Test, TestingModule } from '@nestjs/testing';
import { KeysService } from './keys.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { ApiKeyStatus } from '@prisma/client';
import * as crypto from 'crypto';

// Minimal mock factory
const mockPrisma = () => ({
  apiKey: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
});

const mockRedis = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  expire: jest.fn().mockResolvedValue(undefined),
});

const mockAudit = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

describe('KeysService', () => {
  let service: KeysService;
  let prisma: ReturnType<typeof mockPrisma>;
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeysService,
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: RedisService, useFactory: mockRedis },
        { provide: AuditService, useFactory: mockAudit },
      ],
    }).compile();

    service = module.get(KeysService);
    prisma = module.get(PrismaService) as any;
    redis = module.get(RedisService) as any;
  });

  // ── Key format ────────────────────────────────────────────────────────────

  describe('generateKey', () => {
    it('generates key with correct prefix format', async () => {
      const mockKey = { id: 'k1', userId: 'u1', keyHash: 'h1', keyPrefix: 'aihub_prod_', status: ApiKeyStatus.ACTIVE, createdAt: new Date() };
      (prisma.apiKey.create as jest.Mock).mockResolvedValue(mockKey);

      const result = await service.generateKey('u1', 'actor1');

      expect(result.plaintext).toMatch(/^aihub_prod_[a-f0-9]{64}$/);
    });

    it('stores SHA-256 hash, not plaintext', async () => {
      const mockKey = { id: 'k1', userId: 'u1', keyHash: '', keyPrefix: '', status: ApiKeyStatus.ACTIVE, createdAt: new Date() };
      (prisma.apiKey.create as jest.Mock).mockImplementation(({ data }) => {
        mockKey.keyHash = data.keyHash;
        return Promise.resolve(mockKey);
      });

      const result = await service.generateKey('u1', 'actor1');
      const expectedHash = crypto.createHash('sha256').update(result.plaintext).digest('hex');

      expect(mockKey.keyHash).toBe(expectedHash);
      expect(mockKey.keyHash).not.toBe(result.plaintext);
    });

    it('SHA-256 hash is deterministic for same input', () => {
      const key = 'aihub_prod_abc123';
      const hash1 = service.hashKey(key);
      const hash2 = service.hashKey(key);
      expect(hash1).toBe(hash2);
    });

    it('different plaintexts produce different hashes', () => {
      expect(service.hashKey('key1')).not.toBe(service.hashKey('key2'));
    });

    it('key prefix matches first 20 chars of plaintext', async () => {
      let capturedPrefix = '';
      (prisma.apiKey.create as jest.Mock).mockImplementation(({ data }) => {
        capturedPrefix = data.keyPrefix;
        return Promise.resolve({ id: 'k1', userId: 'u1', keyHash: data.keyHash, keyPrefix: data.keyPrefix, status: ApiKeyStatus.ACTIVE, createdAt: new Date() });
      });

      const result = await service.generateKey('u1', 'actor1');
      expect(capturedPrefix).toBe(result.plaintext.slice(0, 20));
    });
  });

  // ── Rotation ──────────────────────────────────────────────────────────────

  describe('rotateKey', () => {
    it('marks old key as ROTATING', async () => {
      const oldKey = { id: 'k1', userId: 'u1', keyHash: 'oldhash', keyPrefix: 'aihub_prod_oldk', status: ApiKeyStatus.ACTIVE };
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(oldKey);
      (prisma.apiKey.create as jest.Mock).mockResolvedValue({ id: 'k2', userId: 'u1', keyHash: 'newhash', keyPrefix: 'aihub_prod_newk', status: ApiKeyStatus.ACTIVE, createdAt: new Date() });
      (prisma.apiKey.update as jest.Mock).mockResolvedValue({});

      await service.rotateKey('k1', 'actor1');

      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'k1' },
          data: expect.objectContaining({ status: ApiKeyStatus.ROTATING }),
        }),
      );
    });

    it('throws if key is not ACTIVE', async () => {
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue({
        id: 'k1',
        status: ApiKeyStatus.REVOKED,
      });

      await expect(service.rotateKey('k1', 'actor1')).rejects.toThrow();
    });

    it('throws if key not found', async () => {
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.rotateKey('k1', 'actor1')).rejects.toThrow('not found');
    });
  });

  // ── Revocation ────────────────────────────────────────────────────────────

  describe('revokeKey', () => {
    it('sets status to REVOKED', async () => {
      const key = { id: 'k1', userId: 'u1', keyHash: 'h1', status: ApiKeyStatus.ACTIVE };
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(key);
      (prisma.apiKey.update as jest.Mock).mockResolvedValue({});

      await service.revokeKey('k1', 'actor1');

      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ApiKeyStatus.REVOKED }),
        }),
      );
    });

    it('invalidates Redis cache on revoke', async () => {
      const key = { id: 'k1', userId: 'u1', keyHash: 'testhash', status: ApiKeyStatus.ACTIVE };
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(key);
      (prisma.apiKey.update as jest.Mock).mockResolvedValue({});

      await service.revokeKey('k1', 'actor1');

      expect(redis.del).toHaveBeenCalledWith('apikey:hash:testhash');
    });
  });

  // ── revokeAll ─────────────────────────────────────────────────────────────

  describe('revokeAllUserKeys', () => {
    it('targets all ACTIVE and ROTATING keys', async () => {
      const keys = [
        { id: 'k1', userId: 'u1', keyHash: 'h1', status: ApiKeyStatus.ACTIVE },
        { id: 'k2', userId: 'u1', keyHash: 'h2', status: ApiKeyStatus.ROTATING },
      ];
      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue(keys);
      (prisma.apiKey.findUnique as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(keys.find((k) => k.id === where.id)),
      );
      (prisma.apiKey.update as jest.Mock).mockResolvedValue({});

      const count = await service.revokeAllUserKeys('u1', 'actor1');

      expect(count).toBe(2);
      expect(prisma.apiKey.update).toHaveBeenCalledTimes(2);
    });
  });

  // ── validateKey ───────────────────────────────────────────────────────────

  describe('validateKey', () => {
    it('returns null for unknown key', async () => {
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await service.validateKey('aihub_prod_unknown');
      expect(result).toBeNull();
    });

    it('returns null for revoked key', async () => {
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue({
        id: 'k1',
        status: ApiKeyStatus.REVOKED,
        keyHash: 'h1',
      });
      const result = await service.validateKey('aihub_prod_somekey');
      expect(result).toBeNull();
    });

    it('returns key for active key', async () => {
      const activeKey = { id: 'k1', status: ApiKeyStatus.ACTIVE, keyHash: 'h1' };
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(activeKey);

      const result = await service.validateKey('aihub_prod_somekey');
      expect(result).toMatchObject({ id: 'k1', status: ApiKeyStatus.ACTIVE });
    });
  });
});
