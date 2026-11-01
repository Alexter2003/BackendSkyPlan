# Design

## Context

Estado verificado en el código antes de diseñar (motivación en `proposal.md`):

- `AuthService.login` devuelve `mustChangePassword` pero no lo hace cumplir, y deliberadamente no valida `tempPasswordExpiresAt`.
- `resolveSession` (`src/common/utils/session-validation.utils.ts`) valida token, expiración, inactividad e `isActive`, y la usan el `SessionGuard` (HTTP) y el `NotificationsGateway` (WebSocket). Devuelve el `User` completo sin `passwordHash`, así que el guard ya dispone de `mustChangePassword` sin consulta extra.
- `User.tempPasswordExpiresAt` existe y nadie lo escribe. La tabla `PasswordReset` existe y no se usa.
- `MailPort` solo tiene `sendConfirmationEmail`; la plantilla actual está en inglés.
- El `ValidationPipe` global usa `whitelist` y `forbidNonWhitelisted`, así que un campo desconocido ya produce 400 genérico; para `username`, `password` y `email` se necesita un mensaje específico.
- No hay rate limiting en el proyecto ni `@nestjs/throttler`.
- El esquema solo guarda `email`, `username` y `passwordHash` como datos de la persona.

## Goals / Non-Goals

**Goals:**
- Que la contraseña temporal no se pueda saltar: el bloqueo vive en un solo lugar (guard) y es seguro por defecto.
- Recuperación que no filtre existencia de cuentas ni por contenido ni por tiempo.
- Cambio de contraseña atómico que corte sesiones ajenas.
- Perfil mínimo y una migración pequeña.

**Non-Goals:**
- Rate limiting general, cambio de correo, cambio voluntario de contraseña, limpieza de `PasswordReset` (ver "Fuera de alcance" en `proposal.md`).

## Decisions

### D1. Cómo se asigna la contraseña temporal
- **A. Sobrescribir `passwordHash` con la temporal** (elegida): lo que pide el enunciado y reutiliza `mustChangePassword` y `tempPasswordExpiresAt`. Contra: quien conozca un correo puede invalidar la contraseña de esa cuenta.
- **B. Guardar la temporal aparte en `PasswordReset`**: nadie puede bloquear una cuenta ajena, pero login pasa a aceptar dos credenciales y se aleja del enunciado.
- **C. Código de un solo uso + nueva contraseña directa**: más seguro, pero no hay "contraseña temporal" ni cambio forzado en el siguiente login; incumple el enunciado.

Recomendación y decisión del usuario: **A**, con cooldown de 5 minutos y expiración de 30 que acotan el daño del bloqueo malicioso. El riesgo queda documentado abajo.

### D2. Cómo el guard deja pasar ciertas rutas
- **A. Decorador `@AllowPendingPasswordChange()` leído con `Reflector`** (elegida): mismo patrón que `@Public()`; una ruta nueva queda bloqueada por defecto.
- **B. Lista de `method + path` dentro del guard**: centralizada pero frágil ante cambios de ruta y ajena al patrón del proyecto.
- **C. Sesión con scope restringido emitida en el login**: la más estricta, pero cambia `Session` y `login`.

Decisión del usuario: **A**. Rutas con el decorador: `PUT /auth/change-password`, `POST /auth/logout`, `GET /users/me`. El guard lee `mustChangePassword` del usuario ya cargado por `resolveSession`. Esto también restringe automáticamente las sesiones abiertas antes de la recuperación, sin borrarlas.

El gateway WebSocket no tiene decorador: tras `resolveSession` comprueba `user.mustChangePassword` y desconecta siempre. `resolveSession` no cambia de firma.

### D3. Qué pasa con las demás sesiones
- **A. Borrar las demás y conservar la actual, en la misma transacción que la contraseña** (elegida).
- **B. Borrar todas incluida la actual**: obliga a loguearse otra vez sin beneficio adicional.
- **C. No tocar ninguna**: una sesión robada sobrevive al cambio.

No se cierran sesiones al emitir la temporal, solo al cambiarla: así un tercero que conozca el correo no puede sacar al dueño de su sesión.

### D4. Recuperación sin filtrar existencia
- **A. Respuesta genérica + hash de relleno + envío sin esperar + cooldown en BD** (elegida), sin dependencias nuevas.
- **B. A + `@nestjs/throttler` por IP**: frena la rotación de correos desde una IP, pero añade dependencia y exige `trust proxy` detrás de un proxy.
- **C. Solo respuesta genérica**: deja la fuga por tiempo y el spam abiertos.

Detalles de A:
- Se ejecuta siempre exactamente un `bcrypt.hash` (con la temporal real para cuentas elegibles, con un valor de relleno en los demás casos), igual que ya hace `login`.
- Elegible = existe, `isActive`, `emailConfirmed` y fuera de cooldown.
- Cooldown: la emisión se deduce de `tempPasswordExpiresAt - 30 min`; si fue hace menos de 5 minutos no se emite otra. No requiere columna nueva.
- El envío es `void` con `catch` que registra el error en el log; la respuesta no espera a Resend.
- La actualización de la cuenta usa `updateMany` condicionada a que el cooldown siga sin cumplirse, para que dos solicitudes simultáneas no emitan dos temporales.

### D5. Qué datos edita el perfil
- **A. `firstName` y `lastName` nuevos, `username`/`password`/`email` rechazados** (elegida): migración mínima, sin riesgo para el canal de recuperación.
- **B. A + cambio de correo con reconfirmación**: añade `pendingEmail` y un endpoint más; desproporcionado para este módulo.
- **C. Permitir editar `email` directo**: quien robe una sesión cambia el correo y se apropia de la cuenta por recuperación.

Rechazo explícito: el DTO declara `username`, `password` y `email` como propiedades opcionales con un validador propio (`Forbidden`, en `src/common/validators/`) que falla si el campo viene presente, con el mensaje específico de cada uno. Así el `forbidNonWhitelisted` global no los captura antes con su mensaje genérico, y la validación ocurre antes de tocar la base. `firstName` y `lastName` se recortan con `trim`, de 1 a 100 caracteres; se exige al menos uno.

### D6. Dónde vive cada pieza
- `forgot-password` y `change-password` en `AuthService` / `AuthController` (autenticación); `AuthModule` importa `MailModule`.
- `GET/PUT /users/me` en `UsersService` / `UsersController`.
- Generador de contraseña temporal en `src/modules/auth/utils/` (función pura, usa `node:crypto`, garantiza minúscula, mayúscula y dígito y longitud 12).
- `GET /users/me` devuelve `UserPublic` más `mustChangePassword`; `UserPublic` gana `firstName` y `lastName`.

### D7. Códigos HTTP del cambio de contraseña
Sin cambio pendiente: 403. Temporal vencida: 403 con mensaje propio. Contraseña actual incorrecta y nueva igual a la actual: 400. Se evita 401 en rutas con sesión válida para que el cliente no confunda el error con una sesión caída y la cierre.

## Risks / Trade-offs

- [Bloqueo malicioso: quien conozca un correo puede invalidar su contraseña] → cooldown de 5 minutos, temporal de 30, y la víctima recupera pidiendo otra. Riesgo aceptado conscientemente por la decisión D1.
- [El correo de la temporal falla y la contraseña ya fue sobrescrita; el usuario queda sin acceso] → el fallo se registra en el log y el usuario puede pedir otra tras el cooldown. No se reintenta en segundo plano.
- [Sin rate limiting por IP, se pueden probar muchos correos distintos] → el hash de relleno y la respuesta genérica evitan enumerar; el abuso de volumen queda para un change de rate limiting global.
- [La temporal viaja en claro por correo] → es lo que pide el enunciado; mitigado por expiración corta y cambio obligatorio.
- [Sesiones previas quedan en 403 hasta que el usuario cambie la contraseña] → intencional; no se borran para no facilitar sacar al dueño de su cuenta.
- [Plantilla de correo en inglés] → se mantiene el idioma de la plantilla existente por consistencia; traducir ambas es un ajuste separado.

## Migration Plan

1. Migración Prisma que agrega `User.firstName` y `User.lastName` nulos (`prisma migrate dev` y migración versionada). Es aditiva: no requiere datos ni tiene riesgo para filas existentes.
2. Despliegue del código. Los usuarios existentes quedan con nombre y apellido en null.
3. Rollback: revertir el código; las columnas nuevas pueden quedarse sin efecto.
