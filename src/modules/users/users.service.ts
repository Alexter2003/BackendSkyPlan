import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { MAIL_PORT } from '../mail/interfaces/mail-port.interface.js';
import type { MailPort } from '../mail/interfaces/mail-port.interface.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { ConfirmEmailDto } from './dto/confirm-email.dto.js';
import type { ResendConfirmationDto } from './dto/resend-confirmation.dto.js';
import type { UserPublic } from './interfaces/user-public.interface.js';
import { issueConfirmationCode, toUserPublic } from './utils/users.utils.js';

const DEFAULT_BCRYPT_SALT_ROUNDS = 12;
const CONFIRMATION_CODE_TTL_MINUTES = 30;
const MAX_CONFIRMATION_ATTEMPTS = 5;

// Mensaje genérico para cualquier fallo (usuario inexistente, sin código,
// código expirado, código incorrecto): nunca revelar *por qué* falló, o este
// endpoint se convierte en un oráculo de qué correos están registrados.
const INVALID_OR_EXPIRED_CODE_MESSAGE =
  'Código de confirmación inválido o expirado';

// Traduce las columnas de la restricción única violada (User.email,
// User.username) a algo legible para el cliente de la API.
const UNIQUE_FIELD_LABELS: Record<string, string> = {
  email: 'correo',
  username: 'nombre de usuario',
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(MAIL_PORT) private readonly mail: MailPort,
  ) {}

  async create(dto: CreateUserDto): Promise<ServiceResponse<UserPublic>> {
    const saltRounds =
      this.config.get<number>('BCRYPT_SALT_ROUNDS') ??
      DEFAULT_BCRYPT_SALT_ROUNDS;

    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const { user, confirmationCode } = await this.createUserRecord(
      dto,
      passwordHash,
    );

    try {
      await this.mail.sendConfirmationEmail({
        to: user.email,
        username: user.username,
        confirmationCode,
        expiresInMinutes: CONFIRMATION_CODE_TTL_MINUTES,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send confirmation email to ${user.email}: ${(error as Error).message}`,
      );
    }

    return {
      status: HttpStatus.CREATED,
      message: 'Usuario registrado exitosamente',
      data: toUserPublic(user),
    };
  }

  private async createUserRecord(
    dto: CreateUserDto,
    passwordHash: string,
  ): Promise<{ user: User; confirmationCode: string }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            username: dto.username,
            passwordHash,
            emailConfirmed: false,
          },
        });
        const { code } = await issueConfirmationCode(
          tx,
          user.id,
          CONFIRMATION_CODE_TTL_MINUTES,
        );
        return { user, confirmationCode: code };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        const fields = Array.isArray(target) ? target : [];
        const labels = fields.map(
          (field) => UNIQUE_FIELD_LABELS[field] ?? field,
        );
        throw new ConflictException(
          `Ya existe un usuario registrado con ese ${
            labels.join(', ') || 'correo o nombre de usuario'
          }`,
        );
      }
      throw error;
    }
  }

  async confirmEmail(
    dto: ConfirmEmailDto,
  ): Promise<ServiceResponse<UserPublic>> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new BadRequestException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    if (user.emailConfirmed) {
      throw new ConflictException('El correo ya está confirmado');
    }

    const activeConfirmation = await this.prisma.emailConfirmation.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeConfirmation || activeConfirmation.expiresAt < new Date()) {
      throw new BadRequestException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    if (activeConfirmation.attempts >= MAX_CONFIRMATION_ATTEMPTS) {
      throw new HttpException(
        'Demasiados intentos fallidos. Solicita un nuevo código de confirmación.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (activeConfirmation.code !== dto.code) {
      await this.prisma.emailConfirmation.update({
        where: { id: activeConfirmation.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    const confirmedUser = await this.prisma.$transaction(async (tx) => {
      await tx.emailConfirmation.update({
        where: { id: activeConfirmation.id },
        data: { usedAt: new Date() },
      });
      return tx.user.update({
        where: { id: user.id },
        data: { emailConfirmed: true },
      });
    });

    return {
      status: HttpStatus.OK,
      message: 'Correo confirmado exitosamente',
      data: toUserPublic(confirmedUser),
    };
  }

  async resendConfirmation(
    dto: ResendConfirmationDto,
  ): Promise<ServiceResponse<{ email: string }>> {
    const genericResponse: ServiceResponse<{ email: string }> = {
      status: HttpStatus.OK,
      message:
        'Si el correo está registrado y aún no ha sido confirmado, se envió un nuevo código de confirmación',
      data: { email: dto.email },
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Misma respuesta que el camino exitoso: no revelar si el correo
      // está registrado.
      return genericResponse;
    }

    if (user.emailConfirmed) {
      throw new ConflictException('El correo ya está confirmado');
    }

    const { code } = await issueConfirmationCode(
      this.prisma,
      user.id,
      CONFIRMATION_CODE_TTL_MINUTES,
    );

    try {
      await this.mail.sendConfirmationEmail({
        to: user.email,
        username: user.username,
        confirmationCode: code,
        expiresInMinutes: CONFIRMATION_CODE_TTL_MINUTES,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send confirmation email to ${user.email}: ${(error as Error).message}`,
      );
    }

    return genericResponse;
  }
}
