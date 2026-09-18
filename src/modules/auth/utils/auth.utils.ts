import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';

const SESSION_TOKEN_BYTES = 32;

// 256 bits de entropía: por encima del mínimo de 128 que exige OWASP.
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('hex');
}

// '@' nunca aparece en un username (CreateUserDto lo prohíbe), así que el
// heurístico es seguro y permite findUnique en vez de un OR.
export function buildIdentifierWhere(
  identifier: string,
): Prisma.UserWhereUniqueInput {
  return identifier.includes('@')
    ? { email: identifier }
    : { username: identifier };
}
