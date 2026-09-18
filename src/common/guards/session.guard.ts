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
import {
  DAY_IN_MS,
  SESSION_IDLE_TTL_DAYS,
} from '../constants/session.constants.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import {
  extractBearerToken,
  hashSessionToken,
} from '../utils/session-token.utils.js';

export type AuthenticatedUser = Omit<User, 'passwordHash'>;

declare global {
  namespace Express {
    interface Request {
      user: AuthenticatedUser;
      sessionId: number;
    }
  }
}

const NOT_AUTHENTICATED_MESSAGE = 'No autenticado';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) { }

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

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });

    const now = new Date();
    const idleCutoff = new Date(
      now.getTime() - SESSION_IDLE_TTL_DAYS * DAY_IN_MS,
    );

    if (
      !session ||
      session.expiresAt < now ||
      (session.lastUsedAt && session.lastUsedAt < idleCutoff)
    ) {
      throw new UnauthorizedException(NOT_AUTHENTICATED_MESSAGE);
    }

    if (!session.user.isActive) {
      throw new ForbiddenException('Tu cuenta está inactiva');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: now },
    });

    const { passwordHash: _passwordHash, ...user } = session.user;
    request.user = user;
    request.sessionId = session.id;

    return true;
  }
}
