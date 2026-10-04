# SkyPlan API — Flujo completo: visita, actividades y notificaciones

Guía de punta a punta para el cliente Flutter. Une los tres documentos del módulo:

| Documento | Qué cubre |
|---|---|
| `docs/api/visits.md` | Visitas (ubicaciones): crear, editar, finalizar, cancelar, eliminar |
| `docs/api/activities.md` | Catálogo climático y actividades: CRUD, validaciones, checklist |
| `docs/api/notifications.md` | WebSocket y bandeja de avisos de viabilidad |

Todos los endpoints requieren `Authorization: Bearer <token>` y devuelven el sobre
`{ status, message, data }`.

---

## Conceptos clave

- **Visita** (`Visit`): un lugar en un día. Una visita = un día, y un usuario no puede tener dos
  visitas activas en la misma fecha.
- **Actividad** (`Activity`): algo que se hace dentro de una visita, en un rango de horas.
  Hereda la fecha de la visita (no tiene fecha propia).
- **Tipo**: `OUTDOOR` (al aire libre, depende del clima) o `INDOOR` (interior, no depende).
- **Condiciones deseadas**: una o más del catálogo (`sunny`, `clear`, `partly_cloudy`, `cloudy`,
  `drizzle`, `rainy`, `snowy`, `windy`). Deben cumplirse **todas** (Y).
- **Dos estados distintos en una actividad:**
  - `state` (`planned` / `completed` / `cancelled`): lo decide **el usuario**.
  - `isViable` (`true` / `false` / `null`): lo calcula **el sistema** según el clima. `null` =
    todavía no hay pronóstico.

El sistema **nunca cancela** una actividad: solo la marca `isViable: false` y avisa. El usuario
decide si la cancela.

---

## Ciclo de vida

### Visita

```
PLANNED ──complete──▶ COMPLETED   (solo si la fecha ya llegó)
   │
   └─────cancel────▶ CANCELLED    (cualquier fecha; cancela sus actividades `planned`)
```

`DELETE` es un borrado lógico aparte: oculta la visita y sus actividades.
Una visita `COMPLETED` o `CANCELLED` ya no se puede editar ni recibe actividades nuevas.

### Actividad (checklist)

```
planned ──complete──▶ completed   (solo si la fecha de su visita ya llegó)
   │
   └─────cancel────▶ cancelled    (en cualquier momento)
```

Una actividad `completed` o `cancelled` queda congelada: no se edita ni cambia de estado.

### Viabilidad (`isViable`) — solo actividades `OUTDOOR` en `planned`

```
null ──clima compatible──▶ true      (no se avisa: solo quedó validada)
null ──clima NO compatible▶ false    (aviso ACTIVITY_NOT_VIABLE)
true ──clima cambia────────▶ false   (aviso ACTIVITY_NOT_VIABLE)
false ─clima mejora────────▶ true    (aviso ACTIVITY_VIABLE_AGAIN)
true/false ─la visita pierde su clima▶ null   (sin aviso; ver abajo)
```

Si el valor no cambia entre revisiones no se manda ningún aviso. Las actividades `INDOOR`
siempre son `true`.

**`null` significa "todavía no se sabe".** Una actividad `OUTDOOR` está en `null` cuando la
visita no tiene datos de clima: porque se creó con la fecha a más de 10 días, o porque el usuario
movió la fecha de la visita más allá de esa ventana. En ese caso el valor anterior (`true` o
`false`) **se descarta** y vuelve a `null`, porque describía otra fecha o ubicación. No se manda
aviso: la app solo debe mostrar la actividad como "pendiente de validar". Cuando la fecha entre
a la ventana de 10 días, se vuelve a evaluar.

---

## Recorrido paso a paso

### 1. Crear la visita — `POST /api/visits`

La visita nace `PLANNED`.
- Fecha dentro de los próximos 10 días: se guarda el clima (temperatura, precipitación,
  humedad, presión, nubosidad, viento y código WMO).
- Fecha más lejana: el clima queda en `null` y la respuesta lo indica. Se llena solo después.

### 2. Cargar el catálogo — `GET /api/weather-conditions`

Úsalo para mostrar las opciones y deshabilitar las incompatibles con `conflictsWith`
(por ejemplo, `sunny` con `rainy`). El backend lo valida igualmente.

### 3. Crear actividades — `POST /api/activities`

Validaciones en este orden (la primera que falla corta):

| # | Validación | Resultado si falla |
|---|---|---|
| 1 | La visita es del usuario y está activa | `404` |
| 2 | La visita sigue `PLANNED` | `400` |
| 3 | `startTime` anterior a `endTime` | `400` |
| 4 | Las condiciones existen en el catálogo | `400` |
| 5 | Las condiciones no se contradicen | `400` |
| 6 | El horario no se cruza con otra actividad de la visita | `409` |
| 7 | Solo `OUTDOOR`: el clima de la visita es compatible con todas las condiciones | `422` |

Resultado al guardar:
- `OUTDOOR` con pronóstico compatible → `isViable: true`.
- `OUTDOOR` sin pronóstico todavía → se crea con `isViable: null` (pendiente de validar).
- `INDOOR` → `isViable: true`.
- En todos los casos `state` empieza en `planned`.

### 4. El clima cambia solo (sin acción del usuario)

Un proceso del backend corre **cada 6 horas** (00:00, 06:00, 12:00 y 18:00, hora de Guatemala).
Para cada visita `PLANNED` dentro de los próximos 10 días:

1. Actualiza el clima de la visita.
2. Reevalúa sus actividades `OUTDOOR` en `planned`.
3. Si `isViable` cambió, guarda un aviso y lo emite por WebSocket.

Una visita que estaba a más de 10 días y entra en la ventana recibe su clima ahí; sus
actividades pendientes pasan de `null` a `true` o `false`.

### 5. La app se entera

- App abierta: llega `activity.viability_changed` por el socket (`docs/api/notifications.md`).
- App cerrada: al abrir, `GET /api/notifications?unread=true`.
- Con cualquiera de los dos, la app muestra la notificación local y marca la actividad con
  alerta. Para saber cuáles marcar: `isViable === false` y `state.name === 'planned'`.

### 6. Editar

- **Editar la visita** (`PATCH /api/visits/:id`) cambiando fecha o ubicación: se vuelve a
  consultar el clima y se reevalúan sus actividades, con aviso si alguna cambia. Las actividades
  se mueven con la visita (heredan la fecha). Si la nueva fecha queda a más de 10 días, la visita
  se queda sin clima y sus actividades `OUTDOOR` `planned` vuelven a `isViable: null`.
- **Editar una actividad** (`PATCH /api/activities/:id`) cambiando horario, tipo o condiciones:
  se repiten las validaciones 3 a 7. Cambiar solo nombre o descripción no revalida.

### 7. El día de la visita: checklist

Por cada actividad:
- `PATCH /api/activities/:id/complete`: la hizo. Solo desde el día de la visita; guarda `completedAt`.
- `PATCH /api/activities/:id/cancel`: ya no la va a hacer (por ejemplo, tras el aviso de mal clima).

### 8. Cerrar la visita

| Acción | Efecto en la visita | Efecto en sus actividades |
|---|---|---|
| `PATCH /api/visits/:id/complete` (solo si la fecha llegó) | `COMPLETED`, queda congelada | Ninguno: las que sigan `planned` quedan como no realizadas |
| `PATCH /api/visits/:id/cancel` | `CANCELLED` | Las `planned` pasan a `cancelled` |
| `DELETE /api/visits/:id` | Se oculta | Se ocultan todas |

Una visita `COMPLETED` o `CANCELLED` deja de revisarse en las corridas de clima.

---

## Resumen de errores a manejar en la app

| Código | Dónde | Qué hacer |
|---|---|---|
| `400` | validación de campos, rango de horas, condiciones contradictorias, estados congelados | mostrar `message` |
| `404` | visita o actividad inexistente o de otro usuario | volver a la lista |
| `409` | horario cruzado con otra actividad | mostrar `message` (nombra la actividad y su horario) |
| `422` | el pronóstico no permite la actividad al aire libre | mostrar `message` tal cual; sugerir cambiar condiciones, tipo u horario |

## Limitaciones conocidas

- El clima de la visita es un único dato por día (el de las 12:00); todas las actividades de ese
  día se evalúan contra el mismo.
- El WebSocket no es un push del sistema operativo: solo llega con la app abierta o activa en
  segundo plano. Lo perdido se recupera con `GET /api/notifications`.
- No hay endpoint que filtre "solo actividades no viables"; el cliente filtra por `isViable`.
