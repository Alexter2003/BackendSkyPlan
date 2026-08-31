# AGENTS.md — BackendSkyPlan

Instructions for any AI coding agent (Claude Code, Cursor, Copilot, etc.) working in this repository. These are team-wide standards, not personal preferences — they apply the same way regardless of which agent or which dev is driving.

## What this project is

NestJS backend for SkyPlan: suggests activities based on location, date, and weather forecast. Prisma ORM on PostgreSQL, hosted on Supabase.

## Team standards live in `.agents/skills/`

Each standard below is documented in full as a skill under `.agents/skills/<name>/SKILL.md`. If your agent supports loading skills natively, load these before the corresponding kind of work. If it doesn't, read the file directly before acting — treat it as required reading, not optional context.

| Skill | Read it before... |
|---|---|
| [`.agents/skills/project-structure/SKILL.md`](.agents/skills/project-structure/SKILL.md) | creating a module, controller, service, or DTO |
| [`.agents/skills/commit-conventions/SKILL.md`](.agents/skills/commit-conventions/SKILL.md) | writing a commit message or PR title |
| [`.agents/skills/git-workflow/SKILL.md`](.agents/skills/git-workflow/SKILL.md) | starting a feature/fix, or merging a PR |
| [`.agents/skills/dependency-management/SKILL.md`](.agents/skills/dependency-management/SKILL.md) | running `pnpm add` / `pnpm add -D` |
| [`.agents/skills/requirements-compliance/SKILL.md`](.agents/skills/requirements-compliance/SKILL.md) | starting/closing a module, or adding an extra/innovative feature |

Also present (general framework/tooling knowledge, not project-specific rules): `nestjs-best-practices`, `nodejs-backend-patterns`, `nodejs-best-practices`, `oxlint`, `prisma-cli`, `prisma-client-api`, `prisma-database-setup`, `prisma-postgres`, `typescript-advanced-types`, `vitest`.

`DEPENDENCIES.md` at the repo root is the running log of installed packages and why — check it before adding anything new.

## Non-negotiable rules

1. **Never commit or push directly to `main`.** Every change goes through a branch (`<type>/<short-description>`) and a Pull Request, then squash-merge. No exceptions for "small" changes.
2. **Commits and PR titles follow Conventional Commits**, in English: `type(scope): subject`, types limited to `feat|fix|chore|refactor|test|docs`.
3. **Feature-based structure**: all backend code lives under `src/modules/<feature>/` (controller, service, module, DTOs, specs together). Do not group by technical layer (`controllers/`, `services/` at the top level).
4. **Check before installing.** Before adding any dependency, check `DEPENDENCIES.md` and `package.json` for something that already covers the need. If you do install something, add a row to `DEPENDENCIES.md` in the same change.
5. **pnpm only.** Never `npm install` / `yarn add`.
6. **No new ORM, validation library, linter, or test runner.** This project has already chosen Prisma, `class-validator`/`class-transformer`, `oxlint`, and `vitest` respectively — do not introduce TypeORM/Drizzle, Zod/Joi, ESLint, or Jest.

## Database

- Schema lives in `prisma/schema.prisma`. No `@map`/`@@map` — Prisma names are used verbatim as Postgres identifiers (case-sensitive).
- Any schema change requires a generated, committed migration: `pnpm prisma migrate dev --name <name>`. Never edit tables directly from the Supabase Table Editor.
- Custom NestJS auth (`User`/`Session`/`PasswordReset` models) — not Supabase Auth.
- Supabase Row Level Security is intentionally off: the backend talks to Postgres directly via `DATABASE_URL`/`DIRECT_URL`, never through the Supabase anon key from a client. This would need to be revisited only if a client ever calls Supabase directly.

## Code quality

- TypeScript strict mode. No `any`, ever.
- Controllers handle HTTP only; services hold business logic; no direct Prisma calls in a controller.
- Errors are thrown explicitly with clear messages — no silent failures.
- DTOs use `class-validator` decorators, one per operation.
