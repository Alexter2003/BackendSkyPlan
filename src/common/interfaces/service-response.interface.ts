import type { HttpStatus } from '@nestjs/common';

// Sobre estándar que devuelve cada método de servicio. `data` es genérico
// para que cada servicio lo tipe con su propia interfaz (ej.
// ServiceResponse<UserPublic>). `status` usa el enum HttpStatus de NestJS,
// nunca un string personalizado.
export interface ServiceResponse<T = unknown> {
  status: HttpStatus;
  message: string;
  data: T;
}
