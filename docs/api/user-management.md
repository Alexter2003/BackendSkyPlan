# SkyPlan API — Perfil, Recuperación y Cambio de Contraseña

Base URL: `https://<host>/api` (prefijo global `/api`, definido en `src/main.ts`).

Todas las respuestas, exitosas o de error, tienen el mismo sobre:

```json
{
  "status": 200,
  "message": "texto legible en español",
  "data": {}
}
```

- `status`: código HTTP (duplicado también en el status line de la respuesta).
- `message`: en español, apto para mostrar directo al usuario. En validaciones del body puede
  venir como **arreglo de strings** en vez de un solo string.
- `data`: `null` en los errores.

Los endpoints protegidos requieren el header `Authorization: Bearer <token>` (el token sale de
`POST /api/auth/login`, ver `auth-and-registration.md`).

---

## Cómo funciona la contraseña temporal

```
POST /auth/forgot-password  ──>  correo con contraseña temporal (30 min)
POST /auth/login (con la temporal) ──> 200, mustChangePassword = true
cualquier ruta protegida   ──>  403 "Debes cambiar tu contraseña antes de continuar"
PUT  /auth/change-password ──>  contraseña nueva, mustChangePassword = false
```

Mientras `mustChangePassword` sea `true`, **solo** responden con normalidad estas rutas:

| Ruta | Para qué |
|---|---|
| `PUT /api/auth/change-password` | Definir la contraseña propia |
| `POST /api/auth/logout` | Salir |
| `GET /api/users/me` | Leer el perfil y recuperar el estado si la app se reinició |

Todo lo demás (visitas, actividades, notificaciones, `PUT /api/users/me`...) responde `403`. El
canal de notificaciones en tiempo real (Socket.IO) también rechaza la conexión mientras el
cambio esté pendiente: conéctalo **después** de cambiar la contraseña.

Esto aplica también a las sesiones que el usuario ya tenía abiertas en otros dispositivos
cuando se emitió la temporal.

---

## 1. Recuperar contraseña — `POST /api/auth/forgot-password`

**Público** (no requiere sesión). Si el correo pertenece a una cuenta activa con el correo
confirmado, **reemplaza la contraseña actual** por una temporal aleatoria y la envía por correo.

### Body (JSON)

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | string | formato email válido, máx. 255 caracteres |

```json
{
  "email": "user@example.com"
}
```

### Respuesta — `200 OK` (siempre, para cualquier correo con formato válido)

```json
{
  "status": 200,
  "message": "Si el correo está registrado, enviamos una contraseña temporal",
  "data": null
}
```

El endpoint responde **exactamente igual** si el correo no existe, si la cuenta está inactiva o
sin confirmar, o si se pidió otra temporal hace menos de 5 minutos. No hay forma de saber desde
el cliente si el correo se envió: la pantalla debe decir algo como "Si el correo está
registrado, recibirás una contraseña temporal".

Detalles que conviene mostrar al usuario:
- La contraseña temporal tiene 12 caracteres (letras y números) y **expira en 30 minutos**.
- Solo se emite una nueva cada **5 minutos** por cuenta; pedirla antes devuelve el mismo `200`
  sin enviar nada.
- Al pedirla, la contraseña anterior **deja de funcionar** de inmediato.
- El correo llega con asunto `Your temporary SkyPlan password` (la plantilla está en inglés).
- Si el correo no llega, esperar 5 minutos y volver a pedirla.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | `email` ausente, con formato inválido o de más de 255 caracteres | detalle de `class-validator` (ej. `"email must be an email"`) |

---

## 2. Cambiar la contraseña (obligatorio con temporal) — `PUT /api/auth/change-password`

**Requiere autenticación.** Solo funciona cuando el usuario inició sesión con una contraseña
temporal (`mustChangePassword = true`). No es un "cambiar contraseña" voluntario: con la sesión
normal responde `403`.

### Body (JSON)

| Campo | Tipo | Reglas |
|---|---|---|
| `currentPassword` | string | la contraseña temporal recibida por correo, máx. 72 caracteres |
| `newPassword` | string | 8–72 caracteres, al menos 1 minúscula, 1 mayúscula y 1 dígito |
| `confirmNewPassword` | string | debe ser idéntico a `newPassword` |

```json
{
  "currentPassword": "Tmp9xKq2LmWz",
  "newPassword": "NewPassw0rd",
  "confirmNewPassword": "NewPassw0rd"
}
```

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Contraseña actualizada exitosamente",
  "data": null
}
```

Efectos:
- `mustChangePassword` pasa a `false`; ya se puede usar toda la API con **el mismo token**.
- Las **demás sesiones** del usuario (otros dispositivos) se cierran; la actual se conserva.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | Body inválido (falta un campo, `newPassword` débil o fuera de rango, `confirmNewPassword` distinto) | detalle de `class-validator`, ej. `"el newPassword debe contener al menos una minúscula, una mayúscula y un número"`, `"confirmNewPassword debe coincidir con newPassword"` |
| 400 | `currentPassword` no coincide con la contraseña vigente | `"La contraseña actual es incorrecta"` |
| 400 | `newPassword` igual a `currentPassword` | `"La nueva contraseña debe ser distinta de la actual"` |
| 401 | Falta el header `Authorization`, token inválido o sesión expirada | `"No autenticado"` |
| 403 | El usuario no tiene un cambio de contraseña pendiente | `"No tienes un cambio de contraseña pendiente"` |
| 403 | La temporal ya expiró | `"La contraseña temporal expiró. Cierra sesión y solicita una nueva"` |
| 403 | Cuenta inactiva | `"Tu cuenta está inactiva"` |

Si recibes el `403` de temporal expirada: cerrar sesión (`POST /api/auth/logout`) y volver a
`POST /api/auth/forgot-password`. Nótese que `POST /api/auth/login` **no** valida la expiración:
con una temporal vencida el login responde `200` con `mustChangePassword: true`, y recién
`change-password` la rechaza.

---

## 3. Bloqueo por cambio pendiente — respuesta de cualquier ruta protegida

Mientras `mustChangePassword` sea `true`, cualquier ruta protegida que no sea una de las tres
permitidas responde:

```json
{
  "status": 403,
  "message": "Debes cambiar tu contraseña antes de continuar",
  "data": null
}
```

El cliente debe manejar este `403` redirigiendo a la pantalla de cambio de contraseña, además
de usar el campo `mustChangePassword` del login.

---

## 4. Ver mi perfil — `GET /api/users/me`

**Requiere autenticación.** Sin body. Está permitido aunque el cambio de contraseña esté pendiente.

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Perfil obtenido exitosamente",
  "data": {
    "id": 1,
    "email": "user@example.com",
    "username": "user123",
    "firstName": "Ana",
    "lastName": "García",
    "emailConfirmed": true,
    "createdAt": "2026-09-18T02:00:00.000Z",
    "mustChangePassword": false
  }
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `firstName`, `lastName` | string \| null | `null` mientras el usuario no los haya definido |
| `mustChangePassword` | boolean | `true` si hay una contraseña temporal pendiente de cambiar |

`data` nunca incluye la contraseña ni su hash.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 401 | Falta el header `Authorization`, token inválido o sesión expirada | `"No autenticado"` |
| 403 | Cuenta inactiva | `"Tu cuenta está inactiva"` |

---

## 5. Editar mi perfil — `PUT /api/users/me`

**Requiere autenticación** y **no** está permitido mientras haya un cambio de contraseña
pendiente (responde el `403` del punto 3). Solo se pueden editar el nombre y el apellido.

### Body (JSON)

| Campo | Tipo | Reglas |
|---|---|---|
| `firstName` | string (opcional) | se recortan espacios; 1–100 caracteres |
| `lastName` | string (opcional) | se recortan espacios; 1–100 caracteres |

Hay que enviar **al menos uno** de los dos. Un campo omitido conserva su valor actual; no se
puede dejar un campo en blanco ni en `null` por esta vía.

```json
{
  "firstName": "Ana",
  "lastName": "García"
}
```

### Campos que se rechazan a propósito

Enviar cualquiera de estos campos, aunque vengan junto a campos válidos, responde `400` y **no
modifica nada**:

| Campo | `message` |
|---|---|
| `username` | `"El nombre de usuario no se puede modificar"` |
| `password` | `"La contraseña no se puede modificar desde el perfil; usa la recuperación de contraseña"` |
| `email` | `"El correo no se puede modificar"` |

### Respuesta exitosa — `200 OK`

Devuelve el perfil actualizado, con la misma forma que `GET /api/users/me`.

```json
{
  "status": 200,
  "message": "Perfil actualizado exitosamente",
  "data": {
    "id": 1,
    "email": "user@example.com",
    "username": "user123",
    "firstName": "Ana",
    "lastName": "García",
    "emailConfirmed": true,
    "createdAt": "2026-09-18T02:00:00.000Z",
    "mustChangePassword": false
  }
}
```

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | Se envió `username`, `password` o `email` | uno de los mensajes de la tabla de arriba (puede venir en un arreglo si se enviaron varios) |
| 400 | Cuerpo sin `firstName` ni `lastName` | `"Envía al menos firstName o lastName"` |
| 400 | Un campo vacío, solo espacios, `null`, no string o de más de 100 caracteres | `"firstName no puede estar vacío"`, `"firstName debe ser texto"`, `"firstName no puede exceder 100 caracteres"` (igual para `lastName`) |
| 400 | Cualquier otro campo no permitido | `"property <campo> should not exist"` (mensaje por defecto de validación, en inglés) |
| 401 | Falta el header `Authorization`, token inválido o sesión expirada | `"No autenticado"` |
| 403 | Cambio de contraseña pendiente | `"Debes cambiar tu contraseña antes de continuar"` |
| 403 | Cuenta inactiva | `"Tu cuenta está inactiva"` |

---

## Flujo recomendado para el cliente (Flutter)

**Olvidé mi contraseña**

1. Pantalla de login → "Olvidé mi contraseña" → pedir el correo.
2. `POST /api/auth/forgot-password` → mostrar siempre el mismo texto neutro (el backend no
   confirma si el correo existe).
3. El usuario copia la temporal del correo y la usa en el login normal
   (`POST /api/auth/login`).
4. Si `data.mustChangePassword` es `true`, ir a la pantalla de cambio de contraseña con dos
   campos para la nueva (contraseña y confirmación) y mandar `PUT /api/auth/change-password`
   con la temporal como `currentPassword`.
5. Al recibir `200`, continuar normalmente con el **mismo token**. Recién ahí conectar el canal
   de notificaciones.
6. Ante un `403` con `"La contraseña temporal expiró..."`: hacer logout y volver al paso 1.

**Si la app se reinicia con la sesión guardada:** llamar `GET /api/users/me`; si
`mustChangePassword` es `true`, volver a la pantalla de cambio de contraseña.

**Perfil**

1. `GET /api/users/me` para pintar nombre, apellido, usuario y correo.
2. `PUT /api/users/me` solo con `firstName` y/o `lastName`. `username`, correo y contraseña se
   muestran en solo lectura.
