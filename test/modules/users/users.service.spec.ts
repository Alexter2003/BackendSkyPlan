import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  MAIL_PORT,
  MailPort,
} from '../../../src/modules/mail/interfaces/mail-port.interface.js';
import { UsersService } from '../../../src/modules/users/users.service.js';
import type { CreateUserDto } from '../../../src/modules/users/dto/create-user.dto.js';
import type { ConfirmEmailDto } from '../../../src/modules/users/dto/confirm-email.dto.js';
import type { ResendConfirmationDto } from '../../../src/modules/users/dto/resend-confirmation.dto.js';

type PrismaMock = {
  user: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  emailConfirmation: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

function createPrismaMock(): PrismaMock {
  const mock: PrismaMock = {
    user: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    emailConfirmation: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn(),
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

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaMock;
  let mail: MailPort;

  const input: CreateUserDto = {
    email: 'test@skyplan.dev',
    username: 'testuser',
    password: 'Passw0rd!',
    passwordConfirmation: 'Passw0rd!',
  };

  const createdUser = {
    id: 1,
    email: input.email,
    username: input.username,
    passwordHash: 'hashed',
    emailConfirmed: false,
    mustChangePassword: false,
    tempPasswordExpiresAt: null,
    createdAt: new Date('2026-09-15T00:00:00Z'),
    updatedAt: new Date('2026-09-15T00:00:00Z'),
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.user.create.mockResolvedValue(createdUser);
    prisma.emailConfirmation.create.mockResolvedValue({
      id: 1,
      userId: createdUser.id,
      code: 'ABCDE',
      expiresAt: new Date('2026-09-15T00:30:00Z'),
      usedAt: null,
      attempts: 0,
    });
    mail = { sendConfirmationEmail: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue(4) },
        },
        { provide: MAIL_PORT, useValue: mail },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    it('creates the user with emailConfirmed false, without a confirmationCode column', async () => {
      await service.create(input);

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.emailConfirmed).toBe(false);
      expect(data).not.toHaveProperty('confirmationCode');
    });

    it('issues a 5-char uppercase alphanumeric EmailConfirmation for the new user', async () => {
      await service.create(input);

      const data = prisma.emailConfirmation.create.mock.calls[0][0].data;
      expect(data.userId).toBe(createdUser.id);
      expect(data.code).toMatch(/^[A-Z0-9]{5}$/);
      expect(data.expiresAt).toBeInstanceOf(Date);
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('hashes the password before persisting it', async () => {
      await service.create(input);

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.passwordHash).not.toBe(input.password);
      await expect(
        bcrypt.compare(input.password, data.passwordHash),
      ).resolves.toBe(true);
    });

    it('returns a success envelope without exposing passwordHash or confirmationCode', async () => {
      const result = await service.create(input);

      expect(result.status).toBe(HttpStatus.CREATED);
      expect(result.message).toEqual(expect.any(String));
      expect(result.data).not.toHaveProperty('passwordHash');
      expect(result.data).not.toHaveProperty('confirmationCode');
      expect(result.data).toEqual({
        id: createdUser.id,
        email: createdUser.email,
        username: createdUser.username,
        emailConfirmed: createdUser.emailConfirmed,
        createdAt: createdUser.createdAt,
      });
    });

    it('sends a confirmation email once with the user email and a 30-minute expiration', async () => {
      await service.create(input);

      expect(mail.sendConfirmationEmail).toHaveBeenCalledTimes(1);
      expect(mail.sendConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: input.email,
          username: input.username,
          expiresInMinutes: 30,
        }),
      );
    });

    it('still returns a success envelope when sending the confirmation email fails', async () => {
      (
        mail.sendConfirmationEmail as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('Resend failed to send confirmation email: invalid API key'),
      );

      const result = await service.create(input);

      expect(result.status).toBe(HttpStatus.CREATED);
      expect(result.data.id).toBe(createdUser.id);
    });
  });

  describe('confirmEmail', () => {
    const dto: ConfirmEmailDto = { email: input.email, code: 'ABCDE' };

    const activeConfirmation = {
      id: 1,
      userId: createdUser.id,
      code: 'ABCDE',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      usedAt: null,
      attempts: 0,
    };

    it('confirms the email, marks the code used and returns the updated user', async () => {
      prisma.user.findUnique.mockResolvedValue(createdUser);
      prisma.emailConfirmation.findFirst.mockResolvedValue(activeConfirmation);
      prisma.user.update.mockResolvedValue({
        ...createdUser,
        emailConfirmed: true,
      });

      const result = await service.confirmEmail(dto);

      expect(prisma.emailConfirmation.update).toHaveBeenCalledWith({
        where: { id: activeConfirmation.id },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: createdUser.id },
        data: { emailConfirmed: true },
      });
      expect(result.status).toBe(HttpStatus.OK);
      expect(result.data.emailConfirmed).toBe(true);
    });

    it('rejects an unknown email with a generic message', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.confirmEmail(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when the email is already confirmed', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...createdUser,
        emailConfirmed: true,
      });

      await expect(service.confirmEmail(dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects when there is no active confirmation code', async () => {
      prisma.user.findUnique.mockResolvedValue(createdUser);
      prisma.emailConfirmation.findFirst.mockResolvedValue(null);

      await expect(service.confirmEmail(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an expired confirmation code', async () => {
      prisma.user.findUnique.mockResolvedValue(createdUser);
      prisma.emailConfirmation.findFirst.mockResolvedValue({
        ...activeConfirmation,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.confirmEmail(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('increments attempts and rejects on a wrong code', async () => {
      prisma.user.findUnique.mockResolvedValue(createdUser);
      prisma.emailConfirmation.findFirst.mockResolvedValue(activeConfirmation);

      await expect(
        service.confirmEmail({ ...dto, code: 'WRONG' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.emailConfirmation.update).toHaveBeenCalledWith({
        where: { id: activeConfirmation.id },
        data: { attempts: { increment: 1 } },
      });
    });

    it('rejects with 429 once attempts are exhausted', async () => {
      prisma.user.findUnique.mockResolvedValue(createdUser);
      prisma.emailConfirmation.findFirst.mockResolvedValue({
        ...activeConfirmation,
        attempts: 5,
      });

      await expect(service.confirmEmail(dto)).rejects.toThrow(HttpException);
      await expect(service.confirmEmail(dto)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });
  });

  describe('resendConfirmation', () => {
    const dto: ResendConfirmationDto = { email: input.email };

    it('issues a new code and invalidates the previous one for an existing, unconfirmed user', async () => {
      prisma.user.findUnique.mockResolvedValue(createdUser);

      const result = await service.resendConfirmation(dto);

      expect(prisma.emailConfirmation.updateMany).toHaveBeenCalledWith({
        where: { userId: createdUser.id, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.emailConfirmation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: createdUser.id }),
      });
      expect(mail.sendConfirmationEmail).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(HttpStatus.OK);
    });

    it('does not error and does not send an email for an unregistered address', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.resendConfirmation(dto);

      expect(mail.sendConfirmationEmail).not.toHaveBeenCalled();
      expect(prisma.emailConfirmation.create).not.toHaveBeenCalled();
      expect(result.status).toBe(HttpStatus.OK);
    });

    it('rejects when the email is already confirmed', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...createdUser,
        emailConfirmed: true,
      });

      await expect(service.resendConfirmation(dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
