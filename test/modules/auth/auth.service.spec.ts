import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { AuthService } from '../../../src/modules/auth/auth.service.js';
import { hashSessionToken } from '../../../src/common/utils/session-token.utils.js';
import type { LoginDto } from '../../../src/modules/auth/dto/login.dto.js';
import { MAIL_PORT } from '../../../src/modules/mail/interfaces/mail-port.interface.js';
import type { MailPort } from '../../../src/modules/mail/interfaces/mail-port.interface.js';

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
    updateMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
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
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
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
  let mail: { sendTemporaryPasswordEmail: ReturnType<typeof vi.fn> };

  const plainPassword = 'Passw0rd!';
  let passwordHash: string;

  const baseUser = {
    id: 1,
    email: 'test@skyplan.dev',
    username: 'testuser',
    firstName: null as string | null,
    lastName: null as string | null,
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
    mail = { sendTemporaryPasswordEmail: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue(4) },
        },
        { provide: MAIL_PORT, useValue: mail as unknown as MailPort },
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

  describe('forgotPassword', () => {
    const dto = { email: 'test@skyplan.dev' };
    const GENERIC_MESSAGE =
      'Si el correo está registrado, enviamos una contraseña temporal';

    const flushMail = () => new Promise((resolve) => setImmediate(resolve));

    beforeEach(() => {
      vi.mocked(bcrypt.hash).mockClear();
    });

    it('issues a temporary password for an active, confirmed account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      const result = await service.forgotPassword(dto);
      await flushMail();

      expect(result.message).toBe(GENERIC_MESSAGE);
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
      const call = prisma.user.updateMany.mock.calls[0][0];
      expect(call.where).toMatchObject({
        id: baseUser.id,
        isActive: true,
        emailConfirmed: true,
      });
      expect(call.data.mustChangePassword).toBe(true);
      expect(call.data.tempPasswordExpiresAt.getTime()).toBeGreaterThan(
        Date.now() + 29 * 60 * 1000,
      );
      expect(call.data.passwordHash).not.toBe(passwordHash);
    });

    it('emails the same temporary password it hashed, with a 30-minute expiration', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      await service.forgotPassword(dto);
      await flushMail();

      const payload = mail.sendTemporaryPasswordEmail.mock.calls[0][0];
      expect(payload).toMatchObject({
        to: baseUser.email,
        username: baseUser.username,
        expiresInMinutes: 30,
      });
      const { passwordHash: storedHash } =
        prisma.user.updateMany.mock.calls[0][0].data;
      await expect(
        bcrypt.compare(payload.temporaryPassword, storedHash),
      ).resolves.toBe(true);
      expect(payload.temporaryPassword).toMatch(
        /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      );
    });

    it('sets the cooldown condition in the update so a repeat inside 5 minutes matches nothing', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      await service.forgotPassword(dto);

      const { OR } = prisma.user.updateMany.mock.calls[0][0].where;
      expect(OR).toContainEqual({ tempPasswordExpiresAt: null });
      const lte = OR.find(
        (clause: { tempPasswordExpiresAt: unknown }) =>
          clause.tempPasswordExpiresAt !== null,
      ).tempPasswordExpiresAt.lte as Date;
      const minutesAhead = (lte.getTime() - Date.now()) / 60000;
      expect(minutesAhead).toBeGreaterThan(24.9);
      expect(minutesAhead).toBeLessThanOrEqual(25);
    });

    it('does not send mail when the update matched nothing (cooldown, inactive or unconfirmed)', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.forgotPassword(dto);
      await flushMail();

      expect(result.message).toBe(GENERIC_MESSAGE);
      expect(mail.sendTemporaryPasswordEmail).not.toHaveBeenCalled();
    });

    it('answers identically and sends nothing for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
      const known = await service.forgotPassword(dto);

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.updateMany.mockClear();
      mail.sendTemporaryPasswordEmail.mockClear();
      const unknown = await service.forgotPassword(dto);
      await flushMail();

      expect(unknown).toEqual(known);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(mail.sendTemporaryPasswordEmail).not.toHaveBeenCalled();
    });

    it.each([
      ['unknown email', null],
      ['existing account', { ...baseUser }],
    ])('runs exactly one bcrypt.hash for %s', async (_label, user) => {
      prisma.user.findUnique.mockResolvedValue(user);

      await service.forgotPassword(dto);

      expect(bcrypt.hash).toHaveBeenCalledTimes(1);
    });

    it('still responds 200 and logs when the mail provider fails', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
      mail.sendTemporaryPasswordEmail.mockRejectedValue(new Error('boom'));
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const result = await service.forgotPassword(dto);
      await flushMail();

      expect(result.status).toBe(200);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
      warn.mockRestore();
    });

    it('does not wait for the mail provider before responding', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
      mail.sendTemporaryPasswordEmail.mockReturnValue(new Promise(() => {}));

      await expect(service.forgotPassword(dto)).resolves.toMatchObject({
        status: 200,
      });
    });
  });

  describe('changePassword', () => {
    const pendingUser = { ...baseUser, mustChangePassword: true };
    const sessionId = 9;
    const dto = {
      currentPassword: plainPassword,
      newPassword: 'NewPassw0rd!',
      confirmNewPassword: 'NewPassw0rd!',
    };
    const { passwordHash: _omit, ...authUser } = {
      ...pendingUser,
      passwordHash: '',
    };

    function mockStoredUser(overrides: Record<string, unknown> = {}) {
      prisma.user.findUnique.mockResolvedValue({
        ...pendingUser,
        passwordHash,
        ...overrides,
      });
    }

    it('stores the new hash, clears the flags and keeps only the current session', async () => {
      mockStoredUser({
        tempPasswordExpiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.changePassword(authUser, sessionId, dto);

      expect(result.status).toBe(200);
      const update = prisma.user.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: baseUser.id });
      expect(update.data).toMatchObject({
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
      });
      await expect(
        bcrypt.compare(dto.newPassword, update.data.passwordHash),
      ).resolves.toBe(true);
      expect(update.data.passwordHash).not.toBe(dto.newPassword);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: baseUser.id, id: { not: sessionId } },
      });
    });

    it('runs the update and the session cleanup in one transaction', async () => {
      mockStoredUser();

      await service.changePassword(authUser, sessionId, dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does not change anything when the transaction fails', async () => {
      mockStoredUser();
      prisma.$transaction.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.changePassword(authUser, sessionId, dto),
      ).rejects.toThrow('db down');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects with 403 when the user has no pending change', async () => {
      await expect(
        service.changePassword(
          { ...authUser, mustChangePassword: false },
          sessionId,
          dto,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects with 403 when the stored user no longer has a pending change', async () => {
      mockStoredUser({ mustChangePassword: false });

      await expect(
        service.changePassword(authUser, sessionId, dto),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects with 403 and asks for a new one when the temporary password expired', async () => {
      mockStoredUser({ tempPasswordExpiresAt: new Date(Date.now() - 1000) });

      const error = await service
        .changePassword(authUser, sessionId, dto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).message).toMatch(/expiró/);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects with 400 when the current password is wrong', async () => {
      mockStoredUser();

      await expect(
        service.changePassword(authUser, sessionId, {
          ...dto,
          currentPassword: 'Wr0ngPassword',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects with 400 when the new password equals the current one', async () => {
      mockStoredUser();

      await expect(
        service.changePassword(authUser, sessionId, {
          currentPassword: plainPassword,
          newPassword: plainPassword,
          confirmNewPassword: plainPassword,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
