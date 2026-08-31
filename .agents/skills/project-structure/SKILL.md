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
      <feature>.controller.ts
      <feature>.service.ts
      <feature>.module.ts
      <feature>.controller.spec.ts
      <feature>.service.spec.ts
  common/
    filters/          # exception filters
    guards/            # auth/role guards
    interceptors/
    decorators/
    pipes/
  prisma/
    prisma.service.ts
    prisma.module.ts
  config/
    *.config.ts        # @nestjs/config namespaced config factories
  main.ts
  app.module.ts
```

## Rules

1. **One module per feature/domain**, under `src/modules/<feature>/`. Do not create top-level `controllers/`, `services/`, `dtos/` folders that group by technical layer across features — that pattern is explicitly rejected here.
2. **Controllers handle HTTP only**: routing, request/response shape, status codes, calling the service. No business logic, no direct Prisma calls in a controller.
3. **Services hold business logic**. They call `PrismaService` (from `src/prisma/`) for data access. No `PrismaClient` instantiated ad-hoc inside a service — always inject the shared `PrismaService`.
4. **DTOs live in `<feature>/dto/`** and use `class-validator` decorators. One DTO per operation (`Create*Dto`, `Update*Dto`, etc.) — no reusing a DTO for unrelated shapes.
5. **Shared/cross-cutting code** (guards, interceptors, filters, decorators used by 2+ features) goes in `src/common/`. If something is only used by one feature, it stays inside that feature's folder, not in `common/`.
6. **Tests live next to the code they test** (`*.spec.ts` beside the file), not in a parallel `test/` mirror tree — except e2e tests, which stay in the top-level `test/` folder per the existing Vitest e2e config.
7. Before creating a new module, check `src/modules/` for an existing feature it could extend instead of creating a near-duplicate (e.g. don't create `weather/` and `weather-conditions/` as separate modules if one already covers the domain).

## When adding a new feature

1. Create `src/modules/<feature>/` with the layout above.
2. Register the module in `app.module.ts` imports.
3. If it needs Prisma access, import `PrismaModule` into the feature module (don't re-instantiate Prisma).
4. Follow [[commit-conventions]] and [[git-workflow]] for how the branch/commits/PR for this feature should look.
