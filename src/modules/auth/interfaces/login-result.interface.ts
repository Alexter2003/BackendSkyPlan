import type { UserPublic } from '../../users/interfaces/user-public.interface.js';

export interface LoginResult {
  token: string;
  expiresAt: Date;
  // Flutter debe forzar la pantalla de cambio de password cuando esto es
  // true, antes de permitir cualquier otra acción.
  mustChangePassword: boolean;
  user: UserPublic;
}
