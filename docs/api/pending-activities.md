# SkyPlan API — Actividades pendientes: pronóstico, probabilidad, cancelación inteligente y reagendado

Base URL: `https://<host>/api` (prefijo global `/api`, definido en `src/main.ts`).

Este documento cubre la pantalla de **pendientes**: listar las actividades próximas con su clima
proyectado y su probabilidad de realización, cancelar, reactivar y reagendar. Crear, editar,
completar y eliminar actividades, y el catálogo de condiciones climáticas, están en
`docs/api/activities.md`. El recorrido completo (visita, actividades, clima y avisos) está en
`docs/api/activities-flow.md`, y los avisos en tiempo real en `docs/api/notifications.md`.

Todas las respuestas, exitosas o de error, tienen este sobre:

```json
{
  "status": 200,
  "message": "texto legible en español",
  "data": {}
}
```

- `status`: código HTTP (duplicado también en el status line de la respuesta).
- `message`: en español, apto para mostrar directo al usuario. En errores de validación de
  `class-validator` puede venir como **arreglo de strings** en vez de un solo string.
- `data`: `null` en los errores.

**Todos los endpoints de este documento requieren autenticación.** Header obligatorio:

```
Authorization: Bearer <token>
```

(obtenido en `POST /api/auth/login`). Sin él, o con token inválido/expirado, responde `401` con
`"No autenticado"`.

Cada actividad pertenece a una visita del usuario autenticado. Una actividad o visita de otro
usuario responde `404`, nunca `403`.

**Validación estricta del body y la query:** el servidor rechaza con `400` cualquier propiedad que
no esté documentada aquí (por ejemplo `?foo=1` o `{ "reasn": "..." }`). Para ese caso el mensaje es
el estándar de `class-validator`, en inglés (`property foo should not exist`); los mensajes de
las reglas propias de cada campo sí están en español y aparecen en las tablas de abajo.

---

## El objeto `Activity`

Es la forma que devuelven `cancel`, `reactivate` y `reschedule`. El listado de próximas
(`GET /upcoming`) devuelve esta misma forma más `visit` y `forecast` (ver más abajo).

```json
{
  "id": 5,
  "visitId": 10,
  "name": "Caminata",
  "description": "Cerro de la Cruz",
  "date": "2026-11-03",
  "startTime": "15:00",
  "endTime": "17:00",
  "type": "OUTDOOR",
  "state": { "id": 1, "name": "planned" },
  "isViable": true,
  "viabilityCheckedAt": "2026-11-02T18:00:00.000Z",
  "probability": 80,
  "probabilityBand": "GREEN",
  "completedAt": null,
  "cancelReason": null,
  "cancelledAt": null,
  "weatherConditions": [{ "id": 1, "name": "sunny" }]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `id` | number | |
| `visitId` | number | visita (ubicación + día) a la que pertenece. Cambia si se reagenda a otro día |
| `name` / `description` | string | |
| `date` | string | `"YYYY-MM-DD"`. Es la fecha de su visita; **no se edita directamente**, se cambia reagendando |
| `startTime` / `endTime` | string | `"HH:mm"`, hora local de la ubicación |
| `type` | string | `"OUTDOOR"` (al aire libre) \| `"INDOOR"` (interior) |
| `state` | object | `{id, name}`. `name`: `"planned"` \| `"completed"` \| `"cancelled"` (la canceló el usuario) \| `"cancelled_by_system"` (la canceló el sistema por el clima) |
| `isViable` | boolean \| null | lo calcula el sistema con el clima de las 12:00 de la visita. `null` = todavía no se sabe (fecha a más de 10 días) |
| `viabilityCheckedAt` | string (ISO) \| null | última evaluación de `isViable` |
| `probability` | number \| null | entero 0–100. **Idoneidad** del clima para la franja de la actividad (no es una probabilidad meteorológica). `null` = todavía no hay pronóstico horario de su franja |
| `probabilityBand` | string \| null | semáforo: `"GREEN"` (70 o más) \| `"YELLOW"` (40 a 69) \| `"RED"` (menos de 40). `null` si `probability` es `null` |
| `completedAt` | string (ISO) \| null | cuándo se marcó como completada |
| `cancelReason` | string \| null | solo si está cancelada. Si canceló el usuario, el motivo que envió (puede ser `null`); si canceló el sistema, la explicación con la probabilidad y el pronóstico |
| `cancelledAt` | string (ISO) \| null | cuándo se canceló. Vuelve a `null` al reactivarla o reagendarla |
| `weatherConditions` | array | condiciones climáticas elegidas, `{id, name}` |

### Cómo se pinta cada estado

| `state.name` | Qué significa | Acciones que ofrecer |
|---|---|---|
| `planned` | pendiente | completar, cancelar, reagendar |
| `completed` | la hizo | ninguna (queda congelada) |
| `cancelled` | la canceló el usuario | reactivar, reagendar |
| `cancelled_by_system` | la canceló el sistema por mal clima en la última hora | reactivar, reagendar |

Usa `probabilityBand` para el color y `state.name` para distinguir las cuatro situaciones.

---

## Probabilidad de realización (`probability`)

Se calcula en el backend (no en la app) con el pronóstico **hora por hora** de la visita, para
la franja exacta de la actividad (`startTime`–`endTime`):

1. Por cada hora de la franja hay un puntaje:
   - **0** si no se cumple alguna condición de cielo o viento elegida (`sunny`, `clear`,
     `partly_cloudy`, `cloudy`, `windy`).
   - Si se cumplen, el **factor de precipitación**: `1 − p/100` cuando el usuario **no** eligió
     `drizzle`, `rainy` ni `snowy`, o `p/100` cuando eligió alguna (`p` = probabilidad de
     precipitación de esa hora, en %).
2. `probability` es el promedio de las horas, ×100 y redondeado.

Ejemplo: actividad de 15:00 a 17:00 que pide `sunny`, con probabilidad de precipitación de 10% y
30% en esas dos horas → `(0.9 + 0.7) / 2 = 0.8` → `probability: 80`, banda `GREEN`.

Casos especiales:

- **`INDOOR`**: `100`, salvo que alguna hora de la franja tenga nieve o viento de 30 km/h o más;
  entonces `70`. Si todavía no hay pronóstico, también `100`.
- **`OUTDOOR` sin pronóstico** de alguna hora de la franja (la fecha está a más de 10 días o el
  proveedor de clima no respondió): `probability` y `probabilityBand` son `null`. Nunca se
  inventa un valor; muestra "pendiente de validar".
- Se recalcula sola cuando cambia el pronóstico (cada 6 horas) y cada vez que la actividad se
  crea, edita, reactiva o reagenda.

> `isViable` y `probability` pueden diferir un poco: `isViable` usa el clima de las 12:00 de la
> visita (el mismo que bloquea crear una actividad incompatible) y `probability` usa las horas de
> la actividad. Usa `probability`/`probabilityBand` como indicador principal.

---

## Cancelación automática por el sistema

Un proceso del backend corre **cada 15 minutos** (no se evalúa al consultar el listado: un `GET`
nunca cambia datos). Para cada actividad `OUTDOOR` en `planned`:

- **Antes de la última hora** el sistema solo avisa (notificación `ACTIVITY_NOT_VIABLE`); **no
  cancela**. El usuario tiene tiempo de decidir.
- Si faltan **60 minutos o menos** para `startTime` (hora local de la ubicación), vuelve a pedir
  el pronóstico actual y recalcula. Si `probability` es **menor que 30**, la cancela:
  - `state.name`: `"cancelled_by_system"`.
  - `cancelledAt`: el momento de la cancelación.
  - `cancelReason`: texto en español con la probabilidad y el pronóstico de cada hora, por
    ejemplo: `"Cancelada automáticamente: la probabilidad de realización bajó a 10% (mínimo 30%). Pronóstico de la franja: 15:00 (90% de precipitación, 5 km/h de viento, 5% de nubosidad); 16:00 (90% de precipitación, 5 km/h de viento, 5% de nubosidad)"`.
  - Manda el aviso `ACTIVITY_AUTO_CANCELLED` (ver `docs/api/notifications.md`).
- **Nunca cancela sin datos**: si no consigue un pronóstico, la deja como está.
- **No toca** las `INDOOR`, ni las que el usuario ya reactivó, ni las que ya empezaron.
- Es **siempre reversible**: `PATCH /api/activities/:id/reactivate` o `/reschedule`.
- Una actividad cancelada (por el usuario o por el sistema) **no ocupa horario**: se puede crear
  otra en ese espacio.

---

## 1. Actividades próximas — `GET /api/activities/upcoming`

**Requiere autenticación.** Lista las actividades de **todas** las ubicaciones del usuario, desde
hoy en adelante (el "hoy" es el de Guatemala), con el clima proyectado de cada una. Por defecto
incluye actividades en cualquier estado, para poder distinguir pendientes, completadas,
canceladas por el usuario y canceladas por el sistema. Las de visitas eliminadas no aparecen.

### Query params (todos opcionales, se combinan)

| Parámetro | Tipo | Reglas | Notas |
|---|---|---|---|
| `days` | entero | 1 a 365 | proximidad: desde hoy hasta hoy + `days` días (inclusive). Sin él, no hay límite superior |
| `visitId` | entero | | solo una ubicación |
| `probabilityMin` | entero | 0 a 100 | `probability >= probabilityMin`. Las de `probability: null` quedan fuera si se usa este o `probabilityMax` |
| `probabilityMax` | entero | 0 a 100 | `probability <= probabilityMax`. No puede ser menor que `probabilityMin` |
| `state` | string | `planned` \| `completed` \| `cancelled` \| `cancelled_by_system` | sin él, todos los estados |
| `sortBy` | string | `date` \| `probability` | por defecto `date` (fecha y hora de inicio). Con `probability`, las `null` van al final y el desempate es por fecha |
| `order` | string | `asc` \| `desc` | por defecto `asc` |
| `page` | entero | desde 1 | por defecto `1` |
| `limit` | entero | 1 a 100 | por defecto `20` |

### Ejemplo de request

```
GET /api/activities/upcoming?days=7&probabilityMin=40&sortBy=probability&order=desc&page=1&limit=20
Authorization: Bearer <token>
```

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Actividades próximas obtenidas exitosamente",
  "data": {
    "items": [
      {
        "id": 5,
        "visitId": 10,
        "name": "Caminata",
        "description": "Cerro de la Cruz",
        "date": "2026-11-03",
        "startTime": "15:00",
        "endTime": "17:00",
        "type": "OUTDOOR",
        "state": { "id": 1, "name": "planned" },
        "isViable": true,
        "viabilityCheckedAt": "2026-11-02T18:00:00.000Z",
        "probability": 80,
        "probabilityBand": "GREEN",
        "completedAt": null,
        "cancelReason": null,
        "cancelledAt": null,
        "weatherConditions": [{ "id": 1, "name": "sunny" }],
        "visit": {
          "id": 10,
          "name": "Antigua Guatemala",
          "latitude": 14.5586,
          "longitude": -90.7295,
          "date": "2026-11-03",
          "status": "PLANNED"
        },
        "forecast": [
          {
            "time": "2026-11-03T15:00",
            "weatherCode": 0,
            "precipitation": 0,
            "cloudCover": 5,
            "windSpeed": 5,
            "precipitationProbability": 10
          },
          {
            "time": "2026-11-03T16:00",
            "weatherCode": 1,
            "precipitation": 0,
            "cloudCover": 20,
            "windSpeed": 8,
            "precipitationProbability": 30
          }
        ]
      },
      {
        "id": 7,
        "visitId": 12,
        "name": "Museo de arte",
        "description": "Recorrido guiado",
        "date": "2026-11-05",
        "startTime": "10:00",
        "endTime": "11:30",
        "type": "INDOOR",
        "state": { "id": 1, "name": "planned" },
        "isViable": true,
        "viabilityCheckedAt": null,
        "probability": 100,
        "probabilityBand": "GREEN",
        "completedAt": null,
        "cancelReason": null,
        "cancelledAt": null,
        "weatherConditions": [{ "id": 3, "name": "cloudy" }],
        "visit": {
          "id": 12,
          "name": "Ciudad de Guatemala",
          "latitude": 14.6349,
          "longitude": -90.5069,
          "date": "2026-11-05",
          "status": "PLANNED"
        },
        "forecast": null
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 2
  }
}
```

`data`:

| Campo | Tipo | Notas |
|---|---|---|
| `items` | array | actividades de la página |
| `page` / `limit` | number | los valores aplicados (con sus defaults) |
| `total` | number | total de actividades que cumplen los filtros (para calcular páginas) |

Cada elemento de `items` es un `Activity` (ver arriba) más:

| Campo | Tipo | Notas |
|---|---|---|
| `visit` | object | ubicación de la actividad: `id`, `name`, `latitude`, `longitude` (number), `date` (`"YYYY-MM-DD"`), `status` (`"PLANNED"` \| `"COMPLETED"` \| `"CANCELLED"`) |
| `forecast` | array \| null | clima proyectado de **las horas de la franja** de la actividad. `null` si todavía no hay pronóstico horario de su visita |

Cada hora de `forecast`:

| Campo | Tipo | Notas |
|---|---|---|
| `time` | string | `"YYYY-MM-DDTHH:00"`, hora **local** de la ubicación (sin zona) |
| `weatherCode` | number | código WMO del clima (0 despejado, 61 lluvia, etc.) |
| `precipitation` | number | mm |
| `cloudCover` | number | % |
| `windSpeed` | number | km/h |
| `precipitationProbability` | number | % |

Una lista vacía responde `200` con `"items": []` y `"total": 0`.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | `days` no entero / menor que 1 / mayor que 365 | `"days debe ser un número entero"` / `"days debe ser al menos 1"` / `"days no puede ser mayor a 365"` |
| 400 | `visitId` no entero | `"visitId debe ser un número entero"` |
| 400 | `probabilityMin` / `probabilityMax` no entero o fuera de 0–100 | `"probabilityMin debe ser un número entero"` / `"probabilityMin debe estar entre 0 y 100"` (igual para `probabilityMax`) |
| 400 | `probabilityMin` mayor que `probabilityMax` | `"probabilityMin no puede ser mayor que probabilityMax"` |
| 400 | `state` desconocido | `"state debe ser uno de: planned, completed, cancelled, cancelled_by_system"` |
| 400 | `sortBy` desconocido | `"sortBy debe ser uno de: date, probability"` |
| 400 | `order` desconocido | `"order debe ser asc o desc"` |
| 400 | `page` no entero / menor que 1 | `"page debe ser un número entero"` / `"page debe ser al menos 1"` |
| 400 | `limit` no entero / menor que 1 / mayor que 100 | `"limit debe ser un número entero"` / `"limit debe ser al menos 1"` / `"limit no puede ser mayor a 100"` |
| 400 | parámetro que no existe | `"property <nombre> should not exist"` (mensaje estándar, en inglés) |
| 401 | Sin token o token inválido | `"No autenticado"` |
| 404 | `visitId` no existe o no es del usuario | `"Ubicación no encontrada"` |

---

## 2. Cancelar actividad — `PATCH /api/activities/:id/cancel`

**Requiere autenticación.** El usuario decide que ya no la va a realizar. Se puede hacer en
cualquier momento mientras la actividad siga `planned` (por ejemplo, tras el aviso de que dejó de
ser viable). Queda registrada la fecha y, si lo envía, el motivo.

### Path params

| Param | Tipo | Notas |
|---|---|---|
| `id` | entero | id de la actividad |

### Body (JSON) — opcional

| Campo | Tipo | Reglas |
|---|---|---|
| `reason` | string | opcional. 1 a 500 caracteres |

El body completo es opcional: llamar sin body también es válido.

```json
{
  "reason": "Me enfermé"
}
```

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Actividad cancelada exitosamente",
  "data": {
    "id": 5,
    "visitId": 10,
    "name": "Caminata",
    "description": "Cerro de la Cruz",
    "date": "2026-11-03",
    "startTime": "15:00",
    "endTime": "17:00",
    "type": "OUTDOOR",
    "state": { "id": 3, "name": "cancelled" },
    "isViable": true,
    "viabilityCheckedAt": "2026-11-02T18:00:00.000Z",
    "probability": 80,
    "probabilityBand": "GREEN",
    "completedAt": null,
    "cancelReason": "Me enfermé",
    "cancelledAt": "2026-11-02T21:15:00.000Z",
    "weatherConditions": [{ "id": 1, "name": "sunny" }]
  }
}
```

Sin `reason`, `cancelReason` viene `null`.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | `reason` vacío | `"el motivo no puede estar vacío"` |
| 400 | `reason` de más de 500 caracteres | `"el motivo no puede superar los 500 caracteres"` |
| 400 | `reason` no es texto, o hay otra propiedad en el body | mensaje estándar de validación (en inglés) |
| 400 | La actividad ya está completada | `"La actividad ya fue completada"` |
| 400 | La actividad ya está cancelada (por el usuario o por el sistema) | `"La actividad está cancelada"` |
| 401 | Sin token o token inválido | `"No autenticado"` |
| 404 | No existe o no es del usuario | `"Actividad no encontrada"` |

---

## 3. Reactivar actividad — `PATCH /api/activities/:id/reactivate`

**Requiere autenticación.** Revierte una cancelación, sea del usuario (`cancelled`) o del sistema
(`cancelled_by_system`). Sin body.

- **No se rechaza por el clima**, aunque el pronóstico siga siendo malo: la decisión es del
  usuario. Si quieres preguntarle "el clima sigue mal, ¿seguro?", esa confirmación la hace la app
  **antes** de llamar; el backend no pide ninguna bandera de confirmación.
- La actividad vuelve a `planned`, se limpian `cancelReason` y `cancelledAt`, y se recalculan
  `isViable` y `probability`.
- **El sistema ya no la cancelará automáticamente** (hasta que el usuario cambie su horario o la
  reagende).
- Se revalida que su horario siga libre, porque una cancelada no ocupa lugar y otra actividad
  pudo tomarlo.

### Path params

| Param | Tipo | Notas |
|---|---|---|
| `id` | entero | id de la actividad |

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Actividad reactivada exitosamente",
  "data": {
    "id": 5,
    "visitId": 10,
    "name": "Caminata",
    "description": "Cerro de la Cruz",
    "date": "2026-11-03",
    "startTime": "15:00",
    "endTime": "17:00",
    "type": "OUTDOOR",
    "state": { "id": 1, "name": "planned" },
    "isViable": false,
    "viabilityCheckedAt": "2026-11-03T20:45:00.000Z",
    "probability": 10,
    "probabilityBand": "RED",
    "completedAt": null,
    "cancelReason": null,
    "cancelledAt": null,
    "weatherConditions": [{ "id": 1, "name": "sunny" }]
  }
}
```

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | La actividad no está cancelada | `"La actividad no está cancelada"` |
| 400 | La visita ya no está planificada | `"La visita ya fue finalizada"` / `"La visita está cancelada"` |
| 400 | Su hora de fin ya pasó (hora local de la ubicación) | `"La actividad ya terminó, reagéndala para otra fecha u horario"` |
| 401 | Sin token o token inválido | `"No autenticado"` |
| 404 | No existe o no es del usuario | `"Actividad no encontrada"` |
| 409 | Otra actividad ocupa ahora su horario | `"El horario se cruza con la actividad 'Almuerzo' (15:00–17:00)"` |

---

## 4. Reagendar actividad — `PATCH /api/activities/:id/reschedule`

**Requiere autenticación.** Mueve **una** actividad a otra fecha y horario sin tocar las demás de
su visita.

- La fecha vive en la visita. El backend usa la visita del usuario en esa fecha si existe (tiene
  que estar en las **mismas coordenadas**); si no existe, **crea una** con el mismo nombre y
  coordenadas y pide su pronóstico. La visita de origen no se borra aunque quede sin actividades.
- Se revalida lo mismo que al crear: cruce de horario en la visita destino y, para `OUTDOOR`,
  compatibilidad con el pronóstico del día destino.
- Si la fecha destino no tiene pronóstico todavía (a más de 10 días), se acepta y `isViable` y
  `probability` quedan en `null` (con el mensaje de validación pendiente).
- Si la actividad estaba cancelada (por el usuario o por el sistema), **se reactiva** al
  reagendar, y se limpian sus datos de cancelación.
- Cambiar el horario o reagendar limpia la marca de "reactivada": la nueva franja vuelve a estar
  sujeta a la cancelación automática.

### Path params

| Param | Tipo | Notas |
|---|---|---|
| `id` | entero | id de la actividad |

### Body (JSON) — los tres campos son obligatorios

| Campo | Tipo | Reglas |
|---|---|---|
| `date` | string | `"YYYY-MM-DD"`, fecha real del calendario (no `2026-02-31`). No puede ser anterior a hoy |
| `startTime` | string | `"HH:mm"` en 24 h (`00:00` a `23:59`) |
| `endTime` | string | `"HH:mm"` en 24 h. Debe ser posterior a `startTime` |

```json
{
  "date": "2026-11-05",
  "startTime": "14:00",
  "endTime": "16:00"
}
```

### Respuesta exitosa — `200 OK`

`message`: `"Actividad reagendada exitosamente"`.

```json
{
  "status": 200,
  "message": "Actividad reagendada exitosamente",
  "data": {
    "id": 5,
    "visitId": 11,
    "name": "Caminata",
    "description": "Cerro de la Cruz",
    "date": "2026-11-05",
    "startTime": "14:00",
    "endTime": "16:00",
    "type": "OUTDOOR",
    "state": { "id": 1, "name": "planned" },
    "isViable": true,
    "viabilityCheckedAt": "2026-11-03T20:50:00.000Z",
    "probability": 85,
    "probabilityBand": "GREEN",
    "completedAt": null,
    "cancelReason": null,
    "cancelledAt": null,
    "weatherConditions": [{ "id": 1, "name": "sunny" }]
  }
}
```

Si la fecha destino está fuera de la ventana de pronóstico, la respuesta es `200` con
`message`: `"Actividad guardada. Se validará contra el clima cuando la fecha esté dentro de los próximos 10 días"`
y `isViable`, `viabilityCheckedAt`, `probability` y `probabilityBand` en `null`.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | `date` con formato inválido | `"la fecha debe tener el formato YYYY-MM-DD"` |
| 400 | `date` que no existe en el calendario (ej. `2026-02-31`) | `"La fecha no es válida"` |
| 400 | `startTime` / `endTime` con formato inválido | `"la hora debe tener el formato HH:mm"` |
| 400 | `startTime` no es anterior a `endTime` | `"La hora de inicio debe ser anterior a la hora de fin"` |
| 400 | `date` anterior a hoy | `"La fecha de la visita no puede estar en el pasado"` |
| 400 | La actividad ya está completada | `"La actividad ya fue completada"` |
| 400 | La visita destino ya no está planificada | `"La visita ya fue finalizada"` / `"La visita está cancelada"` |
| 400 | Falta un campo, o hay propiedades que no existen | mensaje estándar de validación (en inglés) |
| 401 | Sin token o token inválido | `"No autenticado"` |
| 404 | No existe o no es del usuario | `"Actividad no encontrada"` |
| 409 | El horario se cruza con otra actividad de la visita destino | `"El horario se cruza con la actividad 'Almuerzo' (15:00–17:00)"` |
| 409 | Ya hay una visita ese día en **otra** ubicación (solo se permite una visita por día) | `"Ya tienes una ubicación registrada para esa fecha en otro lugar"` |
| 422 | Actividad `OUTDOOR` y el pronóstico del día destino es incompatible con sus condiciones | `"No se puede guardar la actividad: para el 2026-11-05 el pronóstico indica lluvia, nublado (4.2 mm, 95% de nubosidad, 8 km/h de viento), incompatible con: soleado"` |

---

## Aviso en tiempo real: `ACTIVITY_AUTO_CANCELLED`

Cuando el sistema cancela una actividad, el dueño recibe una notificación (se guarda siempre, y se
emite por WebSocket si está conectado). Reutiliza el evento `activity.viability_changed`:

```json
{
  "notificationId": 12,
  "activityId": 5,
  "visitId": 10,
  "activityName": "Caminata",
  "type": "ACTIVITY_AUTO_CANCELLED",
  "isViable": false,
  "title": "Actividad cancelada automáticamente",
  "message": "La actividad 'Caminata' se canceló automáticamente porque el pronóstico del clima es desfavorable. Puedes reactivarla o reagendarla",
  "createdAt": "2026-11-03T20:45:00.000Z"
}
```

Detalles del canal (autenticación del socket, recuperación con `GET /api/notifications`, marcar
como leída) en `docs/api/notifications.md`.

---

## Flujo recomendado para el cliente (Flutter)

1. Al entrar a la pantalla de pendientes (y con pull-to-refresh):
   `GET /api/activities/upcoming` con los filtros elegidos. El pronóstico cambia, así que no lo
   cachees entre sesiones.
2. Pinta cada actividad con `probabilityBand` (verde, amarillo, rojo; gris si es `null`) y
   distingue `state.name` (`planned`, `completed`, `cancelled`, `cancelled_by_system`). Con
   `forecast` puedes mostrar el clima de su franja.
3. Filtros: `days` para proximidad, `visitId` para ubicación, `probabilityMin`/`probabilityMax`
   para probabilidad, `state` para estado. Combinados con `sortBy=probability` para ver primero
   las de peor clima.
4. Completar: `PATCH /api/activities/:id/complete` (ver `docs/api/activities.md`).
5. Cancelar: pide confirmación y llama `PATCH /:id/cancel`, con `reason` si el usuario lo escribe.
6. Mantén el socket abierto. Al recibir `ACTIVITY_AUTO_CANCELLED`, refresca la lista y ofrece
   **Reactivar** o **Reagendar** en esa actividad.
7. Reactivar: si la actividad tiene `probabilityBand: "RED"` pide confirmación en la app
   ("el clima sigue mal, ¿seguro?") y luego llama `PATCH /:id/reactivate`. Maneja `409`
   (alguien ocupó el horario) y `400` (ya terminó: ofrece reagendar).
8. Reagendar: abre el selector de fecha y hora (puedes reutilizar el del módulo de actividades) y
   llama `PATCH /:id/reschedule`. Maneja `409` (cruce de horario u otra ubicación ese día) y
   `422` (mostrar el `message` tal cual: explica el pronóstico que lo bloquea).
9. Tras cualquier acción, reemplaza la actividad en la lista con el `data` de la respuesta.

## Lo que todavía no existe

- No hay endpoint para consultar el historial de cancelaciones de una actividad: solo se guarda
  el último evento (`cancelReason`, `cancelledAt`).
- No hay filtro por rango de fechas arbitrario (`dateFrom`/`dateTo`): la proximidad es "hoy
  hasta N días" con `days`.
- No hay notificaciones push del sistema operativo: el aviso llega por WebSocket (app abierta) o
  se recupera con `GET /api/notifications`.
