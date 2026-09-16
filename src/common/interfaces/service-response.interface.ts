import type { HttpStatus } from '@nestjs/common';

// Standard envelope every service method returns. `data` is generic so each
// service types it with its own interface (e.g. ServiceResponse<UserPublic>).
// `status` uses NestJS's HttpStatus enum, not a custom string.
export interface ServiceResponse<T = unknown> {
  status: HttpStatus;
  message: string;
  data: T;
}
