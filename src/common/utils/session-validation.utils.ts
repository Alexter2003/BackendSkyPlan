import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import {
  DAY_IN_MS,
  SESSION_IDLE_TTL_DAYS,
} from '../constants/session.constants.js';
import type { AuthenticatedUser } from '../guards/session.guard.js';
import { hashSessionToken } from './session-token.utils.js';

export const NOT_AUTHENTICATED_MESSAGE = 'No autenticado';

export interface ResolvedSession {
  user: AuthenticatedUser;
  sessionId: number;
}

// Valida un token de sesión (existe, no expiró, no está inactiva y la cuenta
// está activa) y registra su uso. Compartido por SessionGuard (HTTP) y por el
// gateway de notificaciones (WebSocket) para que ambos apliquen la misma regla.
export async function resolveSession(
  prisma: PrismaService,
  token: string,
): Promise<ResolvedSession> {
  const session = await prisma.session.findUnique({
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

  await prisma.session.update({
    where: { id: session.id },
    data: { lastUsedAt: now },
  });

  const { passwordHash: _passwordHash, ...user } = session.user;

  return { user, sessionId: session.id };
}
