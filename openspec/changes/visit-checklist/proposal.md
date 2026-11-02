# Proposal

## Why

El checklist de visitas ("irlas marcando tipo to-do list") está a medias: ya se pueden completar y cancelar actividades y finalizar visitas, pero ambas cosas están desacopladas. Una visita puede quedar `COMPLETED` con actividades sin marcar, o `PLANNED` con todas hechas; la lista de visitas no puede mostrar "3 de 5" porque no trae actividades; no hay forma de desmarcar un check equivocado; y la validación de "la fecha ya llegó" usa día UTC, así que desde las 18:00 de Guatemala permite finalizar la visita de mañana. Es la última funcionalidad que entra en la app.

## What Changes

- **Progreso en las visitas**: toda respuesta de visita (lista, detalle, crear, editar, finalizar, cancelar) incluye `progress: { completed, total }`. `total` cuenta las actividades `planned` y `completed` activas, sin las canceladas (manuales o del sistema) ni las eliminadas.
- **Cierre automático**: cuando el usuario completa o cancela una actividad y la visita ya no tiene ninguna `planned` pero sí al menos una `completed`, la visita pasa a `COMPLETED` en la misma transacción. Solo lo disparan esas dos acciones; la cancelación por clima, `reschedule` y `remove` no cierran visitas.
- **Deshacer**: `PATCH /api/activities/:id/uncomplete` devuelve una actividad `completed` a `planned` y limpia `completedAt`. Si la visita estaba `COMPLETED`, la reabre a `PLANNED`; con la visita `CANCELLED` responde 400. Es la única vía por la que una visita deja de estar `COMPLETED`.
- **Estado de la visita en la acción**: `complete`, `cancel` y `uncomplete` de una actividad devuelven además `visitStatus`, para que la app no tenga que refrescar la visita después de cada check.
- **Fecha de Guatemala**: `PATCH /visits/:id/complete` y `PATCH /activities/:id/complete` comparan contra el día de Guatemala (UTC-6, el mismo criterio de `localToday`) en vez del día UTC. El check sigue siendo por fecha, sin exigir la hora de inicio.
- **Concurrencia**: el cierre automático bloquea la fila de la visita durante la transacción, para que dos checks simultáneos no dejen la visita abierta.
- Sin cambios de esquema ni migración.
- Docs cliente actualizadas en `docs/api/`.

## Capabilities

### New Capabilities
- `visit-checklist`: progreso de la visita según el estado de sus actividades, cierre automático al resolverlas todas, deshacer una actividad completada con reapertura de la visita, estado de la visita en las respuestas del checklist y criterio de fecha de Guatemala para finalizar.

### Modified Capabilities
<!-- Ninguna: no existen specs previas de visitas ni de checklist; activity-reschedule no cambia. -->

## Impact

- Código: `src/modules/activities` (service, controller, utils, interfaz de respuesta), `src/modules/visits` (service, utils, interfaces), `src/common/utils/` (helper de fecha local compartido; `localToday` se re-exporta desde `activities.utils` para no tocar importadores).
- API: 1 endpoint nuevo (`uncomplete`); campos nuevos aditivos (`progress` en visitas, `visitStatus` en las tres acciones). Cambio de comportamiento: finalizar visita o actividad usa día de Guatemala; una visita puede pasar a `COMPLETED` sola y volver a `PLANNED` por `uncomplete`.
- Base de datos: sin migración.
- Dependencias: ninguna.
- Docs: `docs/api/visits.md`, `docs/api/activities.md`, `docs/api/activities-flow.md`.

## Fuera de alcance

- Fotos por actividad y galería de recuerdos (no entran en la app).
- Validaciones de fecha al crear y editar visitas.
- Exigir la hora de inicio de la actividad para marcarla.
- Cierres de visita desde crons, `reschedule` o `remove`.
- Impedir que una visita finalizada a mano conserve actividades `planned`.

## Referencias

- Pedido original: "la funcionalidad de irlas marcando tipo to-do list" (tablero de GitHub Projects del curso; no figura como issue del repositorio).
- `docs/api/visits.md` (regla actual "la visita solo avanza", que `uncomplete` excepciona) y `.agents/skills/requirements-compliance/SKILL.md`.
