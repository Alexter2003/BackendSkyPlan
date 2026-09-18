# Dependency Log

Source of truth for **why** each dependency was added, so no dev (or their agent) installs a second library that solves the same problem. Update this file in the same PR/commit that changes `package.json`.

Before installing anything new, search this file and `package.json` for an existing dependency that already covers the need.

## Runtime dependencies

| Package | Purpose | Added by | Date |
|---|---|---|---|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` | NestJS framework core | scaffold | 2026-08-29 |
| `@nestjs/config` | env var loading/validation (`ConfigModule`) | scaffold | 2026-08-29 |
| `@prisma/client` | Prisma generated client — ORM/DB access. **Do not add another query builder or ORM (Drizzle, TypeORM, Sequelize, Knex, etc.) — Prisma is the only one used in this project.** | scaffold | 2026-08-29 |
| `bcrypt` | Password hashing for `User.passwordHash` (registration, and future login/password-reset). **Do not add argon2 or another hashing lib alongside it — bcrypt is the project's implicit choice per `requirements-compliance`.** | Alexvy | 2026-09-15 |
| `class-transformer` | DTO (de)serialization, used with `class-validator` | scaffold | 2026-08-29 |
| `class-validator` | DTO validation decorators. **Do not add Zod/Joi/Yup for request validation — this is the standard for the whole API.** | scaffold | 2026-08-29 |
| `reflect-metadata` | required by NestJS decorators | scaffold | 2026-08-29 |
| `resend` | Transactional email provider SDK — used to send account confirmation emails. **First and only email provider in this project; do not add nodemailer or another mail SDK alongside it.** | Alexvy | 2026-09-15 |
| `rxjs` | required by NestJS (interceptors, observables) | scaffold | 2026-08-29 |

## Dev dependencies

| Package | Purpose | Added by | Date |
|---|---|---|---|
| `@nestjs/cli`, `@nestjs/schematics` | Nest CLI/codegen | scaffold | 2026-08-29 |
| `@nestjs/mau` | Nest deployment tooling | scaffold | 2026-08-29 |
| `@nestjs/testing` | NestJS testing utilities | scaffold | 2026-08-29 |
| `@types/bcrypt` | type definitions for `bcrypt` | Alexvy | 2026-09-15 |
| `oxlint` | linter. **Do not add ESLint alongside it — oxlint is the only linter for this repo.** | scaffold | 2026-08-29 |
| `prettier` | formatter | scaffold | 2026-08-29 |
| `prisma` | Prisma CLI (migrate, generate, studio, db seed) | scaffold | 2026-08-29 |
| `vitest`, `@vitest/coverage-v8` | test runner. **Do not add Jest — Vitest is the only test runner here, despite CLAUDE.md's generic profile mentioning Jest.** | scaffold | 2026-08-29 |
| `supertest` | HTTP assertions for e2e tests | scaffold | 2026-08-29 |
| `tsx` | runs `prisma/seed.ts` (TS) without a build step | 2026-08-30 | 2026-08-30 |
| `typescript` | language | scaffold | 2026-08-29 |
| `vite-tsconfig-paths` | path alias resolution in Vitest | scaffold | 2026-08-29 |
| `source-map-support` | readable stack traces in prod builds | scaffold | 2026-08-29 |

## Rules for adding a dependency

1. Check this file + `package.json` first — if something already covers the need (e.g. HTTP client, date library, validation, ORM), use it instead of adding a competing package.
2. Always install with **pnpm**: `pnpm add <pkg>` or `pnpm add -D <pkg>`.
3. Add a row to the relevant table above in the **same commit/PR** that adds the dependency: package name, one-line purpose, who added it, date. If it replaces or overlaps with an existing choice, say so explicitly (like the rows above do) so nobody re-adds the alternative later.
4. If introducing a genuinely new category of library (e.g. first HTTP client, first queue library, first caching layer), that's an architectural decision — debate it with the user first per the "Technical Decisions = Debate, Not Dictation" rule, don't just install it.
