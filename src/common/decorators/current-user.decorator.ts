import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../guards/session.guard.js';

// Extrae el usuario que SessionGuard ya autenticó y dejó en request.user.
// Solo usable en rutas protegidas (sin @Public()); ahí SessionGuard garantiza
// que request.user siempre está presente.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.user;
  },
);
