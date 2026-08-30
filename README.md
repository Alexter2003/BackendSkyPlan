# BackendSkyPlan

API backend for SkyPlan, built with NestJS and Prisma.

## Stack

- NestJS 12
- Prisma 6 (`@prisma/client`) + PostgreSQL (Supabase)
- class-validator / class-transformer
- Vitest

## Setup

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL / DIRECT_URL once the Supabase project exists
pnpm prisma generate
pnpm start:dev
```

The app fails fast on boot if a required env var (`DATABASE_URL`, `DIRECT_URL`, `PORT`, `NODE_ENV`) is missing — see `src/config/env.validation.ts`.

## Health check

```
GET /api/health
```

Returns `{ status: 'ok' | 'error', database: 'up' | 'down' }`. Reports `down` until real Supabase credentials are set in `.env`.

## Scripts

| Command           | Description                     |
| ------------------ | -------------------------------- |
| `pnpm start:dev`   | Start in watch mode              |
| `pnpm build`       | Compile to `dist/`               |
| `pnpm test`        | Unit tests                       |
| `pnpm test:e2e`    | End-to-end tests                 |
| `pnpm lint`        | Lint with oxlint                 |
| `pnpm prisma generate` | Regenerate the Prisma Client |
| `pnpm prisma migrate dev` | Apply schema migrations (once a database exists) |
