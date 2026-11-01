# Design

## Context

Ver `proposal.md` para la motivación. Estado actual relevante:

- `Visit` guarda un snapshot único del clima a las 12:00 **hora local** (`TARGET_HOUR`, `timezone=auto`) y `VisitsWeatherCron` lo refresca cada 6 h agrupando visitas por coordenadas redondeadas.
- `Activity.isViable` (booleano, semántica AND) sale de `resolveViability` sobre ese snapshot. `ActivityViabilityService` notifica transiciones y declara que nunca cancela.
- La validación de creación/edición bloquea con 422 las OUTDOOR incompatibles con el snapshot.
- `State` es una tabla sembrada (`planned`, `confirmed`, `cancelled`, `completed`); varios lugares comparan `state.name === 'cancelled'`.
- La fecha vive en `Visit`; `Activity` solo tiene `startTime`/`endTime` (sin zona horaria, hora local de la ubicación).
- Ventana de pronóstico: `FORECAST_MAX_DAYS = 10`.

## Goals / Non-Goals

**Goals:**
- Evaluar el clima de la franja exacta de cada actividad, no solo el de las 12:00.
- Persistir `probability` para filtrar, ordenar y paginar en SQL.
- Cancelación por sistema trazable y siempre reversible por el usuario.
- Cero dependencias nuevas.

**Non-Goals:**
- Reemplazar la validación de creación basada en el snapshot (se mantiene).
- Historial completo de cancelaciones por actividad.
- Probabilidad meteorológica "real": es una **idoneidad** derivada del pronóstico.
- Cambios en la app móvil o notificaciones push.

## Decisions

### 1. Cancelación: job periódico (no on-demand)
El brief pide documentar si la cancelación corre por job o al consultar. **Decisión: job periódico** (`@Cron` cada 15 min) más recálculo en cada refresco de clima.
- *On-demand al listar*: una lectura (GET) mutaría estado, la cancelación dependería de que alguien abra la app y dos consultas concurrentes competirían por cancelar.
- *Job*: cancela aunque nadie consulte, es idempotente y deja la trazabilidad en un solo lugar.
- El job reutiliza el patrón de `VisitsWeatherCron` (flag `running`, concurrencia limitada, `timeZone: 'America/Guatemala'`). `@nestjs/schedule` ya está en el proyecto.

### 2. Pronóstico horario como JSON en `Visit` (opción C del debate)
`Visit.hourlyForecast Json?` con forma `{ utcOffsetSeconds, hours: [{ time, weatherCode, precipitation, cloudCover, windSpeed, precipitationProbability }] }` para las 24 horas de la fecha de la visita. Se tipa en TypeScript y se valida al leer. Los campos actuales del snapshot no cambian (compatibilidad con la app).
- Alternativas: consulta on demand sin guardar (el listado no podría mostrar probabilidad barata), o tabla/columnas por actividad (más escrituras sin beneficio visible).
- El cron de 6 h ya agrupa por coordenada: sigue haciendo **una** llamada por grupo y de ahí arma tanto el snapshot como el JSON horario. Se añade `precipitation_probability` al parámetro `hourly` y un método al `WeatherPort` para devolver las horas.
- El `utcOffsetSeconds` de Open-Meteo permite calcular "ahora local" de la ubicación sin base de datos de zonas horarias.

### 3. Fórmula de probabilidad (idoneidad, A + B)
Implementada como funciones puras en `activities/utils/`:
- Horas de la franja = horas locales que solapan `[startTime, endTime)`.
- Por hora: puntaje determinista (1/0) usando `classifyWeather`/`evaluateConditions` **solo** para condiciones de cielo y viento (`sunny`, `clear`, `partly_cloudy`, `cloudy`, `windy`); las de precipitación (`drizzle`, `rainy`, `snowy`) no se evalúan con milímetros, solo con el factor.
- Factor de precipitación: `1 - p/100` si lo elegido no incluye precipitación; `p/100` si la incluye.
- Probabilidad = `round(promedio(horas) * 100)`. INDOOR = 100, o 70 si alguna hora tiene nieve o viento fuerte. Sin datos para alguna hora de una OUTDOOR → `null`.
- Constantes en un solo archivo: `CANCEL_THRESHOLD = 30`, `CANCEL_WINDOW_MINUTES = 60`, bandas 70/40, tope INDOOR 70.
- Nota: `classifyWeather` ya exige ausencia de precipitación para `sunny`/`clear` (por milímetros y código WMO), así que el factor de probabilidad **suaviza** ese efecto, no lo duplica.
- Alternativa descartada: solo semáforo sin porcentaje (no permite filtrar por rango, que el brief pide).

### 4. Estado de cancelación (opción A del debate)
Fila nueva `cancelled_by_system` en `State` + `Activity.cancelReason` (`VarChar(500)?`) y `Activity.cancelledAt`. Un helper `isCancelled(stateName)` es la **única** fuente de verdad para "está cancelada" y reemplaza las comparaciones con `'cancelled'` (en `assertNoOverlap`, `assertActivityIsPlanned` y donde aparezcan). Se descartó un enum `cancelledBy` por redundante con el estado.

### 5. Persistir `probability` y un único punto de recálculo
`Activity.probability Int?` junto a `isViable`. Una función única `recomputeActivityViability` (en el servicio de viabilidad) calcula y persiste `isViable`, `viabilityCheckedAt` y `probability`, y la llaman todos los disparadores: refresco de clima, creación, edición, reactivación y reagendado. Reemplaza la lógica duplicada actual de `ActivityViabilityService.evaluateVisitActivities`.
- Se mantiene `isViable` y sus notificaciones tal como están. La creación/edición/reagendado siguen validando con `assertForecastCompatible` contra el snapshot de la visita (cambiar esa regla sobre un módulo de 30% no se justifica aquí).

### 6. Job de la última hora
`ActivitiesAutoCancelCron` cada 15 min:
1. Busca actividades OUTDOOR, activas, `planned`, con `reactivatedAt` nulo, de visitas `PLANNED` activas con fecha entre ayer y mañana UTC (cubre cualquier desfase).
2. Con el `utcOffsetSeconds` de cada visita calcula su "ahora local" y se queda con las que empiezan en `(0, 60]` minutos.
3. Agrupa por coordenadas y vuelve a pedir el pronóstico solo de esas visitas; si falla, usa el guardado únicamente si se actualizó hace menos de 3 h; si no hay datos, **omite** (nunca cancela sin datos).
4. Recalcula; si `probability < 30`, cancela en una transacción con `updateMany` condicionado a `state = planned` (evita doble cancelación o pisar una acción del usuario), guarda `cancelReason`/`cancelledAt` y notifica con `ACTIVITY_AUTO_CANCELLED`.

### 7. Reactivación
`PATCH /activities/:id/reactivate`, sin cuerpo y sin bandera de confirmación. Solo desde `cancelled`/`cancelled_by_system`; revalida cruce de horario (409) y que la actividad no haya terminado en hora local de la visita (400); **no** revalida clima. Limpia `cancelReason`/`cancelledAt`, fija `reactivatedAt`, recalcula la probabilidad. El cron ignora actividades con `reactivatedAt`. Cambiar el horario o reagendar limpia `reactivatedAt`.

### 8. Reagendado (opción C del debate)
`PATCH /activities/:id/reschedule` con `{ date, startTime, endTime }`:
- Resuelve la visita destino: misma `userId`, coordenadas exactamente iguales, `date` igual, `isActive`, `PLANNED`. Si no existe, crea una copiando nombre y coordenadas y pidiendo su pronóstico (reutiliza `VisitsService`/helpers existentes).
- En una transacción: valida cruce (409) y compatibilidad (`assertForecastCompatible`, 422), mueve la actividad (`visitId`), limpia datos de cancelación/reactivación si estaba cancelada, deja `planned` y recalcula.
- Una visita origen que queda sin actividades no se borra.
- El proyecto ya impone una sola visita activa por usuario y fecha. Si en la fecha destino existe una visita en **otras** coordenadas, se responde 409 en vez de crear una segunda (hallazgo durante la implementación; refleja la regla existente `assertNoVisitOnDate`).

### 9. Listado
`GET /activities/upcoming` con DTO validado (`days`, `visitId`, `probabilityMin/Max`, `state`, `sortBy`, `order`, `page`, `limit`). Filtra y ordena en SQL gracias a `probability` persistida; para ordenar por fecha usa `visit.date` y `startTime`. Índice nuevo sugerido: `Activity(probability)` solo si el plan de consulta lo justifica.

## Risks / Trade-offs

- [Dos definiciones de "malo": `isViable` por snapshot vs `probability` por franja pueden discrepar] → Se documenta en `docs/api/`; el aviso temprano usa `isViable` y la cancelación usa `probability`. Unificarlas queda como mejora futura.
- [Cancelar por un pronóstico que cambia en la última hora] → Umbral bajo (30), ventana corta (60 min), siempre reversible y respetada tras reactivar.
- [JSON `hourlyForecast` sin esquema en Postgres] → Tipo TypeScript + parseo defensivo al leer; si es inválido se trata como "sin datos".
- [El cron de 15 min golpea Open-Meteo] → Solo visitas con actividad inminente, agrupadas por coordenadas, con concurrencia limitada y timeout existente.
- [Carrera cron vs. acción del usuario] → Cancelación condicionada al estado actual; el usuario siempre puede reactivar.
- [Crear visitas implícitas al reagendar] → Coincidencia estricta (coordenadas, fecha, usuario) para evitar duplicados.
- [Un `State` olvidado en producción rompe la cancelación] → `getStateId` ya lanza error explícito; se documenta correr el seed tras la migración.

## Migration Plan

1. Una migración Prisma (`pnpm prisma migrate dev --name add_activity_smart_update`): columnas nuevas en `Activity` y `Visit`, valor nuevo del enum `NotificationType`.
2. Correr el seed (agrega `cancelled_by_system`). Es idempotente (`upsert`).
3. El primer ciclo del cron de 6 h llena `hourlyForecast`; mientras tanto la probabilidad es `null` (la app ya maneja `null` en `isViable`). Opcionalmente un backfill puntual.
4. Rollback: las columnas son nulables y aditivas; revertir el código deja los datos inertes.
