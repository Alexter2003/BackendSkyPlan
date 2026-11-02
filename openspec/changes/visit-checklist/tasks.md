# Tasks

## 1. Fecha de Guatemala al finalizar

- [x] 1.1 Mover `localToday` y su constante de offset a `src/common/utils/local-date.utils.ts`, re-exportar `localToday` desde `activities.utils.ts` y hacer que `assertDateHasArrived` compare contra `localToday()`; verificar con tests que a las 19:00 de Guatemala la visita de "mañana UTC" se rechaza con 400, que a las 08:00 la del mismo día se acepta, y que los tests existentes de `localToday` y de `complete` de visitas y actividades siguen pasando
- [x] 1.2 Documentar el criterio de fecha de Guatemala en las secciones de finalizar visita y completar actividad de `docs/api/visits.md` y `docs/api/activities.md`; verificar que los mensajes citados existen en el código

## 2. Progreso de la visita

- [x] 2.1 Agregar la interfaz `VisitProgress` y el campo `progress` a `VisitPublic`, escribir `getVisitProgress(prisma, visitIds)` con la consulta agrupada de D2 y hacer que `toVisitPublic` reciba el progreso; verificar con tests del helper: visita con planificadas, completadas y canceladas, visita sin actividades, actividad eliminada y varias visitas en una sola llamada
- [x] 2.2 Pasar el progreso en los cinco sitios de `VisitsService` (crear devuelve `{0, 0}`, listar usa el mapa, detalle lo deriva de las actividades cargadas, editar/finalizar/cancelar lo consultan); verificar con tests del servicio que cada respuesta trae `progress`, que la lista hace una sola consulta agrupada y que `pnpm tsc --noEmit` pasa
- [x] 2.3 Documentar `progress` en `docs/api/visits.md` (tabla de campos y todos los ejemplos de respuesta de visita); verificar que cada ejemplo incluye el campo

## 3. Cierre automático de la visita

- [x] 3.1 Crear `syncVisitCompletion(tx, visitId)` y el bloqueo de visita con `SELECT ... FOR UPDATE` en `src/modules/activities/utils/visit-checklist.utils.ts`; verificar con tests unitarios: cierra con 0 planificadas y ≥ 1 completada, no cierra con pendientes, no cierra con todo cancelado, no toca visitas `COMPLETED` ni `CANCELLED`, y devuelve el estado resultante
- [x] 3.2 Ejecutar `complete` y `cancel` de `ActivitiesService` dentro de una transacción que toma el bloqueo, actualiza la actividad y llama al helper, y devolver `ActivityChecklistResult` con `visitStatus`; actualizar tipos del controlador; verificar con tests del servicio: completar la última pendiente cierra la visita, cancelar la última pendiente la cierra, visita futura no se cierra, `reschedule`, `remove` y la cancelación por el sistema no cambian la visita, y la respuesta trae `visitStatus`
- [x] 3.3 Documentar el cierre automático y `visitStatus` en `docs/api/activities.md` (secciones complete y cancel) y en `docs/api/visits.md` (estados de la visita); verificar que los ejemplos de respuesta incluyen `visitStatus`

## 4. Deshacer una actividad completada

- [x] 4.1 Implementar `ActivitiesService.uncomplete` y la ruta `PATCH /activities/:id/uncomplete` según D6 (400 si no está completada, 400 con la visita cancelada, 404 si no es del usuario, reapertura de la visita `COMPLETED`, `visitStatus` en la respuesta); verificar con tests del servicio y del controlador cada escenario de la spec, incluida la reapertura tras un cierre automático y tras una finalización manual
- [x] 4.2 Documentar `uncomplete` en `docs/api/activities.md` (body, respuesta, errores) y la excepción a "la visita solo avanza" en `docs/api/visits.md`; verificar que cada mensaje documentado existe en el código

## 5. Integración y cierre

- [x] 5.1 Actualizar `docs/api/activities-flow.md` con el flujo del checklist (marcar, desmarcar, cierre automático, refrescar la visita) y corregir cualquier texto que diga que finalizar o completar no relacionan visita y actividades; actualizar `.agents/skills/requirements-compliance/SKILL.md` con el estado del checklist; verificar que ningún documento contradice el comportamiento nuevo
- [x] 5.2 Ejecutar `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` y `pnpm test`, y recorrer contra la base real con un script sobre el build el flujo: crear visita con dos actividades, completar una, completar la segunda (la visita pasa a `COMPLETED`), deshacer (vuelve a `PLANNED`), dos checks simultáneos que cierran la visita, y cancelar la última pendiente; verificar que todo pasa y limpiar los datos de prueba

## Workflow follow-up

- Abrir el PR desde la rama `feat/visit-checklist` con descripción en español y título en Conventional Commits en inglés.
- Archivar el change con `/opsx:archive` después de mergear. El change `user-management` también espera su archivo.
