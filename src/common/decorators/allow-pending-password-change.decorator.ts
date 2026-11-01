import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';

// Marca una ruta protegida como accesible aunque el usuario tenga un cambio
// de contraseña pendiente (mustChangePassword). Sin este decorador, SessionGuard
// responde 403 a esa ruta: lo no marcado queda bloqueado por defecto.
export const AllowPendingPasswordChange = (): MethodDecorator &
  ClassDecorator => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
