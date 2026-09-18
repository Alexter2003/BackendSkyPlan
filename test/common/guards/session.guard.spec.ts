import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { SessionGuard } from '../../../src/common/guards/session.guard.js';
import { Public } from '../../../src/common/decorators/public.decorator.js';
import { hashSessionToken } from '../../../src/common/utils/session-token.utils.js';

type PrismaMock = {
  session: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

// Clase de prueba real para que Reflector lea metadata de @Public() tal
// como lo haría con un controller de verdad — no tiene sentido mockear
// Reflector cuando probar el decorador de esta forma es igual de simple.
class DummyController {
  @Public()
  publicRoute(): void {}

  protectedRoute(): void {}
}

function createContext(request: {
  headers: Record<string, string | undefined>;
  user?: unknown;
  sessionId?: unknown;
}): { context: ExecutionContext; request: typeof request } {
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getHandler: () => DummyController.prototype.protectedRoute,
    getClass: () => DummyController,
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('SessionGuard', () => {
  let guard: SessionGuard;
  let prisma: PrismaMock;

  const now = new Date('2026-09-17T12:00:00Z');
  const baseUser = {
    id: 1,
    email: 'test@skyplan.dev',
    username: 'testuser',
    passwordHash: 'hashed',
    emailConfirmed: true,
    isActive: true,
    mustChangePassword: false,
    tempPasswordExpiresAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const baseSession = {
    id: 7,
    userId: baseUser.id,
    tokenHash: hashSessionToken('valid-token'),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    lastUsedAt: now,
    createdAt: now,
    updatedAt: now,
    user: baseUser,
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    prisma = {
      session: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionGuard,
        Reflector,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    guard = module.get<SessionGuard>(SessionGuard);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows a public route without touching Prisma', async () => {
    const { context } = createContext({ headers: {} });
    vi.spyOn(context, 'getHandler').mockReturnValue(
      DummyController.prototype.publicRoute,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when the Authorization header is missing', async () => {
    const { context } = createContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token that matches no session', async () => {
    prisma.session.findUnique.mockResolvedValue(null);
    const { context } = createContext({
      headers: { authorization: 'Bearer valid-token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired session', async () => {
    prisma.session.findUnique.mockResolvedValue({
      ...baseSession,
      expiresAt: new Date(now.getTime() - 1000),
    });
    const { context } = createContext({
      headers: { authorization: 'Bearer valid-token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a session idle for more than 7 days', async () => {
    prisma.session.findUnique.mockResolvedValue({
      ...baseSession,
      lastUsedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
    });
    const { context } = createContext({
      headers: { authorization: 'Bearer valid-token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an inactive account with 403', async () => {
    prisma.session.findUnique.mockResolvedValue({
      ...baseSession,
      user: { ...baseUser, isActive: false },
    });
    const { context } = createContext({
      headers: { authorization: 'Bearer valid-token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('attaches user (without passwordHash) and sessionId, and refreshes lastUsedAt', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    const { context, request } = createContext({
      headers: { authorization: 'Bearer valid-token' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.user).not.toHaveProperty('passwordHash');
    expect(request.user).toMatchObject({ id: baseUser.id });
    expect(request.sessionId).toBe(baseSession.id);
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: baseSession.id },
      data: { lastUsedAt: now },
    });
  });
});
