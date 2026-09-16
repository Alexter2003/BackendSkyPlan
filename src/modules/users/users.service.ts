import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { MAIL_PORT } from '../mail/interfaces/mail-port.interface.js';
import type { MailPort } from '../mail/interfaces/mail-port.interface.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UserPublic } from './interfaces/user-public.interface.js';

const DEFAULT_BCRYPT_SALT_ROUNDS = 12;

function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    emailConfirmed: user.emailConfirmed,
    createdAt: user.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(MAIL_PORT) private readonly mail: MailPort,
  ) {}

  async create(dto: CreateUserDto): Promise<ServiceResponse<UserPublic>> {
    const saltRounds =
      this.config.get<number>('BCRYPT_SALT_ROUNDS') ??
      DEFAULT_BCRYPT_SALT_ROUNDS;

    const confirmationCode = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        confirmationCode,
        emailConfirmed: false,
      },
    });

    await this.mail.sendConfirmationEmail({
      to: user.email,
      username: user.username,
      confirmationCode,
    });

    return {
      status: HttpStatus.CREATED,
      message: 'User registered successfully',
      data: toUserPublic(user),
    };
  }
}
