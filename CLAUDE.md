# BackendSkyPlan — Project Instructions

NestJS backend for SkyPlan: an API that suggests activities based on location, date, and weather forecast. Prisma ORM on PostgreSQL, hosted on Supabase.

This file applies to **every dev working in this repo**, regardless of their personal global config. It defines shared, non-negotiable team standards — not individual preferences.

## Team skills (load these)

This repo ships its own skills under `.agents/skills/` (symlinked into `.claude/skills/` so Claude Code picks them up automatically). Load the relevant one before doing the corresponding kind of work:

- **[project-structure](.agents/skills/project-structure/SKILL.md)** — feature-based folder layout (`src/modules/<feature>/`). Load before creating a module, controller, service, or DTO, or deciding where a new file goes.
- **[commit-conventions](.agents/skills/commit-conventions/SKILL.md)** — Conventional Commits format. Load before writing any commit message or a PR title.
- **[git-workflow](.agents/skills/git-workflow/SKILL.md)** — branch naming, mandatory PR flow, squash-merge. Load before starting work on any feature/fix, and before merging.
- **[dependency-management](.agents/skills/dependency-management/SKILL.md)** — check `DEPENDENCIES.md` before installing anything. Load before running `pnpm add`.
- **[requirements-compliance](.agents/skills/requirements-compliance/SKILL.md)** — checks work against the official course project brief (login, user, locations, activities, pending-activities modules) and their grading weights. Load before starting or closing out a module, and before adding any extra/innovative feature, to confirm it doesn't replace or weaken a base requirement.

Also available (general, not team-authored): `nestjs-best-practices`, `nodejs-backend-patterns`, `nodejs-best-practices`, `oxlint`, `prisma-cli`, `prisma-client-api`, `prisma-database-setup`, `prisma-postgres`, `typescript-advanced-types`, `vitest`.

## Hard rules (summary — full detail lives in the skills above)

1. **Never commit or push directly to `main`.** Branch → PR → squash-merge, always. See [git-workflow](.agents/skills/git-workflow/SKILL.md).
2. **Conventional Commits, in English**, for every commit and PR title. See [commit-conventions](.agents/skills/commit-conventions/SKILL.md).
3. **Feature-based structure**: new code goes in `src/modules/<feature>/`, not grouped by technical layer. See [project-structure](.agents/skills/project-structure/SKILL.md).
4. **Before installing a dependency**, check `DEPENDENCIES.md` and `package.json` for an existing package that already covers the need. Update `DEPENDENCIES.md` in the same commit when you do install something. See [dependency-management](.agents/skills/dependency-management/SKILL.md).
5. **pnpm only** — never `npm`/`yarn`.

## Locked technical choices (do not introduce alternatives)

- **ORM**: Prisma (no TypeORM/Drizzle/Sequelize/Knex)
- **Validation**: `class-validator` + `class-transformer` on DTOs (no Zod/Joi/Yup)
- **Linter**: `oxlint` (no ESLint)
- **Test runner**: `vitest` (no Jest)
- **DB**: PostgreSQL via Supabase, no `@map`/`@@map` in `prisma/schema.prisma` — Prisma model/field names are used verbatim as table/column names (case-sensitive quoted identifiers in Postgres)
- **Auth**: custom NestJS auth (`User`/`Session`/`PasswordReset` models) — not Supabase Auth
- **RLS**: intentionally left off Supabase tables. The backend connects via the Postgres connection string (`DATABASE_URL`/`DIRECT_URL`), never via the Supabase anon key from a client — RLS would only become necessary if a client ever talks to Supabase directly (e.g. `@supabase/supabase-js` in the mobile app for auth/storage/realtime). If that changes, revisit this.

## Code quality (applies regardless of who's coding)

- TypeScript strict mode, no `any`
- Controllers: HTTP only. Services: business logic. No Prisma calls in a controller.
- Errors thrown explicitly with clear messages
- Every schema change needs a generated + committed Prisma migration (`pnpm prisma migrate dev --name <name>`) — never hand-edit the Supabase schema from the Table Editor
