import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { AuthService } from '../../../src/modules/auth/auth.service.js';
import { hashSessionToken } from '../../../src/common/utils/session-token.utils.js';
import type { LoginDto } from '../../../src/modules/auth/dto/login.dto.js';

// bcrypt's ESM namespace isn't configurable, so `vi.spyOn(bcrypt, 'hash')`
// can't redefine it directly — wrap the module instead, keeping the real
// implementation but exposing a spy-able `hash`.
vi.mock('bcrypt', async (importOriginal) => {
  const actual = await importOriginal<typeof bcrypt>();
  return { ...actual, hash: vi.fn(actual.hash) };
});

type PrismaMock = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  session: {
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

function createPrismaMock(): PrismaMock {
  const mock: PrismaMock = {
    user: {
      findUnique: vi.fn(),
    },
    session: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  };

  // Transactions run against the same mocked client — the callback receives
  // `mock` itself, mirroring how Prisma passes a transaction client through.
  mock.$transaction.mockImplementation(
    async (callback: (tx: PrismaMock) => unknown) => callback(mock),
  );

  return mock;
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;

  const plainPassword = 'Passw0rd!';
  let passwordHash: string;

  const baseUser = {
    id: 1,
    email: 'test@skyplan.dev',
    username: 'testuser',
    emailConfirmed: true,
    isActive: true,
    mustChangePassword: false,
    tempPasswordExpiresAt: null as Date | null,
    createdAt: new Date('2026-09-15T00:00:00Z'),
    updatedAt: new Date('2026-09-15T00:00:00Z'),
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(plainPassword, 4);
  });

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue(4) },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    const dto: LoginDto = { identifier: 'testuser', password: plainPassword };

    it('logs in with the username and returns a token not stored in plaintext', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      const result = await service.login(dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      });
      expect(result.data.token).toMatch(/^[a-f0-9]{64}$/);

      const createdData = prisma.session.create.mock.calls[0][0].data;
      expect(createdData.tokenHash).toBe(hashSessionToken(result.data.token));
      expect(createdData.tokenHash).not.toBe(result.data.token);
    });

    it('logs in with the email', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      await service.login({
        identifier: 'test@skyplan.dev',
        password: plainPassword,
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@skyplan.dev' },
      });
    });

    it('never exposes passwordHash in the response', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      const result = await service.login(dto);

      expect(result.data.user).not.toHaveProperty('passwordHash');
    });

    it('rejects an unknown identifier and a wrong password with the exact same error', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unknownUserError = await service
        .login(dto)
        .catch((error: unknown) => error);

      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
      const wrongPasswordError = await service
        .login({ ...dto, password: 'wrong' })
        .catch((error: unknown) => error);

      expect(unknownUserError).toBeInstanceOf(UnauthorizedException);
      expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
      expect((unknownUserError as UnauthorizedException).getResponse()).toEqual(
        (wrongPasswordError as UnauthorizedException).getResponse(),
      );
    });

    it('still hashes the password when the user does not exist, to avoid a timing oracle', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 4);
    });

    it('rejects an inactive account after the password already matched', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        passwordHash,
        isActive: false,
      });

      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects an account with an unconfirmed email', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        passwordHash,
        emailConfirmed: false,
      });

      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('surfaces mustChangePassword in the response instead of blocking the login', async () => {
      // El login nunca bloquea por una contraseña temporal, esté o no
      // vencida: solo informa el flag para que el cliente decida. Forzar el
      // cambio de contraseña es responsabilidad de un futuro guard +
      // endpoint de cambio de contraseña (ver requirements-compliance).
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        passwordHash,
        mustChangePassword: true,
        tempPasswordExpiresAt: new Date(Date.now() - 1000),
      });

      const result = await service.login(dto);

      expect(result.data.mustChangePassword).toBe(true);
    });

    it("purges the user's dead sessions before creating the new one", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      await service.login(dto);

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: baseUser.id,
          OR: [
            { expiresAt: { lt: expect.any(Date) } },
            { lastUsedAt: { lt: expect.any(Date) } },
          ],
        },
      });
    });
  });

  describe('logout', () => {
    // SessionGuard ya resolvió la sesión antes de llegar al service — logout
    // recibe directamente el id, no un header crudo.
    it('deletes the session by id', async () => {
      await service.logout(42);

      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { id: 42 },
      });
    });

    it('is idempotent when the session no longer exists', async () => {
      prisma.session.delete.mockRejectedValue(new Error('P2025'));

      const result = await service.logout(42);

      expect(result.status).toBe(200);
    });
  });
});
