---
name: requirements-compliance
description: "Checks BackendSkyPlan work against the official course project requirements (login, user module, locations module, activities module, pending-activities module) and their grading weights. Use this skill before starting a new module, before marking a module 'done', when reviewing whether an endpoint/feature covers what's graded, and whenever a dev wants to add something extra/innovative — to confirm it doesn't replace or weaken a base requirement."
---

# BackendSkyPlan — Requirements Compliance

BackendSkyPlan is the API for the "Planificador de Actividades" mobile app (Flutter, separate
repo) built for the Programación Dispositivos Móviles course (Ing. German Rodríguez,
Universidad Mesoamericana). This skill is the backend's checklist against the **official
project brief** ("Enunciado Proyecto Final"), so grading-relevant behavior doesn't silently
drift while building.

The brief is a fixed external document (not stored in this repo). The checklist below is a
verbatim-equivalent transcription of its requirements, scoped to what the **backend** must
provide — screens/UI and Google Maps/Weather client-side wiring are the Flutter app's job,
but every piece of data or validation those screens depend on must exist here.

## Grading weights (know what's expensive to get wrong)

| Module | Weight |
|---|---|
| Login | 10% |
| Módulo de Usuario | 10% |
| Módulo de Ubicaciones | 20% |
| Módulo de Actividades | 30% |
| Módulo de Actividades Pendientes | 30% |

Actividades and Actividades Pendientes are 60% of the grade combined — prioritize
correctness there over polish elsewhere.

## Backend obligations per module

### 1. Login (10%)
- Credentials must be handled **encrypted/hashed** end-to-end: never store or log plaintext
  passwords. Current schema: `User.passwordHash` — confirm any new auth code hashes before
  persisting (bcrypt/argon2 family, already the project's implicit choice — check
  `package.json` before introducing a new hashing lib, per [[dependency-management]]).
- An API endpoint must validate credentials against the DB (`User` table) — this is the
  "pantalla de login" backing service.
- The "menú lateral" / logout button are Flutter-side; backend obligation is a session
  invalidation endpoint (see `Session` model) that the logout button calls.
- Logo/color palette is a design asset, not backend scope — skip it here.

### 2. Módulo de Usuario (10%)
- Endpoint to view the logged-in user's data.
- Endpoint to edit personal data — must explicitly **reject** attempts to change `username`
  or `password` through this endpoint (the brief calls this out as forbidden here; password
  changes go through the dedicated flows below).
- Password-recovery flow: request by registered email → assign a **temporary password**
  (`User.mustChangePassword` / `tempPasswordExpiresAt` already model this) → next login must
  be forced through a change-password step before any other endpoint is usable.
- Change-password screen (when logged in with a temp password) requires **double
  confirmation** — that's a client-side UX rule, but the backend DTO must require the new
  password to be submitted/validated in a way that supports it (e.g. reject if the endpoint
  is called without `mustChangePassword` being true, so the flow can't be skipped).

### 3. Módulo de Ubicaciones (20%) — `Visit` model in this schema
- Create endpoint storing a location's essential data, **including coordinates** — this is an
  explicit requirement in the brief ("las coordenadas de la ubicación deben de almacenarse en
  DB"). Confirm `latitude`/`longitude` are always persisted, never optional/nullable on
  create.
- Edit endpoint for a registered location.
- Delete endpoint that **cascades to its activities** — confirm the FK (`Activity.visitId` →
  `Visit`) is `onDelete: Cascade` in `prisma/schema.prisma`, not `Restrict`/`SetNull`. This is
  graded behavior, not an implementation detail — don't silently change it.
- List endpoint returning the locations owned by the current user.

### 4. Módulo de Actividades (30%) — `Activity` model in this schema
- List endpoint returning activities grouped/filterable by location.
- **Overlap validation**: two activities at the same location must not have overlapping
  date/time ranges — this must be enforced server-side (service layer), not left to the
  client. If you don't see this check in the activities service, it's a gap against a graded
  requirement, not an optional nicety.
- Create endpoint requires: target location, description, date, start/end time, **activity
  type (al aire libre / interior)**, and a list of desirable weather conditions
  (`WeatherCondition` / `ActivityWeather` join model already exist for the conditions list —
  confirm there is an actual `type` field for indoor/outdoor; as of this schema there isn't
  one on `Activity` yet, which is a gap against 4.b, not a stylistic choice).
- Edit endpoint for general activity data.
- Delete endpoint for an activity.

### 5. Módulo de Actividades Pendientes (30%) — derived/read endpoints, no new core model
- Endpoint listing upcoming activities with their location and **that day's weather at that
  location** (weather-provider integration — check [[dependency-management]] before adding an
  HTTP client for this if one doesn't already exist).
- Filters: by date proximity, by location, by feasibility probability given the weather.
- Endpoint to mark an activity as completed.
- Endpoint to reschedule an activity from this view (distinct from the generic edit in module
  4 — the brief calls it out as its own action, so make sure it's reachable even if it reuses
  the same underlying update).
- A **feasibility/probability indicator** per activity, computed from activity type +
  forecast weather vs. the activity's desired `WeatherCondition` list — this is graded output,
  not a display detail, so it must come from the API, not be computed ad-hoc in Flutter.

## Adding something extra or innovative

The brief allows extending the project — as long as it never changes, weakens, or replaces a
base requirement above. When a dev (or an agent) wants to add something not in the checklist:

1. **Confirm it's additive.** New endpoint, new optional field, new module — fine. Changing
   the shape/behavior of a required endpoint so the extra feature fits more easily — not fine
   without discussing it first, since that risks the graded contract.
2. **Confirm it doesn't touch grading-relevant fields silently.** E.g. adding a "smart
   suggestions" feature must not repurpose the feasibility indicator required by 5.e — build a
   separate field/endpoint alongside it.
3. **Keep it explainable.** Per the brief's own rules ("la nota es individual, se calificará
   la capacidad de cada estudiante para poder explicar y defender el código" — every student
   must have full command of the code, plagiarism voids the project), an extra should stay
   simple enough that its author can defend it in an oral review. This is also consistent with
   this project's own "no premature abstraction" standard — don't reach for a generic
   plugin/strategy framework to bolt on one extra feature.
4. **Still follow every other team standard** — [[project-structure]] for where the code
   lives, [[commit-conventions]] and [[git-workflow]] for how it lands,
   [[dependency-management]] before installing anything new for it.
5. If the extra is a genuinely new architectural piece (new external API, new auth mechanism,
   a caching layer, etc.), that's a "Technical Decisions = Debate, Not Dictation" moment per
   the user's global CLAUDE.md — present options and trade-offs before building it, don't just
   implement it.

## Using this skill

- **Before starting a module**: read its section above, confirm the endpoints/validations you
  are about to build cover every lettered sub-requirement, not just the obvious CRUD.
- **Before marking a module "done"**: re-check the section — especially the easy-to-miss
  server-side rules (cascade delete, overlap validation, forced password change, feasibility
  indicator) that don't show up just from looking at a controller's route list.
- **When reviewing a PR** that touches a module: use the relevant section as the review
  checklist in addition to normal code review.
- **When proposing an extra/innovative feature**: run it through the "Adding something extra"
  section before implementing.
