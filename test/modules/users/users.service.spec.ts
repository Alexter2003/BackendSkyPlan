import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  MAIL_PORT,
  MailPort,
} from '../../../src/modules/mail/interfaces/mail-port.interface.js';
import { UsersService } from '../../../src/modules/users/users.service.js';
import type { CreateUserDto } from '../../../src/modules/users/dto/create-user.dto.js';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: { user: { create: ReturnType<typeof vi.fn> } };
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
    confirmationCode: 'code',
    emailConfirmed: false,
    mustChangePassword: false,
    tempPasswordExpiresAt: null,
    createdAt: new Date('2026-09-15T00:00:00Z'),
    updatedAt: new Date('2026-09-15T00:00:00Z'),
  };

  beforeEach(async () => {
    prisma = { user: { create: vi.fn().mockResolvedValue(createdUser) } };
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

  it('creates the user with emailConfirmed false and a 5-char uppercase alphanumeric confirmationCode', async () => {
    await service.create(input);

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.emailConfirmed).toBe(false);
    expect(data.confirmationCode).toMatch(/^[A-Z0-9]{5}$/);
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

  it('sends a confirmation email once with the user email', async () => {
    await service.create(input);

    expect(mail.sendConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: input.email, username: input.username }),
    );
  });

  it('still returns a success envelope when sending the confirmation email fails', async () => {
    (mail.sendConfirmationEmail as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Resend failed to send confirmation email: invalid API key'),
    );

    const result = await service.create(input);

    expect(result.status).toBe(HttpStatus.CREATED);
    expect(result.data.id).toBe(createdUser.id);
  });
});
