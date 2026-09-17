import { randomInt } from 'node:crypto';
import type { Prisma, User } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { UserPublic } from './interfaces/user-public.interface.js';

const CONFIRMATION_CODE_LENGTH = 5;
const CONFIRMATION_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateConfirmationCode(): string {
  let code = '';
  for (let i = 0; i < CONFIRMATION_CODE_LENGTH; i++) {
    code +=
      CONFIRMATION_CODE_ALPHABET[randomInt(CONFIRMATION_CODE_ALPHABET.length)];
  }
  return code;
}

export function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    emailConfirmed: user.emailConfirmed,
    createdAt: user.createdAt,
  };
}

// Invalida cualquier confirmación aún activa de este usuario y emite una
// nueva. Compartida entre el registro y el reenvío, para que ambos sigan
// las mismas reglas de expiración y código único activo.
export async function issueConfirmationCode(
  tx: Prisma.TransactionClient | PrismaService,
  userId: number,
  ttlMinutes: number,
): Promise<{ code: string; expiresAt: Date }> {
  await tx.emailConfirmation.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const code = generateConfirmationCode();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await tx.emailConfirmation.create({
    data: { userId, code, expiresAt },
  });

  return { code, expiresAt };
}
