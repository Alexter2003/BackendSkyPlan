import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { SessionGuard } from '../../../src/common/guards/session.guard.js';
import type { PrismaService } from '../../../src/prisma/prisma.service.js';
import { hashSessionToken } from '../../../src/common/utils/session-token.utils.js';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../../../src/common/decorators/allow-pending-password-change.decorator.js';
import { AuthController } from '../../../src/modules/auth/auth.controller.js';
import type { AuthService } from '../../../src/modules/auth/auth.service.js';
import { IS_PUBLIC_KEY } from '../../../src/common/decorators/public.decorator.js';

describe('AuthController', () => {
  const authService = {
    forgotPassword: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
  };
  const controller = new AuthController(authService as unknown as AuthService);

  describe('forgotPassword', () => {
    it('delegates to AuthService with the dto', async () => {
      const response = { status: 200, message: 'ok', data: null };
      authService.forgotPassword.mockResolvedValue(response);
      const dto = { email: 'test@skyplan.dev' };

      await expect(controller.forgotPassword(dto)).resolves.toBe(response);
      expect(authService.forgotPassword).toHaveBeenCalledWith(dto);
    });

    it('is public, so SessionGuard does not require a token', () => {
      expect(
        Reflect.getMetadata(
          IS_PUBLIC_KEY,
          AuthController.prototype.forgotPassword,
        ),
      ).toBe(true);
    });

    it('responds 200 instead of Nest default 201', () => {
      expect(
        Reflect.getMetadata(
          '__httpCode__',
          AuthController.prototype.forgotPassword,
        ),
      ).toBe(200);
    });
  });

  describe('changePassword', () => {
    it('passes the authenticated user, the session id and the dto to AuthService', async () => {
      const response = { status: 200, message: 'ok', data: null };
      authService.changePassword.mockResolvedValue(response);
      const user = { id: 1, mustChangePassword: true };
      const dto = {
        currentPassword: 'a',
        newPassword: 'b',
        confirmNewPassword: 'b',
      };

      await expect(
        controller.changePassword(
          user as never,
          { sessionId: 7 } as never,
          dto,
        ),
      ).resolves.toBe(response);
      expect(authService.changePassword).toHaveBeenCalledWith(user, 7, dto);
    });

    it.each(['changePassword', 'logout'] as const)(
      '%s is allowed while a password change is pending',
      (handler) => {
        expect(
          Reflect.getMetadata(
            ALLOW_PENDING_PASSWORD_CHANGE_KEY,
            AuthController.prototype[handler],
          ),
        ).toBe(true);
      },
    );

    it('login is not marked as allowed while pending (it is public instead)', () => {
      expect(
        Reflect.getMetadata(
          ALLOW_PENDING_PASSWORD_CHANGE_KEY,
          AuthController.prototype.login,
        ),
      ).toBeUndefined();
    });
  });

  describe('SessionGuard with the real controller handlers', () => {
    const now = new Date();
    const pendingSession = {
      id: 3,
      userId: 1,
      tokenHash: hashSessionToken('tok'),
      expiresAt: new Date(now.getTime() + 60_000),
      lastUsedAt: now,
      user: {
        id: 1,
        isActive: true,
        mustChangePassword: true,
        passwordHash: 'x',
      },
    };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(pendingSession),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const guard = new SessionGuard(
      prisma as unknown as PrismaService,
      new Reflector(),
    );

    function contextFor(
      handler: (...args: never[]) => unknown,
    ): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization: 'Bearer tok' } }),
        }),
        getHandler: () => handler,
        getClass: () => AuthController,
      } as unknown as ExecutionContext;
    }

    it('lets a user with a pending change reach change-password and logout', async () => {
      await expect(
        guard.canActivate(contextFor(AuthController.prototype.changePassword)),
      ).resolves.toBe(true);
      await expect(
        guard.canActivate(contextFor(AuthController.prototype.logout)),
      ).resolves.toBe(true);
    });

    it('blocks the same user on a route without the decorator', async () => {
      await expect(
        guard.canActivate(contextFor(() => undefined)),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
