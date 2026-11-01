# Tasks

## 1. Modelo de datos y estado de cancelación

- [x] 1.1 Agregar a `prisma/schema.prisma` `Activity.probability Int?`, `cancelReason VarChar(500)?`, `cancelledAt DateTime?`, `reactivatedAt DateTime?`, `Visit.hourlyForecast Json?` y `ACTIVITY_AUTO_CANCELLED` en `NotificationType`; generar la migración con `pnpm prisma migrate dev --name add_activity_smart_update` y verificar que el archivo queda en `prisma/migrations/`
- [x] 1.2 Agregar `cancelled_by_system` a `STATES` en `prisma/seed.ts` y a `ACTIVITY_STATE`; verificar con `pnpm prisma db seed` que la fila existe y que re-ejecutarlo no duplica
- [x] 1.3 Crear el helper `isCancelled(stateName)` en `activities.utils.ts` y reemplazar toda comparación con `ACTIVITY_STATE.CANCELLED` (`assertNoOverlap`, `assertActivityIsPlanned`, etc.); verificar con tests unitarios de ambos estados y `grep` sin comparaciones sueltas
- [x] 1.4 Exponer `probability`, `probabilityBand`, `cancelReason` y `cancelledAt` en `ActivityPublic`/`toActivityPublic`; verificar con los specs existentes actualizados

## 2. Pronóstico horario

- [x] 2.1 Definir el tipo `HourlyForecast` y su parseo defensivo en `weather/`; verificar con tests de JSON válido, vacío y malformado (este último tratado como "sin datos")
- [x] 2.2 Pedir `precipitation_probability` a Open-Meteo y agregar al `WeatherPort` un método que devuelva el pronóstico horario por fecha con `utcOffsetSeconds`; verificar con tests de `open-meteo.utils` sobre una respuesta de ejemplo
- [x] 2.3 Hacer que `VisitsWeatherCron` y los flujos de creación/edición de visita guarden `hourlyForecast` junto al snapshot actual, y lo limpien cuando la fecha sale de la ventana; verificar con tests de cron y de `VisitsService`
- [x] 2.4 Documentar el nuevo campo en `docs/api/visits.md`; verificar que los ejemplos de respuesta coinciden con el DTO

## 3. Probabilidad de realización

- [x] 3.1 Crear constantes únicas (`CANCEL_THRESHOLD`, `CANCEL_WINDOW_MINUTES`, bandas 70/40, tope INDOOR 70) en `activities/` y funciones puras de probabilidad (horas de la franja, factor de precipitación, INDOOR, banda); verificar con tests que cubran los escenarios de `specs/activity-success-probability`
- [x] 3.2 Crear `recomputeActivityViability` y hacer que `ActivityViabilityService` y `ActivitiesService` (crear, editar) la usen para persistir `isViable`, `viabilityCheckedAt` y `probability`; verificar con tests de transiciones de notificación sin cambios
- [x] 3.3 Documentar la fórmula, las bandas y la diferencia entre `isViable` y `probability` en `docs/api/activities.md`; verificar que cada regla del documento aparece en un test

## 4. Cancelación, reactivación y cron de la última hora

- [x] 4.1 Extender `PATCH /activities/:id/cancel` con `reason` opcional (DTO validado, mensajes en español) y registrar `cancelledAt`; verificar con tests de cancelar con y sin motivo y de actividad completada
- [x] 4.2 Implementar `PATCH /activities/:id/reactivate` (sin cuerpo): solo desde estados cancelados, revalida cruce (409) y que no haya terminado (400), limpia cancelación, fija `reactivatedAt` y recalcula; verificar con tests de los escenarios de `specs/activity-auto-cancellation`
- [x] 4.3 Hacer que editar el horario de una actividad limpie `reactivatedAt`; verificar con un test
- [x] 4.4 Implementar `ActivitiesAutoCancelCron` (cada 15 min) según el diseño: ventana de 60 min en hora local, pronóstico refrescado por grupo de coordenadas, omisión sin datos, `updateMany` condicionado a `planned`, motivo con probabilidad y horas desfavorables; verificar con tests de umbral (29/30), ventana (59/61 min), INDOOR, reactivada, sin datos y concurrencia
- [x] 4.5 Emitir y guardar la notificación `ACTIVITY_AUTO_CANCELLED` y registrar el cron en `ActivitiesModule`; verificar con test del servicio de notificaciones y que el módulo compila (`pnpm build`)
- [x] 4.6 Documentar cancelación, reactivación y la decisión job vs on-demand en `docs/api/activities.md` y `docs/api/notifications.md`; verificar que los ejemplos incluyen `cancelled_by_system`

## 5. Reagendar

- [x] 5.1 Crear `RescheduleActivityDto` (`date`, `startTime`, `endTime`) con validaciones y mensajes en español, y el endpoint `PATCH /activities/:id/reschedule`; verificar con tests de DTO (fecha pasada, rango inválido)
- [x] 5.2 Implementar la resolución o creación de la visita destino y el movimiento de la actividad en una transacción, con revalidación de cruce (409) y compatibilidad (422); verificar con tests de visita existente, visita nueva, horario ocupado, clima incompatible y fecha sin pronóstico
- [x] 5.3 Reactivar al reagendar una actividad cancelada, limpiar `reactivatedAt` y recalcular la probabilidad; verificar con tests de cancelada manual, cancelada por sistema y completada (400)
- [x] 5.4 Documentar el endpoint en `docs/api/activities.md`; verificar que el flujo cancelada-por-lluvia → reagendar está en `docs/api/activities-flow.md`

## 6. Listado de próximas

- [x] 6.1 Crear `ListUpcomingActivitiesQueryDto` (`days`, `visitId`, `probabilityMin/Max`, `state`, `sortBy`, `order`, `page`, `limit`) con validaciones cruzadas; verificar con tests de rango invertido, límites y estado desconocido
- [x] 6.2 Implementar `GET /activities/upcoming` con filtros combinados, orden por fecha o probabilidad (nulos al final), paginación y total, incluyendo visita y clima proyectado de la franja; verificar con tests de combinación de filtros, aislamiento entre usuarios y `visitId` ajeno (404)
- [x] 6.3 Documentar el endpoint y la forma de cada elemento en `docs/api/activities.md`; verificar con un ejemplo de respuesta por cada estado

## 7. Cierre e integración

- [x] 7.1 Ejecutar `pnpm build`, `pnpm lint` y `pnpm test` y verificar que pasan completos
- [x] 7.2 Recorrer el flujo completo contra la BD de desarrollo (crear visita y actividad, ver probabilidad, cancelar por sistema vía cron, reactivar, reagendar, listar) y verificar cada paso con las respuestas reales
- [x] 7.3 Actualizar `.agents/skills/requirements-compliance/SKILL.md` marcando los criterios del Módulo 5 backend cubiertos y verificar que no quedan criterios del issue sin referencia

## Workflow follow-up

- Abrir el PR con título en inglés (Conventional Commits) y descripción en español, enlazando el issue del Módulo 5.
- Correr el seed en producción después de aplicar la migración.
- Archivar el change tras el merge.
