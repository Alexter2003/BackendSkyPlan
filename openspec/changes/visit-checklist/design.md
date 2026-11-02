# Design

## Context

Estado verificado en el código (motivación en `proposal.md`):

- `ActivitiesService.complete` y `cancel` solo actualizan la actividad; `VisitsService.complete` solo pone `COMPLETED` y `VisitsService.cancel` cancela las `planned`. Nada vincula el estado de la visita con el de sus actividades.
- `assertDateHasArrived` (`visits/utils`) y `assertNotPastDate` usan `startOfUtcDay`. `localToday` (hora de Guatemala, UTC-6) vive en `activities/utils/activities.utils.ts` con la constante `FALLBACK_UTC_OFFSET_SECONDS`, y `activities.utils` ya importa de `visits/utils` (`formatTime`, `formatVisitDate`): importar `localToday` desde `visits/utils` crearía un ciclo.
- `toVisitPublic` es una función pura sin acceso a datos y se llama en 5 sitios de `VisitsService` (crear, listar, editar, finalizar, cancelar); `toVisitDetail` deriva de ella.
- `assertNoOverlap` solo excluye las canceladas, así que una actividad `completed` sigue ocupando su franja; deshacer no necesita revalidar cruces.
- El cron de auto-cancelación solo considera actividades con `minutesUntilStart > 0` y visitas `PLANNED`, por lo que no cancelará una actividad que se deshaga después de haber empezado.
- Los estados de actividad son filas de la tabla `State` (`planned`, `completed`, `cancelled`, `cancelled_by_system`), no un enum; los conteos deben pasar por el nombre del estado.

## Goals / Non-Goals

**Goals:**
- Un solo lugar decide si una visita queda resuelta, usado por `complete`, `cancel` y `uncomplete`.
- El progreso se calcula sin cargar actividades en la lista de visitas.
- Sin migración ni columnas denormalizadas.
- Un solo criterio de "hoy" (Guatemala) en las rutas de finalizar.

**Non-Goals:**
- Fotos, galería, hora de inicio como requisito, validaciones de fecha de crear/editar (ver `proposal.md`).

## Decisions

### D1. Dónde vive el helper de fecha local
- **A. Mover `localToday` y la constante a `src/common/utils/local-date.utils.ts` y re-exportar `localToday` desde `activities.utils`** (elegida): elimina el ciclo, `visits/utils` lo importa de `common`, y los importadores y tests actuales no cambian.
- **B. Importar `localToday` desde `activities.utils` en `visits.utils`**: ciclo de módulos en tiempo de ejecución.
- **C. Duplicar la función**: dos copias del offset que pueden divergir.

`assertDateHasArrived` pasa a comparar contra `localToday()`. El mensaje de error no cambia.

### D2. Cómo se calcula el progreso
- **A. Dos consultas agrupadas: ids de estado `planned`/`completed` y `groupBy` de actividades por `visitId` y `stateId`** (elegida): la lista no carga actividades y el costo no crece con el número de actividades.
- **B. Incluir las actividades en `findAll` y contar en memoria**: cada visita arrastra toda su lista de actividades solo para dos números.
- **C. Contadores denormalizados en `Visit`**: lectura gratis, pero hay que mantenerlos en cada transición (crear, cancelar, reagendar, auto-cancelar, eliminar) y una omisión los desincroniza; exige migración.

Se añade `getVisitProgress(prisma, visitIds): Promise<Map<number, VisitProgress>>`; `total` suma `planned` y `completed`, por lo que cancelaciones manuales y del sistema quedan fuera. `toVisitPublic(visit, progress)` recibe el progreso y todos los sitios de llamada lo aportan (crear devuelve `{0, 0}`). En `findOne` el progreso se deriva de las actividades ya cargadas, sin consulta extra.

### D3. Cómo se decide el cierre automático
- **A. Helper `syncVisitCompletion(tx, visitId)` llamado dentro de la transacción de `complete` y `cancel`** (elegida): una función, una transacción, sin acoplar módulos.
- **B. Evento de dominio o middleware de Prisma**: desacopla, pero agrega maquinaria para dos llamadores y oculta el flujo.
- **C. Que el cliente finalice la visita cuando vea el progreso completo**: deja a la app la responsabilidad de una regla de negocio y no cumple el requisito de cierre automático.

El helper cuenta, por nombre de estado, las actividades activas `planned` y `completed` de la visita; si `planned = 0` y `completed ≥ 1`, ejecuta `updateMany({ where: { id, status: PLANNED }, data: { status: COMPLETED } })`. La condición de estado vuelve inocuo el cierre sobre visitas ya `COMPLETED` o `CANCELLED`. Devuelve el estado resultante, que sale como `visitStatus`.

### D4. Concurrencia del cierre
Dos checks simultáneos en `READ COMMITTED` no ven el cambio sin confirmar del otro: ambos cuentan una `planned` pendiente y ninguno cierra la visita.
- **A. Bloquear la fila de la visita al abrir la transacción (`SELECT ... FOR UPDATE` vía `$queryRaw`)** (elegida): serializa solo las transacciones de la misma visita, sin reintentos.
- **B. Aislamiento `SERIALIZABLE` con reintento ante error de serialización**: correcto, pero obliga a un bucle de reintentos y falla de forma menos predecible.
- **C. Aceptar la carrera**: el usuario tendría que finalizar a mano; contradice la spec.

`$queryRaw` es la única consulta cruda del cambio y se justifica porque Prisma no expone `FOR UPDATE`. `complete`, `cancel` y `uncomplete` toman el bloqueo antes de modificar la actividad.

### D5. Forma de la respuesta de las acciones del checklist
Un tipo `ActivityChecklistResult = ActivityPublic & { visitStatus: VisitStatus }` se devuelve solo desde `complete`, `cancel` y `uncomplete`; `ActivityPublic` no cambia y el resto de endpoints de actividades queda igual. Alternativa descartada: agregar `visitStatus` a `ActivityPublic`, que obligaría a poblarlo en la lista, el detalle de visita y el listado de pendientes sin necesidad.

### D6. Reapertura al deshacer
`uncomplete` valida: actividad `completed` (400 si no), visita no `CANCELLED` (400), y en la misma transacción devuelve la actividad a `planned`, limpia `completedAt` y ejecuta `updateMany({ where: { id, status: COMPLETED }, data: { status: PLANNED } })`. No se guarda si la visita se cerró sola o a mano: cualquier deshacer sobre una visita `COMPLETED` la reabre. No se recalcula `probability` ni `isViable` al volver a `planned`: el job de viabilidad de cada 6 horas lo hace.

### D7. Dónde viven las piezas
- `getVisitProgress` y los tipos de progreso en `src/modules/visits/utils/` e `interfaces/`.
- `syncVisitCompletion`, el bloqueo de visita y la reapertura en `src/modules/activities/utils/visit-checklist.utils.ts`, junto a `ACTIVITY_STATE`.
- `uncomplete` en `ActivitiesService` y `ActivitiesController` (`PATCH :id/uncomplete`).

## Risks / Trade-offs

- [Una visita finalizada a mano deja actividades `planned` y un deshacer posterior la reabre] → es coherente con la decisión de tratar el deshacer como señal de que no estaba terminada; queda documentado en `visits.md`.
- [La excepción a "la visita solo avanza" confunde a quien lea la doc anterior] → se corrige el texto de `visits.md` y `activities-flow.md` en este mismo cambio.
- [El estado de la visita cambia sin que el usuario lo pida] → `visitStatus` en la respuesta evita un refresco extra; la lista debe refrescarse al volver a primer plano, como ya se documenta.
- [`FOR UPDATE` bloquea otras operaciones sobre la misma visita durante la transacción] → las transacciones son de milisegundos y solo compiten checks de la misma visita.
- [Una visita puede ser `PLANNED` con `completed ≥ 1` si su fecha se edita al futuro después de completar actividades] → el caso existe hoy y no se trata en este cambio; el cierre exige que llegue un check nuevo.
- [`progress.total` excluye canceladas: una visita con todo cancelado muestra 0 de 0] → es el comportamiento deseado; la visita sigue `PLANNED` y la decisión de cancelarla o finalizarla es del usuario.
- [Dos criterios de "hoy" en el código: Guatemala en finalizar y UTC en crear/editar] → deuda consciente, fuera de alcance; se anota en el PR.

## Migration Plan

1. Sin migración de base de datos ni dependencias nuevas.
2. Despliegue del código. Los clientes existentes ignoran los campos nuevos (`progress`, `visitStatus`); el nuevo endpoint es aditivo.
3. Visitas ya existentes con todas las actividades completadas siguen `PLANNED` hasta el próximo check o hasta que alguien las finalice; no hay migración de datos.
4. Rollback: revertir el código; no hay datos que deshacer.
