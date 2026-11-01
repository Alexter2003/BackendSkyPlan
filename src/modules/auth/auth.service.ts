import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import {
  DAY_IN_MS,
  SESSION_ABSOLUTE_TTL_DAYS,
  SESSION_IDLE_TTL_DAYS,
} from '../../common/constants/session.constants.js';
import { hashSessionToken } from '../../common/utils/session-token.utils.js';
import { MAIL_PORT } from '../mail/interfaces/mail-port.interface.js';
import type { MailPort } from '../mail/interfaces/mail-port.interface.js';
import { toUserPublic } from '../users/utils/users.utils.js';
import {
  MINUTE_IN_MS,
  TEMP_PASSWORD_COOLDOWN_MINUTES,
  TEMP_PASSWORD_TTL_MINUTES,
} from './constants/password-recovery.constants.js';
import type { AuthenticatedUser } from '../../common/guards/session.guard.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { LoginResult } from './interfaces/login-result.interface.js';
import {
  buildIdentifierWhere,
  generateSessionToken,
} from './utils/auth.utils.js';
import { generateTemporaryPassword } from './utils/temp-password.utils.js';

const DEFAULT_BCRYPT_SALT_ROUNDS = 12;

// Mismo mensaje para usuario inexistente y password incorrecto: distinguirlos
// convierte el endpoint en un enumerador de qué cuentas existen.
const INVALID_CREDENTIALS_MESSAGE = 'Credenciales inválidas';

// Misma respuesta para cualquier correo (existe, no existe, cuenta inactiva,
// sin confirmar o en cooldown): variar el mensaje revelaría qué correos
// están registrados.
const FORGOT_PASSWORD_MESSAGE =
  'Si el correo está registrado, enviamos una contraseña temporal';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(MAIL_PORT) private readonly mail: MailPort,
  ) {}

  async login(dto: LoginDto): Promise<ServiceResponse<LoginResult>> {
    const saltRounds =
      this.config.get<number>('BCRYPT_SALT_ROUNDS') ??
      DEFAULT_BCRYPT_SALT_ROUNDS;

    const user = await this.prisma.user.findUnique({
      where: buildIdentifierWhere(dto.identifier),
    });

    if (!user) {
      // Sin usuario no hay nada que comparar, pero hay que gastar el mismo
      // tiempo que un bcrypt.compare real: si no, el tiempo de respuesta
      // delata qué cuentas existen y el 401 genérico deja de servir de nada.
      await bcrypt.hash(dto.password, saltRounds);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // A partir de aquí el cliente ya probó ser dueño de la cuenta, así que
    // revelar el estado de la cuenta no filtra nada a un tercero.
    if (!user.isActive) {
      throw new ForbiddenException('Tu cuenta está inactiva');
    }

    if (!user.emailConfirmed) {
      throw new ForbiddenException(
        'Debes confirmar tu correo antes de iniciar sesión',
      );
    }

    // El login siempre se completa si las credenciales son válidas: no
    // bloquea ni valida la expiración de una contraseña temporal. Forzar el
    // cambio de contraseña es responsabilidad del futuro guard + endpoint de
    // cambio de contraseña, no del login — ver requirements-compliance.
    const { token, expiresAt } = await this.createSession(user.id);

    return {
      status: HttpStatus.OK,
      message: 'Sesión iniciada exitosamente',
      data: {
        token,
        expiresAt,
        mustChangePassword: user.mustChangePassword,
        user: toUserPublic(user),
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<ServiceResponse<null>> {
    const saltRounds =
      this.config.get<number>('BCRYPT_SALT_ROUNDS') ??
      DEFAULT_BCRYPT_SALT_ROUNDS;

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Se hace siempre exactamente un bcrypt.hash, exista o no la cuenta,
    // para que el tiempo de respuesta no delate qué correos están registrados.
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, saltRounds);

    if (user) {
      const now = Date.now();
      // La emisión anterior se deduce de la expiración (expiresAt - TTL): solo
      // se permite una nueva si ya pasó el cooldown. La condición va en el
      // updateMany para que dos solicitudes simultáneas no emitan dos temporales.
      const cooldownLimit = new Date(
        now +
          (TEMP_PASSWORD_TTL_MINUTES - TEMP_PASSWORD_COOLDOWN_MINUTES) *
            MINUTE_IN_MS,
      );

      const { count } = await this.prisma.user.updateMany({
        where: {
          id: user.id,
          isActive: true,
          emailConfirmed: true,
          OR: [
            { tempPasswordExpiresAt: null },
            { tempPasswordExpiresAt: { lte: cooldownLimit } },
          ],
        },
        data: {
          passwordHash,
          mustChangePassword: true,
          tempPasswordExpiresAt: new Date(
            now + TEMP_PASSWORD_TTL_MINUTES * MINUTE_IN_MS,
          ),
        },
      });

      if (count === 1) {
        // Sin await: esperar al proveedor de correo haría la respuesta más
        // lenta solo para cuentas reales.
        void this.mail
          .sendTemporaryPasswordEmail({
            to: user.email,
            username: user.username,
            temporaryPassword,
            expiresInMinutes: TEMP_PASSWORD_TTL_MINUTES,
          })
          .catch((error: Error) => {
            this.logger.warn(
              `Failed to send temporary password email to ${user.email}: ${error.message}`,
            );
          });
      }
    }

    return {
      status: HttpStatus.OK,
      message: FORGOT_PASSWORD_MESSAGE,
      data: null,
    };
  }

  async changePassword(
    authUser: AuthenticatedUser,
    sessionId: number,
    dto: ChangePasswordDto,
  ): Promise<ServiceResponse<null>> {
    // Solo existe para completar el flujo forzado de la contraseña temporal;
    // con la sesión normal no hay nada que cambiar por esta vía.
    if (!authUser.mustChangePassword) {
      throw new ForbiddenException(
        'No tienes un cambio de contraseña pendiente',
      );
    }

    // La fila se relee porque request.user no trae passwordHash.
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.id },
    });

    if (!user || !user.mustChangePassword) {
      throw new ForbiddenException(
        'No tienes un cambio de contraseña pendiente',
      );
    }

    if (user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()) {
      throw new ForbiddenException(
        'La contraseña temporal expiró. Cierra sesión y solicita una nueva',
      );
    }

    const currentMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!currentMatches) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta de la actual',
      );
    }

    const saltRounds =
      this.config.get<number>('BCRYPT_SALT_ROUNDS') ??
      DEFAULT_BCRYPT_SALT_ROUNDS;
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    // Contraseña y cierre de las demás sesiones van juntos: si falla uno, no
    // queda un estado a medias (clave nueva con sesiones viejas vivas).
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          tempPasswordExpiresAt: null,
        },
      });
      await tx.session.deleteMany({
        where: { userId: user.id, id: { not: sessionId } },
      });
    });

    return {
      status: HttpStatus.OK,
      message: 'Contraseña actualizada exitosamente',
      data: null,
    };
  }

  private async createSession(
    userId: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = generateSessionToken();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + SESSION_ABSOLUTE_TTL_DAYS * DAY_IN_MS,
    );
    const idleCutoff = new Date(
      now.getTime() - SESSION_IDLE_TTL_DAYS * DAY_IN_MS,
    );

    await this.prisma.$transaction(async (tx) => {
      // Purga las sesiones muertas del usuario en cada login, para que la
      // tabla no crezca sin control (no hay cron en el proyecto).
      await tx.session.deleteMany({
        where: {
          userId,
          OR: [{ expiresAt: { lt: now } }, { lastUsedAt: { lt: idleCutoff } }],
        },
      });
      await tx.session.create({
        data: {
          userId,
          tokenHash: hashSessionToken(token),
          expiresAt,
          lastUsedAt: now,
        },
      });
    });

    return { token, expiresAt };
  }

  // SessionGuard ya resolvió la sesión antes de que la request llegue acá;
  // solo se necesita el id para borrarla, no el token crudo.
  async logout(sessionId: number): Promise<ServiceResponse<null>> {
    // Idempotente: se responde 200 aunque la fila ya no exista (sesión
    // vencida y purgada, logout duplicado).
    await this.prisma.session
      .delete({ where: { id: sessionId } })
      .catch(() => null);

    return {
      status: HttpStatus.OK,
      message: 'Sesión cerrada exitosamente',
      data: null,
    };
  }
}
