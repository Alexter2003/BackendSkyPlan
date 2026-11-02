# SkyPlan API — Actividades y catálogo climático

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
  `message` como arreglo de strings en vez de un solo string.

**Todos los endpoints de este documento requieren autenticación.** Header obligatorio:

```
Authorization: Bearer <token>
```

(obtenido en `POST /api/auth/login`). Sin él, o con token inválido/expirado, responde `401` con
`"No autenticado"`.

Cada actividad pertenece a una visita del usuario autenticado. Una actividad o visita de otro
usuario responde `404`, nunca `403`.

Para el recorrido completo (visita, actividades, clima y notificaciones) ver
`docs/api/activities-flow.md`.

La pantalla de **pendientes** (listado de próximas con filtros, probabilidad de realización,
cancelación automática, reactivar y reagendar) está documentada en
`docs/api/pending-activities.md`.

---

## El objeto `Activity`

```json
{
  "id": 5,
  "visitId": 10,
  "name": "Caminata",
  "description": "Cerro de la Cruz",
  "date": "2026-10-05",
  "startTime": "09:00",
  "endTime": "11:00",
  "type": "OUTDOOR",
  "state": { "id": 1, "name": "planned" },
  "isViable": true,
  "viabilityCheckedAt": "2026-10-04T12:00:00.000Z",
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
| `visitId` | number | visita a la que pertenece |
| `name` | string | |
| `description` | string | |
| `date` | string | `"YYYY-MM-DD"`. **No es editable**: es siempre la fecha de la visita |
| `startTime` / `endTime` | string | `"HH:mm"`, hora local de la ubicación |
| `type` | string | `"OUTDOOR"` (al aire libre) \| `"INDOOR"` (interior) |
| `state` | object | `{id, name}`. `name`: `"planned"` \| `"completed"` \| `"cancelled"` (cancelada por el usuario) \| `"cancelled_by_system"` (cancelada automáticamente por el clima, ver "Cancelación automática") |
| `isViable` | boolean \| null | lo calcula el **sistema** contra el clima. `null` = todavía no se sabe: la visita no tiene pronóstico (fecha a más de 10 días). Puede volver a `null` si el usuario mueve la fecha de la visita fuera de esa ventana |
| `viabilityCheckedAt` | string (ISO) \| null | última evaluación de `isViable` |
| `probability` | number \| null | 0–100. **Idoneidad** del clima para la franja de la actividad (no es una probabilidad meteorológica). `null` = todavía no hay pronóstico horario (ver "Probabilidad de realización") |
| `probabilityBand` | string \| null | semáforo para pintar la probabilidad: `"GREEN"` (70 o más) \| `"YELLOW"` (40–69) \| `"RED"` (menos de 40). `null` si `probability` es `null` |
| `completedAt` | string (ISO) \| null | cuándo se marcó como completada |
| `cancelReason` | string \| null | solo si está cancelada: el motivo que escribió el usuario (opcional) o, si fue el sistema, la explicación con la probabilidad y el pronóstico |
| `cancelledAt` | string (ISO) \| null | cuándo se canceló. Vuelve a `null` si se reactiva o se reagenda |
| `weatherConditions` | array | condiciones climáticas elegidas, `{id, name}` |

### `state` vs `isViable`

- `state` es el checklist del usuario. Cambia con `complete` / `cancel` / `reactivate` /
  `reschedule`, y el sistema solo lo cambia en un caso: la cancelación automática de la última
  hora (ver abajo).
- `isViable` es del sistema. Si el clima deja de ser compatible pone `isViable: false` y avisa
  (ver `docs/api/notifications.md`); el usuario decide qué hacer. Si el clima mejora, vuelve a
  `true` sola.
- Las actividades `INDOOR` siempre tienen `isViable: true`.
- `isViable: null` es "pendiente de validar", no "viable" ni "no viable": la app debe mostrarlo
  con un estado propio. Si una actividad `OUTDOOR` tenía `true` o `false` y la visita se queda sin
  clima (se movió la fecha a más de 10 días), vuelve a `null` sin aviso, porque el valor anterior
  ya no describe la nueva fecha.

### Probabilidad de realización y cancelación automática

`probability` (0–100) y `probabilityBand` son la idoneidad del clima para la franja exacta de la
actividad, y el estado `cancelled_by_system` es el de una actividad que el sistema canceló en la
última hora por mal clima (siempre reversible). La fórmula, el detalle de la cancelación
automática y los endpoints relacionados están en `docs/api/pending-activities.md`.

`isViable` y `probability` pueden diferir un poco: `isViable` usa el clima de las 12:00 de la
visita (el que bloquea crear una actividad incompatible) y `probability` usa las horas de la
actividad.

### Cómo se evalúa el clima

Las condiciones elegidas se evalúan con **Y** (todas deben cumplirse) contra el clima de la
visita. Solo aplica a `OUTDOOR`. Con las condiciones de `GET /api/weather-conditions`:

- Nubosidad menor a 30%: `sunny` y `clear`. De 30% a menos de 70%: `partly_cloudy`. 70% o más: `cloudy`.
- Con precipitación nunca hay `sunny` ni `clear`.
- Precipitación: `drizzle` (llovizna), `rainy` (lluvia), `snowy` (nieve); solo una a la vez.
- Viento de 30 km/h o más: `windy`, que se combina con cualquier otra.

---

## 0. Catálogo de condiciones — `GET /api/weather-conditions`

Lista las condiciones que el usuario puede elegir y cuáles son incompatibles entre sí, para
que la app deshabilite opciones. **La validación real la hace el backend** igualmente.

### Respuesta exitosa — `200 OK`

```json
{
  "status": 200,
  "message": "Condiciones climáticas obtenidas exitosamente",
  "data": [
    { "id": 1, "name": "sunny", "description": "Clear sky with abundant sunshine", "conflictsWith": [2, 3, 5, 7, 8] },
    { "id": 2, "name": "rainy", "description": "Continuous rainfall", "conflictsWith": [1, 5, 6, 8] }
  ]
}
```

`conflictsWith` son los `id` que no se pueden elegir junto a esa condición. `name` es estable
(úsalo para traducir a texto/icono); `description` viene en inglés. La lista exacta depende de
las filas sembradas en la base de datos.

---

## 1. Crear actividad — `POST /api/activities`

### Body (JSON)

| Campo | Tipo | Reglas |
|---|---|---|
| `visitId` | number | entero; visita propia |
| `name` | string | 1 a 255 caracteres |
| `description` | string | 1 a 255 caracteres |
| `startTime` | string | `HH:mm` (00:00–23:59) |
| `endTime` | string | `HH:mm`, posterior a `startTime` |
| `type` | string | `"OUTDOOR"` o `"INDOOR"` |
| `weatherConditionIds` | number[] | al menos 1, sin repetir, enteros. IDs de `GET /api/weather-conditions` |

```json
{
  "visitId": 10,
  "name": "Caminata",
  "description": "Cerro de la Cruz",
  "startTime": "09:00",
  "endTime": "11:00",
  "type": "OUTDOOR",
  "weatherConditionIds": [1]
}
```

Campos extra no permitidos devuelven `400`.

### Respuesta exitosa — `201 Created`

```json
{
  "status": 201,
  "message": "Actividad creada exitosamente",
  "data": {
    "id": 5,
    "visitId": 10,
    "name": "Caminata",
    "description": "Cerro de la Cruz",
    "date": "2026-10-05",
    "startTime": "09:00",
    "endTime": "11:00",
    "type": "OUTDOOR",
    "state": { "id": 1, "name": "planned" },
    "isViable": true,
    "viabilityCheckedAt": "2026-10-04T12:00:00.000Z",
    "completedAt": null,
    "weatherConditions": [{ "id": 1, "name": "sunny" }]
  }
}
```

Si la visita aún no tiene clima (fecha a más de 10 días), la actividad **se crea** con
`isViable: null`, `viabilityCheckedAt: null` y el `message`:
`"Actividad guardada. Se validará contra el clima cuando la fecha esté dentro de los próximos 10 días"`.
Trátalo como éxito (ícono "pendiente de validar"). Cuando la fecha entre a la ventana, el
backend la evalúa y avisa solo si no es compatible.

### Errores posibles

Se validan en este orden; la primera falla corta.

| Status | Cuándo | `message` |
|---|---|---|
| 400 | Body inválido | mensajes de validación, p. ej. `"la hora debe tener el formato HH:mm"`, `"debes elegir al menos una condición climática"`, `"las condiciones climáticas no pueden repetirse"`, `"el tipo debe ser OUTDOOR (al aire libre) o INDOOR (interior)"` |
| 404 | La visita no existe, no es del usuario o está eliminada | `"Ubicación no encontrada"` |
| 400 | La visita está finalizada o cancelada | `"La visita ya fue finalizada"` / `"La visita está cancelada"` |
| 400 | `endTime` no es posterior a `startTime` | `"La hora de inicio debe ser anterior a la hora de fin"` |
| 400 | Algún id de condición no existe | `"Condición climática inválida"` |
| 400 | Condiciones contradictorias | `"Las condiciones climáticas elegidas son contradictorias: 'soleado' y 'lluvia'"` |
| 409 | Se cruza con otra actividad de la visita | `"El horario se cruza con la actividad 'Almuerzo' (10:00–12:00)"` |
| 422 | `OUTDOOR` y el pronóstico no es compatible | `"No se puede guardar la actividad: para el 2026-10-05 el pronóstico indica lluvia (4.2 mm, 95% de nubosidad, 8 km/h de viento), incompatible con: soleado"` |

Dos actividades consecutivas (una termina a las 10:00 y la otra empieza a las 10:00) **no** se
consideran cruzadas. Las canceladas y eliminadas no ocupan horario.

---

## 2. Listar actividades de una ubicación — `GET /api/activities?visitId=10`

| Query | Tipo | Reglas |
|---|---|---|
| `visitId` | number | obligatorio, entero |

### Respuesta exitosa — `200 OK`

`message`: `"Actividades obtenidas exitosamente"`. `data` es un arreglo de `Activity` ordenado por
`startTime` (vacío si no hay). No incluye eliminadas; sí incluye completadas y canceladas.

### Errores posibles

| Status | Cuándo | `message` |
|---|---|---|
| 400 | Falta `visitId` o no es entero | `"visitId debe ser un número entero"` |
| 404 | La visita no existe o no es del usuario | `"Ubicación no encontrada"` |

---

## 3. Ver actividad — `GET /api/activities/:id`

`200 OK`, `message`: `"Actividad obtenida exitosamente"`, `data`: un `Activity`.

| Status | Cuándo | `message` |
|---|---|---|
| 404 | No existe, no es del usuario o está eliminada | `"Actividad no encontrada"` |

---

## 4. Editar actividad — `PATCH /api/activities/:id`

Todos los campos son opcionales; no se puede cambiar de visita ni de fecha.

| Campo | Tipo | Reglas |
|---|---|---|
| `name`, `description` | string | 1 a 255 caracteres |
| `startTime`, `endTime` | string | `HH:mm` |
| `type` | string | `"OUTDOOR"` \| `"INDOOR"` |
| `weatherConditionIds` | number[] | reemplaza por completo la lista; mismas reglas que al crear |

Si cambia el horario, el tipo o las condiciones, se vuelven a aplicar las mismas validaciones
que al crear (la edición de horario excluye a la propia actividad del chequeo de cruce). Si solo
cambian `name`/`description`, no se revalida.

### Respuesta exitosa — `200 OK`

`message`: `"Actividad actualizada exitosamente"` (o el mensaje de "se validará" si la visita no
tiene clima todavía). `data`: el `Activity` actualizado.

### Errores posibles

Los mismos de crear (400/409/422), más:

| Status | Cuándo | `message` |
|---|---|---|
| 404 | No existe o no es del usuario | `"Actividad no encontrada"` |
| 400 | La actividad ya está completada o cancelada | `"La actividad ya fue completada"` / `"La actividad está cancelada"` |
| 400 | La visita ya no está planificada | `"La visita ya fue finalizada"` / `"La visita está cancelada"` |

---

## 5. Completar actividad (checklist) — `PATCH /api/activities/:id/complete`

Sin body. Marca la actividad como `completed` y guarda `completedAt`.

Se puede marcar desde que llega el **día de la visita en Guatemala (UTC-6)**; no se exige que
haya pasado la hora de inicio de la actividad. Con la fecha de la visita en el futuro responde
`400`.

`200 OK`, `message`: `"Actividad completada exitosamente"`, `data`: el `Activity` más `visitStatus`
(ver "Estado de la visita en el checklist" abajo).

| Status | Cuándo | `message` |
|---|---|---|
| 400 | La fecha de la visita todavía no llega | `"No puedes finalizar una visita cuya fecha aún no ha llegado"` |
| 400 | Ya está completada o cancelada | `"La actividad ya fue completada"` / `"La actividad está cancelada"` |
| 404 | No existe o no es del usuario | `"Actividad no encontrada"` |

---

## 5.1. Deshacer completar (checklist) — `PATCH /api/activities/:id/uncomplete`

Desmarca una actividad `completed` por error: vuelve a `planned` y `completedAt` queda en `null`.
Sin body.

`200 OK`, `message`: `"Actividad desmarcada exitosamente"`, `data`: el `Activity` más `visitStatus`.

Si el check había cerrado la visita (sola o finalizada a mano), **la visita se reabre**: pasa de
`COMPLETED` a `PLANNED` y `visitStatus` lo refleja. Es la única forma de que una visita deje de
estar finalizada. No se revalida el cruce de horario ni el clima: una actividad completada seguía
ocupando su franja.

```json
{
  "status": 200,
  "message": "Actividad desmarcada exitosamente",
  "data": {
    "id": 5,
    "visitId": 10,
    "state": { "id": 1, "name": "planned" },
    "completedAt": null,
    "visitStatus": "PLANNED"
  }
}
```

(El ejemplo omite el resto de campos del `Activity` para abreviar; vienen todos.)

| Status | Cuándo | `message` |
|---|---|---|
| 400 | La actividad no está completada (está `planned` o cancelada) | `"La actividad no está completada"` |
| 400 | La visita está cancelada | `"La visita está cancelada"` |
| 404 | No existe o no es del usuario | `"Actividad no encontrada"` |

---

## 6. Cancelar actividad (checklist) — `PATCH /api/activities/:id/cancel`

El usuario decide que ya no la va a realizar; se puede hacer en cualquier momento mientras siga
`planned` (por ejemplo, tras el aviso de que dejó de ser viable). Body opcional:

```json
{ "reason": "Me enfermé" }
```

`reason`: opcional, 1 a 500 caracteres. Sin body también es válido.

`200 OK`, `message`: `"Actividad cancelada exitosamente"`, `data`: el `Activity` con
`state.name: "cancelled"`, `cancelledAt` y `cancelReason` (`null` si no se envió), más
`visitStatus` (ver abajo).

### Estado de la visita en el checklist (`visitStatus`)

`complete`, `cancel` y `uncomplete` devuelven, junto a la actividad, el estado en que quedó su
visita:

```json
{
  "status": 200,
  "message": "Actividad completada exitosamente",
  "data": {
    "id": 5,
    "visitId": 10,
    "state": { "id": 2, "name": "completed" },
    "completedAt": "2026-09-28T16:20:00.000Z",
    "visitStatus": "COMPLETED"
  }
}
```

(El ejemplo omite el resto de campos del `Activity` para abreviar; vienen todos.)

`visitStatus` puede cambiar solo por la acción:

- **Cierre automático.** Cuando, tras completar o cancelar una actividad, la visita ya no tiene
  ninguna actividad `planned` y tiene al menos una `completed`, pasa sola a `COMPLETED`.
- Si todas las actividades quedan canceladas (ninguna completada), la visita **sigue `PLANNED`**:
  cancelarla o finalizarla es decisión del usuario.
- Una visita con fecha futura no se cierra sola (no puede tener actividades completadas).
- Solo completar y cancelar disparan el cierre. La cancelación automática por clima,
  `reschedule` y `DELETE` **no** cambian el estado de la visita.
- Una visita ya `COMPLETED` o `CANCELLED` conserva su estado.

La app debe usar `visitStatus` para actualizar la visita en pantalla sin volver a pedirla.

| Status | Cuándo | `message` |
|---|---|---|
| 400 | `reason` vacío o de más de 500 caracteres | mensaje de validación |
| 400 | Ya está completada o cancelada (también `cancelled_by_system`) | `"La actividad ya fue completada"` / `"La actividad está cancelada"` |
| 404 | No existe o no es del usuario | `"Actividad no encontrada"` |

---

## 7. Eliminar actividad — `DELETE /api/activities/:id`

Soft-delete: deja de aparecer en el listado y el detalle. No se puede deshacer desde la API.

`200 OK`, `message`: `"Actividad eliminada exitosamente"`, `data`: `null`.

| Status | Cuándo | `message` |
|---|---|---|
| 404 | No existe, no es del usuario o ya estaba eliminada | `"Actividad no encontrada"` |

---

## 8. Reactivar, reagendar y actividades próximas

Documentados en `docs/api/pending-activities.md`:

- `PATCH /api/activities/:id/reactivate` — revierte una cancelación.
- `PATCH /api/activities/:id/reschedule` — mueve la actividad a otra fecha y horario.
- `GET /api/activities/upcoming` — listado cruzado de próximas, con filtros y paginación.

---

## Flujo recomendado para el cliente (Flutter)

1. Al abrir el formulario de actividad: `GET /api/weather-conditions` y deshabilitar en la UI
   las opciones de `conflictsWith` de lo que el usuario ya eligió.
2. `POST /api/activities`. Manejar `422` (mostrar el `message` tal cual: es claro y explica
   qué pronóstico lo bloquea), `409` (horario cruzado) y el caso `isViable: null`.
3. `GET /api/activities?visitId=X` (o `activities` dentro de `GET /api/visits/:id`) para la lista.
   Mostrar una marca de alerta cuando `isViable === false`.
4. El día de la visita, el checklist: `PATCH /:id/complete` o `PATCH /:id/cancel`. Deshabilita
   "completar" si la fecha de la visita aún no llegó.
5. Mantener un socket abierto (ver `docs/api/notifications.md`) para enterarte cuando una
   actividad deja de ser viable o vuelve a serlo, y refrescar la lista al recibirlo.
6. Cancelar una visita cancela sus actividades `planned`; finalizarla no cambia las actividades.
7. Pantalla de pendientes: `GET /api/activities/upcoming` con los filtros elegidos; refrescar al
   entrar y con pull-to-refresh. Pinta `probabilityBand` como semáforo y distingue `state.name`
   (`planned`, `completed`, `cancelled`, `cancelled_by_system`).
8. Una actividad `cancelled_by_system` debe ofrecer **Reactivar** (con confirmación en la app si
   el clima sigue malo) y **Reagendar**.
9. Escuchar también `ACTIVITY_AUTO_CANCELLED` en el socket (ver `docs/api/notifications.md`).
