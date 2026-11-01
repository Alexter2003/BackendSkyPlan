import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../decorators/allow-pending-password-change.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { extractBearerToken } from '../utils/session-token.utils.js';
import {
  NOT_AUTHENTICATED_MESSAGE,
  resolveSession,
} from '../utils/session-validation.utils.js';

export const PASSWORD_CHANGE_REQUIRED_MESSAGE =
  'Debes cambiar tu contraseña antes de continuar';

export type AuthenticatedUser = Omit<User, 'passwordHash'>;

declare global {
  namespace Express {
    interface Request {
      user: AuthenticatedUser;
      sessionId: number;
    }
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException(NOT_AUTHENTICATED_MESSAGE);
    }

    const { user, sessionId } = await resolveSession(this.prisma, token);

    // Con una contraseña temporal vigente solo se permiten las rutas
    // marcadas explícitamente; el resto queda bloqueado por defecto.
    if (user.mustChangePassword) {
      const allowedWhilePending = this.reflector.getAllAndOverride<boolean>(
        ALLOW_PENDING_PASSWORD_CHANGE_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!allowedWhilePending) {
        throw new ForbiddenException(PASSWORD_CHANGE_REQUIRED_MESSAGE);
      }
    }

    request.user = user;
    request.sessionId = sessionId;

    return true;
  }
}
