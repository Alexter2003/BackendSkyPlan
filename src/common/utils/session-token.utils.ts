import { createHash } from 'node:crypto';

const BEARER_PREFIX = 'Bearer ';

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function extractBearerToken(
  authorization: string | undefined,
): string | null {
  if (!authorization?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = authorization.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}
