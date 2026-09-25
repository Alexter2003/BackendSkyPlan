---
name: client-api-docs
description: "Generates client-facing API documentation (Markdown) for a BackendSkyPlan module, meant to be handed to the Flutter client so they know exactly what to call and what comes back. Use this skill whenever the user asks to document endpoints for the mobile client, says '/client-api-docs <module>', or asks for something like 'genera la documentación de X para el cliente'."
---

# BackendSkyPlan — Client API Docs Generator

Produces a Markdown file the Flutter client can read to implement a feature end-to-end:
which endpoints to call, what to send, and the full JSON they get back. This is **not**
internal/backend documentation — it's written for someone who has never seen this codebase
and only consumes the HTTP API.

## Usage

Invoke with a module name, e.g.:

```
/client-api-docs auth
/client-api-docs users
/client-api-docs locations
```

If no module is given, ask which one (or offer the list of `src/modules/*` directories).

## Steps

1. **Find the module's controller(s)**: `src/modules/<module>/*.controller.ts`. Note: some
   client-facing flows span two Nest modules — e.g. registration/email-confirmation live in
   `users`, but login/logout live in `auth`. If the user names a *flow* rather than a literal
   folder, include every controller that flow touches.
2. For every route in those controllers, read:
   - The HTTP method + path (remember the global prefix `/api` from `src/main.ts`).
   - Whether it's `@Public()` or requires the session guard (no decorator = protected, needs
     `Authorization: Bearer <token>`).
   - Its DTO (`dto/*.dto.ts`) for the request body/query/params — read every
     `class-validator` decorator to describe the real constraints (min/max length, regex,
     format), not just the field name.
   - The service method it calls, to find:
     - The exact success `message` string(s) and `status` (`ServiceResponse` envelope:
       `{ status, message, data }`, defined in
       `src/common/interfaces/service-response.interface.ts`).
     - Every exception thrown (`BadRequestException`, `ConflictException`,
       `UnauthorizedException`, `ForbiddenException`, `HttpException` with a custom status,
       etc.) with its exact message and status code.
     - The shape of `data` on success — trace it to the returned interface (e.g.
       `UserPublic`, `LoginResult`) and list every field with its type.
3. Check `src/common/filters/all-exceptions.filter.ts` for the generic error envelope shape —
   errors follow the same `{status, message, data: null}` envelope, and `message` can be a
   single string or (for stacked `class-validator` failures) an array of strings.
4. Write one Markdown file per logical flow to `docs/api/<flow-name>.md` (kebab-case, e.g.
   `auth-and-registration.md`, `locations.md`). Reuse
   `docs/api/auth-and-registration.md` as the format reference:
   - Header with base URL and the standard response envelope.
   - One section per endpoint: method + path, whether it's public or requires auth, a request
     body/query/params table (field, type, rules), a full example request body, a full
     example success response JSON (every field, realistic values), and a table of every
     possible error status + when it happens + exact message.
   - End with a short "recommended client flow" section stringing the endpoints together in
     the order the app would call them, if the flow has more than one endpoint.
5. Never invent fields, endpoints, or messages — everything in the doc must trace back to
   actual code (controller route, DTO decorator, service throw/return). If something the
   client will need doesn't exist yet (e.g. a password-reset endpoint), say so explicitly
   instead of documenting a guess.
6. After writing, list the changed/created file(s) per the user's global changelog rule.

## Non-goals

- This is not internal architecture documentation — skip service internals, Prisma schema
  details, or anything the client can't observe over HTTP.
- Don't document endpoints outside the requested module/flow.
