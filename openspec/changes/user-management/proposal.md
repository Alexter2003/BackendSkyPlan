# Proposal

## Why

El Módulo 2 (Usuario, 10 % de la nota) está sin cubrir: el cliente no puede ver ni editar su perfil, no existe recuperación de contraseña y el flag `mustChangePassword` hoy solo se devuelve en el login sin que nada lo haga cumplir. Con una contraseña temporal, el cliente podría ignorar el flag y usar toda la API. Hay que cerrar el módulo antes de seguir con checklist de visitas y fotos.

## What Changes

- `POST /auth/forgot-password` (público): recuperación por correo. Asigna una contraseña temporal aleatoria, sobrescribiendo `passwordHash`, con `mustChangePassword=true` y `tempPasswordExpiresAt` corto, y la envía por correo. Responde siempre 200 con mensaje genérico, iguala tiempos con un `bcrypt.hash` de relleno, no espera el envío del correo y aplica un cooldown por usuario derivado de `tempPasswordExpiresAt`. Cuentas inexistentes, inactivas o sin correo confirmado reciben la misma respuesta y no se les envía nada.
- `PUT /auth/change-password`: cambio obligatorio de contraseña. Solo funciona con `mustChangePassword=true`; exige `currentPassword`, `newPassword` y `confirmNewPassword`; rechaza temporal vencida y nueva igual a la actual. En una transacción actualiza `passwordHash`, baja `mustChangePassword`, limpia `tempPasswordExpiresAt` y cierra las demás sesiones del usuario conservando la actual.
- `SessionGuard` bloquea con 403 toda ruta mientras `mustChangePassword=true`, salvo las marcadas con el nuevo decorador `@AllowPendingPasswordChange()`: `PUT /auth/change-password`, `POST /auth/logout` y `GET /users/me`. El gateway WebSocket de notificaciones rechaza siempre a un usuario con `mustChangePassword=true`.
- `GET /users/me`: datos del usuario autenticado, incluido `mustChangePassword`.
- `PUT /users/me`: edita `firstName` y `lastName`. Rechaza explícitamente con 400 los campos `username`, `password` y `email`, cada uno con su mensaje.
- Migración de Prisma: `User.firstName` y `User.lastName` (`VarChar`, nulos). `UserPublic` los incorpora.
- `MailPort.sendTemporaryPasswordEmail` + plantilla + implementación Resend.
- Documentación cliente en `docs/api/` y actualización de la skill `requirements-compliance`.

## Capabilities

### New Capabilities
- `password-recovery`: solicitud de recuperación por correo, emisión y entrega de la contraseña temporal, respuesta que no revela qué correos existen y cooldown por usuario.
- `forced-password-change`: obligación de cambiar la contraseña temporal antes de usar el resto de la API (bloqueo en guard y WebSocket) y el endpoint de cambio con sus validaciones y cierre de otras sesiones.
- `user-profile`: consulta y edición del perfil propio con rechazo explícito de campos inmutables.

### Modified Capabilities
<!-- Ninguna: no existen specs previas de auth ni de usuarios. -->

## Impact

- Código: `src/modules/auth` (controller, service, DTO, módulo importa `MailModule`), `src/modules/users` (controller, service, DTO, utils), `src/modules/mail` (puerto, plantilla, servicio Resend), `src/common/guards/session.guard.ts`, `src/common/decorators/` (decorador nuevo), `src/modules/notifications/notifications.gateway.ts`.
- Base de datos: migración que agrega `User.firstName` y `User.lastName`. Sin tablas nuevas.
- API: 3 endpoints nuevos (`forgot-password`, `change-password`, `GET /users/me`) más `PUT /users/me`. Cambio de comportamiento: con `mustChangePassword=true` el resto de la API responde 403. La forma de `UserPublic` gana `firstName` y `lastName` (aditivo).
- Dependencias: ninguna nueva.
- Docs: nuevo `docs/api/user-management.md`; notas en `docs/api/auth-and-registration.md`.

## Fuera de alcance

- Cambio de correo con reconfirmación (`pendingEmail`).
- Cambio voluntario de contraseña con la sesión normal: el enunciado solo pide el flujo forzado.
- Rate limiting por IP y global (tampoco existe en `login`); queda como change aparte.
- Eliminar la tabla `PasswordReset`: se deja sin uso para no ampliar la migración.
- Corregir la fuga de tiempo ya existente en `resend-confirmation`.
- Pantallas y doble confirmación de la UI (trabajo del cliente Flutter; el backend solo exige `confirmNewPassword`).

## Referencias

- Ítem "MÓDULO 2 - USUARIO - BACKEND" del tablero de GitHub Projects del curso (no figura como issue del repositorio, `gh issue list` no lo devuelve).
- `.agents/skills/requirements-compliance/SKILL.md`, sección Módulo de Usuario.
