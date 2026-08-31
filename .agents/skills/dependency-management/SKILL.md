---
name: dependency-management
description: "Enforces BackendSkyPlan's dependency discipline: check for an existing package before installing a new one, always use pnpm, and always update DEPENDENCIES.md in the same change. Use this skill whenever about to run `pnpm add`, evaluate a new library, or review a PR that touches package.json."
---

# BackendSkyPlan — Dependency Management

Multiple devs (and their agents) work on this repo independently. Without a shared log, it's easy for two people to each install a different library for the same job (e.g. one adds `axios`, another adds `got`, another uses raw `fetch`). `DEPENDENCIES.md` at the repo root exists to prevent that.

## Before installing anything

1. Read `DEPENDENCIES.md` at the repo root and check `package.json` — is there already a package that covers this need?
2. If yes: use it. Do not add a second library for the same purpose, even if you personally prefer a different one.
3. If genuinely unsure whether an existing package covers the need, search for how it's already used in `src/` before concluding it doesn't.

## Known standards already locked in (do not duplicate)

- **ORM**: Prisma only — no Drizzle/TypeORM/Sequelize/Knex.
- **Validation**: `class-validator` + `class-transformer` on DTOs — no Zod/Joi/Yup.
- **Linter**: `oxlint` — no ESLint.
- **Test runner**: `vitest` — no Jest, even though the generic dev profile mentions Jest by default.
- **Package manager**: `pnpm` — never `npm`/`yarn` (`pnpm add`, `pnpm add -D`, `pnpm install`).

(Full list with rationale lives in `DEPENDENCIES.md`.)

## When installing is actually needed

1. Install with pnpm: `pnpm add <pkg>` (runtime) or `pnpm add -D <pkg>` (dev-only).
2. In the same commit, add a row to `DEPENDENCIES.md` under the correct table (runtime vs dev): package name, one-line purpose, added-by, date (see [[commit-conventions]] for date formatting — use the actual current date, not a placeholder).
3. If this package overlaps in purpose with something that could tempt a future dev to pick the *other* option, say so explicitly in the table row (see the existing "Do not add X" notes as examples).
4. If this is the **first** library in a new category (first HTTP client, first cache layer, first queue, first auth/JWT library, etc.), treat it as an architecture decision: present options with tradeoffs to the user before installing, per the project's "Technical Decisions = Debate, Not Dictation" rule — don't silently pick one.

## Reviewing a PR that adds a dependency

Per [[git-workflow]], don't approve/merge a PR that changed `package.json` unless `DEPENDENCIES.md` was updated in the same PR.
