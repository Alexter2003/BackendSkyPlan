import {
  ForbiddenException,
  HttpStatus,
  Injectable,
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
import { toUserPublic } from '../users/utils/users.utils.js';
import type { LoginDto } from './dto/login.dto.js';
import type { LoginResult } from './interfaces/login-result.interface.js';
import {
  buildIdentifierWhere,
  generateSessionToken,
} from './utils/auth.utils.js';

const DEFAULT_BCRYPT_SALT_ROUNDS = 12;

// Mismo mensaje para usuario inexistente y password incorrecto: distinguirlos
// convierte el endpoint en un enumerador de qué cuentas existen.
const INVALID_CREDENTIALS_MESSAGE = 'Credenciales inválidas';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
