# Proposal

## Why

El Módulo 5 (Actividades Pendientes, 30% de la nota) exige listar actividades próximas con su pronóstico, calcular una probabilidad de realización, reagendar, cancelar y cancelar automáticamente cuando el clima ya no es apto. Hoy el backend solo tiene `isViable` (booleano sobre un único snapshot de las 12:00 locales), completar y cancelar manual, y un cron que avisa pero nunca cancela. Faltan la probabilidad, la cancelación "por sistema" con auditoría, el reagendado de fecha y el listado cruzado con filtros.

## What Changes

- Guardar el pronóstico **horario** del día de cada visita (`Visit.hourlyForecast`) para evaluar el clima de la franja exacta de cada actividad.
- Calcular y persistir `Activity.probability` (0–100): idoneidad del clima para la franja, combinando las condiciones elegidas con la `precipitation_probability` del pronóstico. INDOOR vale 100, con tope de 70 si hay clima severo.
- Nuevo estado `cancelled_by_system` más `cancelReason` y `cancelledAt`; la cancelación manual también registra `cancelledAt` y un motivo opcional.
- Nuevo cron (cada ~15 min) que cancela por sistema las actividades OUTDOOR que empiezan en 60 min o menos y cuya probabilidad está por debajo de 30. Antes de esa hora el sistema solo avisa.
- Reactivar una actividad cancelada, sin bandera de confirmación (la confirmación es de la app). La reactivación deja una marca que impide que el sistema la vuelva a cancelar.
- Reagendar una actividad con `{ date, startTime, endTime }`: el backend resuelve o crea la visita destino y revalida cruce de horario y compatibilidad climática.
- Listado de actividades próximas con filtros (proximidad, ubicación, probabilidad, estado), orden y paginación.
- Nueva notificación `ACTIVITY_AUTO_CANCELLED`.

No hay cambios **BREAKING**: `GET /activities?visitId=` y los endpoints actuales conservan su contrato; las respuestas de actividad ganan campos nuevos.

Fuera de alcance: historial completo de cancelaciones (solo el último evento), notificaciones push móviles, cambios en la validación de creación (sigue usando el snapshot actual) y cualquier cambio en la app móvil.

Issue relacionado: "MÓDULO 5 - ACTUALIZACION INTELIGENTE ACTIVIDADES - BACKEND" (proyecto GitHub 5).

## Capabilities

### New Capabilities
- `activity-success-probability`: pronóstico horario por visita y cálculo/persistencia de la probabilidad de realización de cada actividad, con su banda (semáforo).
- `activity-auto-cancellation`: cancelación manual y por sistema con auditoría, reactivación por el usuario y notificación de cancelación automática.
- `activity-reschedule`: reagendado de fecha y horario de una actividad, con resolución de la visita destino y revalidación.
- `upcoming-activities-listing`: listado de actividades próximas con clima proyectado, filtros combinables, orden y paginación.

### Modified Capabilities
<!-- Ninguna: openspec/specs/ está vacío; el comportamiento previo de actividades aún no está especificado. -->

## Impact

- **Prisma**: `Activity` (+`probability`, `cancelReason`, `cancelledAt`, `reactivatedAt`), `Visit` (+`hourlyForecast Json?`), enum `NotificationType` (+`ACTIVITY_AUTO_CANCELLED`), fila nueva en `State` vía seed. Una migración.
- **Código**: `src/modules/activities/` (servicio, controlador, DTOs, utils, nuevo servicio de probabilidad y cron de cancelación), `src/modules/weather/` (pronóstico horario y `precipitation_probability`), `src/modules/visits/` (cron de 6 h llena `hourlyForecast`), `src/modules/notifications/`.
- **API**: endpoints nuevos `GET /activities/upcoming`, `PATCH /activities/:id/reactivate`, `PATCH /activities/:id/reschedule`; `PATCH /activities/:id/cancel` acepta motivo opcional.
- **Dependencias**: ninguna nueva (`@nestjs/schedule` ya existe).
- **Docs**: `docs/api/` y la skill `requirements-compliance`.
- **Despliegue**: producción debe correr el seed después de la migración para crear el estado `cancelled_by_system`.
