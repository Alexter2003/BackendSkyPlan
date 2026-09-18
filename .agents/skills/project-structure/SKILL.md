---
name: project-structure
description: "Enforces BackendSkyPlan's feature-based folder structure for the NestJS backend. Use this skill whenever creating a new module/feature, adding a controller/service/DTO, or deciding where a new file should live — including when a teammate's request implies new backend functionality (endpoints, business logic, data access)."
---

# BackendSkyPlan — Project Structure

BackendSkyPlan is organized **by feature (module), not by technical layer**. Every domain concept (users, auth, visits, activities, weather, etc.) is a self-contained NestJS module. This keeps features cohesive and lets multiple devs work in parallel without touching the same folders.

## Canonical layout

```
src/
  modules/
    <feature>/
      dto/
        create-<feature>.dto.ts
        update-<feature>.dto.ts
      interfaces/
        <feature>-public.interface.ts
      <feature>.controller.ts
      <feature>.service.ts
      <feature>.module.ts
  common/
    filters/          # exception filters
    guards/            # auth/role guards
    interceptors/
    decorators/
    validators/        # reusable class-validator decorators (e.g. @Match)
    pipes/
    interfaces/
      service-response.interface.ts   # ServiceResponse<T> — see below
  prisma/
    prisma.service.ts
    prisma.module.ts
  config/
    *.config.ts        # @nestjs/config namespaced config factories
  main.ts
  app.module.ts
test/                  # mirrors src/ exactly — see rule 6
  modules/
    <feature>/
      <feature>.service.spec.ts
      dto/
        create-<feature>.dto.spec.ts
  app.e2e-spec.ts
```

## Rules

1. **One module per feature/domain**, under `src/modules/<feature>/`. Do not create top-level `controllers/`, `services/`, `dtos/` folders that group by technical layer across features — that pattern is explicitly rejected here.
2. **Controllers handle HTTP only**: routing, request/response shape, status codes, calling the service. No business logic, no direct Prisma calls in a controller.
3. **Services hold business logic**. They call `PrismaService` (from `src/prisma/`) for data access. No `PrismaClient` instantiated ad-hoc inside a service — always inject the shared `PrismaService`.
4. **DTOs live in `<feature>/dto/`** and use `class-validator` decorators. One DTO per operation (`Create*Dto`, `Update*Dto`, etc.) — no reusing a DTO for unrelated shapes.
5. **Shared/cross-cutting code** (guards, interceptors, filters, decorators used by 2+ features) goes in `src/common/`. If something is only used by one feature, it stays inside that feature's folder, not in `common/`.
6. **Tests live in the top-level `test/` folder, mirroring `src/`'s structure exactly** — not beside the source file. E.g. `src/modules/users/users.service.ts` → `test/modules/users/users.service.spec.ts`; `src/health/health.controller.ts` → `test/health/health.controller.spec.ts`. E2e specs (`*.e2e-spec.ts`) stay directly under `test/` per the existing Vitest e2e config. `test/` is committed — every dev and CI must have access to the suite.
7. **Services return `ServiceResponse<T>`** (`src/common/interfaces/service-response.interface.ts`) from every method that hands data back to a controller — see "Standard service response envelope" below.
8. Before creating a new module, check `src/modules/` for an existing feature it could extend instead of creating a near-duplicate (e.g. don't create `weather/` and `weather-conditions/` as separate modules if one already covers the domain).

## Standard service response envelope

Every service method that returns data implements `ServiceResponse<T>` directly — no builder/util function for it, just the object literal:

```ts
export interface ServiceResponse<T = unknown> {
  status: HttpStatus; // from '@nestjs/common' — standard HTTP status codes, not a custom string
  message: string;
  data: T;
}
```

```ts
import { HttpStatus } from '@nestjs/common';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';

async create(dto: CreateUserDto): Promise<ServiceResponse<UserPublic>> {
  // ...
  return {
    status: HttpStatus.CREATED,
    message: 'User registered successfully',
    data: toUserPublic(user),
  };
}
```

- `status` always uses NestJS's `HttpStatus` enum — never a custom string literal (`'success'`/`'error'`).
- `data` is typed per-service via the feature's own response interface (e.g. `UserPublic`).
- Controllers return the service's `ServiceResponse<T>` as-is; they don't unwrap or rebuild it.
- Error paths go through explicitly thrown `HttpException` subclasses (`BadRequestException`, `ConflictException`, etc.) inside the service — never a manually-built error response. Services catch their own expected infrastructure errors (e.g. a Prisma `P2002` unique-constraint violation) and re-throw them as a controlled `HttpException`. The single global `AllExceptionsFilter` (`src/common/filters/`) only normalizes the response shape for exceptions already thrown this way, and falls back to a generic 500 for anything unrecognized — it does not interpret error codes itself. This envelope is for the success path only.

## When adding a new feature

1. Create `src/modules/<feature>/` with the layout above.
2. Register the module in `app.module.ts` imports.
3. If it needs Prisma access, import `PrismaModule` into the feature module (don't re-instantiate Prisma).
4. Follow [[commit-conventions]] and [[git-workflow]] for how the branch/commits/PR for this feature should look.
