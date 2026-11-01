# Tasks

## 1. Esquema y forma pública del usuario

- [x] 1.1 Agregar `firstName` y `lastName` (`VarChar(100)`, nulos) al modelo `User` y generar la migración con `pnpm prisma migrate dev --name add_user_profile_names`; verificar que `pnpm prisma migrate status` queda al día
- [x] 1.2 Agregar `firstName` y `lastName` a `UserPublic` y a `toUserPublic`; actualizar los tests existentes de `users` y `auth` que comparan la forma pública y verificar que `pnpm test` en `test/modules/users` y `test/modules/auth` pasa

## 2. Correo de contraseña temporal

- [x] 2.1 Agregar `sendTemporaryPasswordEmail` a `MailPort` con su payload (`to`, `username`, `temporaryPassword`, `expiresInMinutes`), una plantilla en `src/modules/mail/templates/` y la implementación en `ResendMailService`; verificar con tests de la plantilla y del servicio (mock de Resend) que el contenido incluye la temporal y la expiración, y que un error de Resend lanza excepción

## 3. Guard y bloqueo por cambio pendiente

- [x] 3.1 Crear el decorador `@AllowPendingPasswordChange()` en `src/common/decorators/` y hacer que `SessionGuard` responda 403 con mensaje en español cuando `user.mustChangePassword` es true y la ruta no lo lleva; verificar con tests del guard: ruta sin decorador bloqueada, ruta con decorador permitida, `@Public()` sin cambios, usuario sin cambio pendiente sin cambios
- [x] 3.2 Hacer que `NotificationsGateway.handleConnection` desconecte siempre a un usuario con `mustChangePassword=true`; verificar con un test del gateway que una conexión con cambio pendiente se rechaza y una normal se acepta

## 4. Recuperación de contraseña

- [x] 4.1 Crear la función pura generadora de contraseña temporal en `src/modules/auth/utils/` (12 caracteres, con minúscula, mayúscula y dígito, vía `node:crypto`); verificar con tests que siempre cumple la regex de complejidad del registro y que dos llamadas difieren
- [x] 4.2 Crear `ForgotPasswordDto` (solo `email`, `IsEmail`, `MaxLength(255)`) e implementar `AuthService.forgotPassword` según D4 (respuesta genérica, hash de relleno, cooldown de 5 minutos con `updateMany` condicionado, expiración de 30 minutos, envío sin esperar con log del fallo); importar `MailModule` en `AuthModule`; verificar con tests: cuenta elegible recibe temporal y correo, correo inexistente, cuenta inactiva, cuenta sin confirmar y cooldown devuelven lo mismo sin enviar nada, fallo de Resend no rompe la respuesta, cualquier solicitud ejecuta un `bcrypt.hash`
- [x] 4.3 Exponer `POST /auth/forgot-password` público con `HttpCode(200)` en `AuthController`; verificar con un test del controlador y comprobando que un correo inválido responde 400

## 5. Cambio obligatorio de contraseña

- [x] 5.1 Crear `ChangePasswordDto` (`currentPassword`, `newPassword` con las mismas reglas que el registro, `confirmNewPassword` con `@Match('newPassword')`) e implementar `AuthService.changePassword(userId, sessionId, dto)` según D3 y D7, en una transacción que actualiza `passwordHash`, `mustChangePassword=false`, `tempPasswordExpiresAt=null` y borra las demás sesiones; verificar con tests: éxito con borrado de las otras sesiones y conservación de la actual, sin cambio pendiente (403), temporal vencida (403), contraseña actual incorrecta (400), nueva igual a la actual (400), fallo de transacción sin efectos parciales
- [x] 5.2 Exponer `PUT /auth/change-password` con `@AllowPendingPasswordChange()` y marcar con el mismo decorador `POST /auth/logout`; verificar con tests del controlador que usa `req.user` y `req.sessionId`, y un test de flujo de guard + controlador con un usuario en cambio pendiente

## 6. Perfil del usuario

- [x] 6.1 Crear el validador `Forbidden` en `src/common/validators/` y `UpdateProfileDto` (`firstName` y `lastName` opcionales, `trim`, 1 a 100 caracteres; `username`, `password` y `email` con `Forbidden` y mensaje propio cada uno; exige al menos un campo editable); verificar con tests del DTO: cada campo prohibido produce su mensaje, cuerpo vacío es inválido, valores vacíos o de más de 100 caracteres son inválidos, y un campo prohibido junto a uno válido sigue siendo inválido
- [x] 6.2 Implementar `UsersService.getProfile` y `updateProfile` y las rutas `GET /users/me` (con `@AllowPendingPasswordChange()`) y `PUT /users/me` usando `@CurrentUser()`; `GET` incluye `mustChangePassword`; verificar con tests: perfil con nombre y apellido en null, edición completa, edición parcial que conserva el otro campo, y que no se devuelve `passwordHash`

## 7. Documentación e integración

- [x] 7.1 Escribir `docs/api/user-management.md` con todos los endpoints nuevos (cuerpos, ejemplos de respuesta y tabla de errores trazados al código) y flujo recomendado para el cliente; agregar notas en `docs/api/auth-and-registration.md` sobre `firstName`/`lastName` en `UserPublic`, el bloqueo 403 con `mustChangePassword` y el logout permitido; verificar que cada mensaje documentado existe en el código
- [x] 7.2 Actualizar `.agents/skills/requirements-compliance/SKILL.md` marcando el Módulo de Usuario como cubierto en backend y la nota sobre `AuthService.login`; verificar que el texto coincide con lo implementado
- [x] 7.3 Ejecutar `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` y `pnpm test`, aplicar la migración con `prisma migrate deploy` y recorrer contra la base real el flujo: registro, confirmar correo, olvidé contraseña, login con temporal, ruta bloqueada con 403, cambio de contraseña, login con la nueva y edición de perfil con rechazo de `username`; verificar que todo pasa y limpiar el usuario de prueba

## Workflow follow-up

- Abrir el PR en rama `feat/user-management` con descripción en español y título en Conventional Commits en inglés.
- Archivar el change con `/opsx:archive` después de mergear.
