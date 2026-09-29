# SkyPlan API — Registro, Confirmación de Correo y Login

Base URL: `https://<host>/api` (prefijo global `/api`, definido en `src/main.ts`).

Todas las respuestas, exitosas o de error, tienen este sobre:

```json
{
  "status": 200,
  "message": "texto legible en español",
  "data": {}
}
```

- `status`: código HTTP (duplicado también en el status line de la respuesta).
- `message`: siempre en español, apto para mostrar directo al usuario.
- `data`: `null` en la mayoría de errores; en validaciones de `class-validator` puede venir
  como arreglo de strings en vez de un solo string.

Todos los endpoints de este documento son **públicos** (no requieren header de sesión).

---

## 1. Registro — `POST /api/users`

Crea la cuenta y dispara el correo con el código de confirmación (no confirma automáticamente).

### Body (JSON)

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | string | formato email válido, máx. 255 caracteres |
| `username` | string | 3–50 caracteres, solo letras, números, `.`, `_`, `-` |
| `password` | string | 8–72 caracteres, al menos 1 minúscula, 1 mayúscula y 1 dígito |
| `passwordConfirmation` | string | debe ser idéntico a `password` |

```json
{
  "email": "user@example.com",
  "username": "user123",
  "password": "Passw0rd!",
  "passwordConfirmation": "Passw0rd!"
}
```

### Respuesta exitosa — `201 Created`

```json
{
  "status": 201,
  "message": "Usuario registrado exitosamente",
  "data": {
    "id": 1,
    "email": "user@example.com",
    "username": "user123",
    "emailConfirmed": false,
    "createdAt": "2026-09-18T02:00:00.000Z"
  }
}
```

`data` nunca incluye el password ni el código de confirmación.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | Body inválido (formato, longitud, `passwordConfirmation` no coincide) | detalle de `class-validator`, ej. `"el password debe contener al menos una minúscula, una mayúscula y un número"` |
| 409 | Email o username ya registrados | `"Ya existe un usuario registrado con ese correo"` (o `nombre de usuario`, o ambos) |

---

## 2. Confirmación de correo — `POST /api/users/confirm-email`

El código llega por correo tras el registro (o el reenvío del punto 3). Tiene 5 caracteres
alfanuméricos, se normaliza a mayúsculas automáticamente, expira en **30 minutos** y admite
máximo **5 intentos fallidos**.

### Body (JSON)

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | string | formato email válido, máx. 255 caracteres |
| `code` | string | 5 caracteres alfanuméricos (se convierte a mayúsculas antes de validar) |

```json
{
  "email": "user@example.com",
  "code": "A1B2C"
}
```

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Correo confirmado exitosamente",
  "data": {
    "id": 1,
    "email": "user@example.com",
    "username": "user123",
    "emailConfirmed": true,
    "createdAt": "2026-09-18T02:00:00.000Z"
  }
}
```

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | Email inexistente, sin código activo, código vencido o código incorrecto | `"Código de confirmación inválido o expirado"` (mensaje genérico a propósito: no revela cuál de esos casos ocurrió) |
| 409 | El correo ya estaba confirmado | `"El correo ya está confirmado"` |
| 429 | Se agotaron los 5 intentos fallidos del código activo | `"Demasiados intentos fallidos. Solicita un nuevo código de confirmación."` |

---

## 3. Reenviar código de confirmación — `POST /api/users/resend-confirmation`

Útil si el código expiró o el correo no llegó.

### Body (JSON)

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | string | formato email válido, máx. 255 caracteres |

```json
{
  "email": "user@example.com"
}
```

### Respuesta — `200 OK` (siempre, exista o no el correo)

```json
{
  "status": 200,
  "message": "Si el correo está registrado y aún no ha sido confirmado, se envió un nuevo código de confirmación",
  "data": {
    "email": "user@example.com"
  }
}
```

Este endpoint responde igual si el correo no existe (para no filtrar qué correos están
registrados). El único error posible:

| Status | Cuándo | `message` |
|---|---|---|
| 409 | El correo existe y ya estaba confirmado | `"El correo ya está confirmado"` |

---

## 4. Login — `POST /api/auth/login`

Requiere que el correo ya esté confirmado. Devuelve un token de sesión opaco que debe
guardarse y enviarse en cada request autenticada.

### Body (JSON)

| Campo | Tipo | Reglas |
|---|---|---|
| `identifier` | string | email o username, 3–255 caracteres |
| `password` | string | 1–72 caracteres |

```json
{
  "identifier": "user@example.com",
  "password": "Passw0rd!"
}
```

`identifier` acepta email o username indistintamente: si contiene `@` se busca por email, si no
por username.

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Sesión iniciada exitosamente",
  "data": {
    "token": "a1b2c3d4e5f6...",
    "expiresAt": "2026-10-18T02:00:00.000Z",
    "mustChangePassword": false,
    "user": {
      "id": 1,
      "email": "user@example.com",
      "username": "user123",
      "emailConfirmed": true,
      "createdAt": "2026-09-18T02:00:00.000Z"
    }
  }
}
```

**Campos clave para el cliente:**
- `token`: guardarlo (ej. secure storage) y mandarlo en el header `Authorization: Bearer <token>`
  en cada endpoint protegido.
- `expiresAt`: expiración absoluta de la sesión (30 días desde el login). La sesión también
  expira por inactividad antes de eso si no se usa.
- `mustChangePassword`: si es `true`, la app debe forzar la pantalla de cambio de contraseña
  antes de permitir cualquier otra acción (típico tras una contraseña temporal asignada por
  recuperación de cuenta — flujo aún no implementado en este backend).

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | Body inválido (campos faltantes o fuera de longitud) | detalle de `class-validator` |
| 401 | Usuario inexistente o password incorrecto | `"Credenciales inválidas"` (mismo mensaje para ambos casos, a propósito) |
| 403 | Cuenta inactiva | `"Tu cuenta está inactiva"` |
| 403 | Correo aún no confirmado | `"Debes confirmar tu correo antes de iniciar sesión"` |

---

## 5. Logout — `POST /api/auth/logout`

**Requiere autenticación.** Header obligatorio:

```
Authorization: Bearer <token>
```

Sin body.

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Sesión cerrada exitosamente",
  "data": null
}
```

Es idempotente: llamarlo dos veces con el mismo token, o con un token ya vencido, sigue
respondiendo `200`.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 401 | Falta el header `Authorization`, token inválido o sesión expirada | mensaje del guard de sesión |

---

## Flujo recomendado para el cliente (Flutter)

1. `POST /api/users` → mostrar pantalla "revisa tu correo".
2. `POST /api/users/confirm-email` con el código que el usuario ingresa.
   - Si expira o no llega, ofrecer botón "reenviar código" → `POST /api/users/resend-confirmation`.
3. `POST /api/auth/login` una vez confirmado el correo → guardar `token` y `expiresAt`.
   - Si `mustChangePassword` es `true`, forzar cambio de contraseña antes de continuar
     (endpoint de cambio de password aún pendiente de implementar).
4. Enviar `Authorization: Bearer <token>` en cada request subsecuente.
5. `POST /api/auth/logout` al cerrar sesión.
