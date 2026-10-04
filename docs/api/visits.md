# SkyPlan API — Visitas (Ubicaciones)

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

**Todos los endpoints de este documento requieren autenticación.** Header obligatorio en cada
request:

```
Authorization: Bearer <token>
```

(obtenido en `POST /api/auth/login`, ver `docs/api/auth-and-registration.md`). Sin ese header,
o con un token inválido/expirado, cualquier endpoint responde `401` con `"No autenticado"`.

Cada visita pertenece al usuario autenticado — no es posible ver, editar ni actuar sobre una
visita de otro usuario (responde `404`, no `403`, para no filtrar si el ID existe).

---

## El objeto `Visit`

Forma que devuelven todos los endpoints de este documento, salvo el detalle (`GET /:id`), que
además agrega `activities`:

```json
{
  "id": 10,
  "name": "Antigua Guatemala",
  "latitude": 14.5586,
  "longitude": -90.7295,
  "date": "2026-09-28",
  "status": "PLANNED",
  "temperature": 22.4,
  "precipitation": 0.2,
  "humidity": 71,
  "atmosphericPressure": 1013.4,
  "cloudCover": 85,
  "windSpeed": 12.5,
  "weatherCode": 61,
  "weatherUpdate": "2026-09-20T12:00:00.000Z",
  "createdAt": "2026-09-20T12:00:00.000Z"
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `id` | number | |
| `name` | string | |
| `latitude` | number | -90 a 90 |
| `longitude` | number | -180 a 180 |
| `date` | string | `"YYYY-MM-DD"`, sin hora |
| `status` | string | `"PLANNED"` \| `"COMPLETED"` \| `"CANCELLED"` — ver sección de estados abajo |
| `temperature` | number \| null | °C |
| `precipitation` | number \| null | mm |
| `humidity` | number \| null | % |
| `atmosphericPressure` | number \| null | hPa |
| `cloudCover` | number \| null | % de nubosidad |
| `windSpeed` | number \| null | km/h |
| `weatherCode` | number \| null | código WMO del clima (0 despejado, 51-57 llovizna, 61-67 lluvia, 71-77 nieve, etc.) |
| `weatherUpdate` | string (ISO datetime) \| null | última vez que se consultó/actualizó el clima |
| `createdAt` | string (ISO datetime) | |

Los ocho campos de clima (temperatura, precipitación, humedad, presión, nubosidad, viento, código y `weatherUpdate`) vienen todos `null` juntos cuando la fecha de la visita está a más
de 10 días — ver la sección "Clima" más abajo.

### Estados (`status`)

| Valor | Significado | Cómo se llega |
|---|---|---|
| `PLANNED` | Estado inicial de toda visita nueva | valor por defecto al crear |
| `COMPLETED` | El usuario marcó la visita como realizada | `PATCH /:id/complete` |
| `CANCELLED` | El usuario canceló la visita sin eliminarla | `PATCH /:id/cancel` |

Una visita que no está `PLANNED` queda **congelada**: no puede editarse (`PATCH /:id` la
rechaza con `400`) ni volver a cambiar de estado (`complete`/`cancel` sobre ella también
devuelven `400`). Cancelar o eliminar (`DELETE /:id`) son cosas distintas: cancelar la deja
visible en las listas con `status: "CANCELLED"`; eliminar la oculta por completo (soft-delete).

### Clima

Al crear o editar una visita (cambiando fecha o coordenadas), el backend consulta el
pronóstico de Open-Meteo para esa fecha y ubicación:

- Si la fecha está dentro de los próximos 10 días, los campos de clima se llenan de una vez.
- Si está más allá de 10 días, quedan en `null` y el mensaje de la respuesta lo indica
  explícitamente (ver cada endpoint abajo). **No hace falta que el cliente vuelva a pedir el
  clima**: una tarea programada en el backend revisa cada 6 horas todas las visitas `PLANNED`
  dentro de la ventana de 10 días y llena/actualiza sus campos de clima automáticamente a medida que
  la fecha se acerca. El cliente solo necesita volver a pedir la visita (`GET /:id` o
  `GET /`) para ver el clima actualizado; no hay ninguna acción que el cliente deba disparar.
- Cuando el clima cambia, el backend también reevalúa las actividades al aire libre de la
  visita y, si alguna deja de ser viable (o vuelve a serlo), avisa por WebSocket y lo deja en
  `GET /api/notifications` — ver `docs/api/notifications.md`.
- Una falla temporal del proveedor de clima nunca borra un dato de clima que la visita ya
  tenía — en el peor caso, simplemente no se actualiza en esa corrida.

---

## 1. Crear visita — `POST /api/visits`

### Body (JSON)

| Campo | Tipo | Reglas |
|---|---|---|
| `name` | string | 1–255 caracteres |
| `latitude` | number | -90 a 90 |
| `longitude` | number | -180 a 180 |
| `date` | string | formato `"YYYY-MM-DD"` |

```json
{
  "name": "Antigua Guatemala",
  "latitude": 14.5586,
  "longitude": -90.7295,
  "date": "2026-09-28"
}
```

### Respuesta exitosa — `201 Created`

```json
{
  "status": 201,
  "message": "Ubicación registrada exitosamente",
  "data": {
    "id": 10,
    "name": "Antigua Guatemala",
    "latitude": 14.5586,
    "longitude": -90.7295,
    "date": "2026-09-28",
    "status": "PLANNED",
    "temperature": 22.4,
    "precipitation": 0.2,
    "humidity": 71,
    "atmosphericPressure": 1013.4,
    "weatherUpdate": "2026-09-20T12:00:00.000Z",
    "createdAt": "2026-09-20T12:00:00.000Z"
  }
}
```

Si la fecha está a más de 10 días, `data` trae los 5 campos de clima en `null` y `message` es
en su lugar:

```
"Ubicación registrada. Los datos climáticos se cargarán cuando la fecha esté dentro de los próximos 10 días"
```

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | Body inválido (tipo, rango, formato de fecha) | detalle de `class-validator`, ej. `"la fecha debe tener el formato YYYY-MM-DD"` |
| 400 | `date` es una fecha pasada | `"La fecha de la visita no puede estar en el pasado"` |
| 409 | El usuario ya tiene una visita activa (no eliminada) en esa misma fecha | `"Ya tienes una ubicación registrada para esa fecha"` |

---

## 2. Listar visitas — `GET /api/visits`

Devuelve todas las visitas activas (no eliminadas) del usuario autenticado, ordenadas por
fecha ascendente. Incluye visitas en cualquier `status` (`PLANNED`, `COMPLETED`,
`CANCELLED`) — el cliente decide cómo agruparlas/filtrarlas en la UI.

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Ubicaciones obtenidas exitosamente",
  "data": [
    {
      "id": 10,
      "name": "Antigua Guatemala",
      "latitude": 14.5586,
      "longitude": -90.7295,
      "date": "2026-09-28",
      "status": "PLANNED",
      "temperature": 22.4,
      "precipitation": 0.2,
      "humidity": 71,
      "atmosphericPressure": 1013.4,
      "weatherUpdate": "2026-09-20T12:00:00.000Z",
      "createdAt": "2026-09-20T12:00:00.000Z"
    }
  ]
}
```

Sin resultados → `data: []`, no un error.

### Errores posibles

Ninguno específico de este endpoint (más allá de `401` por falta de autenticación).

---

## 3. Ver detalle de una visita — `GET /api/visits/:id`

Igual al objeto `Visit`, pero agrega su lista de actividades (ordenadas por hora de inicio).
Cada actividad tiene la misma forma que en `docs/api/activities.md`.

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Ubicación obtenida exitosamente",
  "data": {
    "id": 10,
    "name": "Antigua Guatemala",
    "latitude": 14.5586,
    "longitude": -90.7295,
    "date": "2026-09-28",
    "status": "PLANNED",
    "temperature": 22.4,
    "precipitation": 0.2,
    "humidity": 71,
    "atmosphericPressure": 1013.4,
    "cloudCover": 85,
    "windSpeed": 12.5,
    "weatherCode": 61,
    "weatherUpdate": "2026-09-20T12:00:00.000Z",
    "createdAt": "2026-09-20T12:00:00.000Z",
    "activities": [
      {
        "id": 5,
        "visitId": 10,
        "name": "Caminata",
        "description": "Cerro de la Cruz",
        "date": "2026-09-28",
        "startTime": "08:00",
        "endTime": "10:30",
        "type": "OUTDOOR",
        "state": { "id": 1, "name": "planned" },
        "isViable": true,
        "viabilityCheckedAt": "2026-09-20T12:00:00.000Z",
        "completedAt": null,
        "weatherConditions": [{ "id": 3, "name": "cloudy" }]
      }
    ]
  }
}
```

`activities` solo incluye actividades activas (no eliminadas). Sin actividades → `[]`.
`activity.state` es distinto de `visit.status`: es el estado de esa actividad puntual
(`planned` / `completed` / `cancelled`, en minúscula), no el de la visita.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 404 | El ID no existe, no pertenece al usuario, o la visita está eliminada | `"Ubicación no encontrada"` |

---

## 4. Editar visita — `PATCH /api/visits/:id`

Todos los campos son opcionales — solo se actualizan los que se envíen. Si `date` o
`latitude`/`longitude` cambian, el clima se vuelve a consultar (mismas reglas de la sección
"Clima" arriba); si solo cambia `name`, no se toca el clima existente.

### Body (JSON) — todos opcionales

| Campo | Tipo | Reglas |
|---|---|---|
| `name` | string | 1–255 caracteres |
| `latitude` | number | -90 a 90 |
| `longitude` | number | -180 a 180 |
| `date` | string | formato `"YYYY-MM-DD"` |

```json
{
  "date": "2026-09-30"
}
```

### Respuesta exitosa — `200 OK`

Mismo formato que crear. `message` es `"Ubicación actualizada exitosamente"`, o el mensaje de
clima pendiente si la nueva fecha/ubicación cae a más de 10 días.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | Body inválido | detalle de `class-validator` |
| 400 | La visita no está en estado `PLANNED` (ya fue finalizada o cancelada) | `"La visita ya fue finalizada"` o `"La visita está cancelada"` |
| 400 | La nueva `date` es una fecha pasada | `"La fecha de la visita no puede estar en el pasado"` |
| 404 | El ID no existe, no pertenece al usuario, o está eliminada | `"Ubicación no encontrada"` |
| 409 | Ya existe otra visita activa del usuario en la nueva fecha | `"Ya tienes una ubicación registrada para esa fecha"` |

---

## 5. Finalizar visita — `PATCH /api/visits/:id/complete`

Marca la visita como realizada (`status: "COMPLETED"`). Solo tiene sentido para una visita
cuya fecha ya llegó — es la acción de "ya hice esta visita", no una forma de planearla por
adelantado. Sin body.

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Visita finalizada exitosamente",
  "data": {
    "id": 10,
    "name": "Antigua Guatemala",
    "latitude": 14.5586,
    "longitude": -90.7295,
    "date": "2026-09-20",
    "status": "COMPLETED",
    "temperature": 22.4,
    "precipitation": 0.2,
    "humidity": 71,
    "atmosphericPressure": 1013.4,
    "weatherUpdate": "2026-09-20T12:00:00.000Z",
    "createdAt": "2026-09-10T12:00:00.000Z"
  }
}
```

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | La fecha de la visita todavía no llega | `"No puedes finalizar una visita cuya fecha aún no ha llegado"` |
| 400 | La visita ya está `COMPLETED` o `CANCELLED` | `"La visita ya fue finalizada"` o `"La visita está cancelada"` |
| 404 | El ID no existe, no pertenece al usuario, o está eliminada | `"Ubicación no encontrada"` |

---

## 6. Cancelar visita — `PATCH /api/visits/:id/cancel`

Marca la visita como cancelada (`status: "CANCELLED"`) sin eliminarla — sigue apareciendo en
`GET /api/visits`. Sus actividades que sigan en `planned` pasan a `cancelled` con ella. A diferencia de finalizar, no importa la fecha: se puede cancelar una
visita futura o pasada. Sin body.

### Respuesta exitosa — `200 OK`

Mismo formato que finalizar, con `"status": "CANCELLED"` y `message`:
`"Visita cancelada exitosamente"`.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | La visita ya está `COMPLETED` o `CANCELLED` | `"La visita ya fue finalizada"` o `"La visita está cancelada"` |
| 404 | El ID no existe, no pertenece al usuario, o está eliminada | `"Ubicación no encontrada"` |

---

## 7. Eliminar visita — `DELETE /api/visits/:id`

Soft-delete: la visita deja de aparecer en `GET /api/visits` y `GET /api/visits/:id`
(responde `404` después de esto), y sus actividades quedan igualmente ocultas en cascada.
No se puede deshacer desde la API.

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Ubicación eliminada exitosamente",
  "data": null
}
```

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 404 | El ID no existe, no pertenece al usuario, o ya estaba eliminada | `"Ubicación no encontrada"` |

---

## Flujo recomendado para el cliente (Flutter)

1. `POST /api/visits` para registrar una nueva ubicación/visita.
   - Si el mensaje indica clima pendiente, mostrar esa visita sin datos de clima (icono
     "pendiente") en vez de tratarlo como error.
2. `GET /api/visits` para la lista principal — filtrar/agrupar por `status` en el cliente
   (ej. pestañas "Planeadas" / "Completadas" / "Canceladas").
3. `GET /api/visits/:id` al entrar al detalle de una visita, para ver sus actividades.
4. `PATCH /api/visits/:id` para editar nombre, fecha o ubicación mientras siga `PLANNED`.
5. Cuando el usuario confirma que ya la realizó: `PATCH /api/visits/:id/complete` (la app debe
   ocultar o deshabilitar este botón si la fecha de la visita todavía no llegó, para evitar el
   error 400).
6. Si el usuario decide no ir: `PATCH /api/visits/:id/cancel`.
7. `DELETE /api/visits/:id` para quitarla por completo de la app.
8. El clima de una visita `PLANNED` puede cambiar solo, sin acción del usuario — conviene
   refrescar (`GET /api/visits` o `GET /api/visits/:id`) cada vez que la pantalla vuelve a
   primer plano, no solo cuando el usuario la crea o edita.
