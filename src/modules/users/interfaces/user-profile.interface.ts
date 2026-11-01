import type { UserPublic } from './user-public.interface.js';

// Perfil del usuario autenticado: lo público más el estado del cambio de
// contraseña, para que la app lo recupere si arranca con la sesión abierta.
export interface UserProfile extends UserPublic {
  mustChangePassword: boolean;
}
