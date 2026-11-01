# upcoming-activities-listing Specification

## Purpose
Ofrecer al usuario un listado cruzado de sus actividades próximas, con el clima proyectado de cada una, su probabilidad y su estado, con filtros combinables, orden y paginación.

## Requirements

### Requirement: Listado de actividades próximas
El sistema SHALL devolver las actividades activas del usuario autenticado cuya visita sea hoy o posterior y esté activa, de todas sus ubicaciones, cada una con datos de su visita, su estado, su probabilidad y banda y el clima proyectado de su franja.

#### Scenario: Usuario con actividades en varias ubicaciones
- **WHEN** el usuario consulta el listado sin filtros
- **THEN** recibe actividades de todas sus visitas desde hoy, ordenadas por fecha y hora de inicio ascendente

#### Scenario: Aislamiento entre usuarios
- **WHEN** un usuario consulta el listado
- **THEN** no recibe actividades de visitas de otros usuarios

### Requirement: Clima proyectado por actividad
El sistema SHALL incluir en cada elemento del listado el clima proyectado de las horas de su franja, tomado del pronóstico guardado de su visita, o nulo cuando no exista.

#### Scenario: Visita con pronóstico
- **WHEN** una actividad pertenece a una visita con pronóstico horario
- **THEN** su elemento incluye el clima de las horas de su franja

#### Scenario: Visita sin pronóstico
- **WHEN** una actividad pertenece a una visita sin pronóstico horario
- **THEN** su clima proyectado, su probabilidad y su banda son nulos

### Requirement: Filtros combinables
El sistema SHALL aceptar los filtros `days` (proximidad: de hoy a los próximos N días), `visitId`, `probabilityMin`, `probabilityMax` y `state`, y MUST aplicarlos de forma conjunta.

#### Scenario: Proximidad y probabilidad a la vez
- **WHEN** el usuario filtra con `days=3` y `probabilityMin=70`
- **THEN** recibe solo actividades de los próximos 3 días con probabilidad de 70 o más

#### Scenario: Filtro por estado
- **WHEN** el usuario filtra con `state=cancelled_by_system`
- **THEN** recibe solo actividades canceladas por sistema

#### Scenario: Filtro por ubicación ajena
- **WHEN** el usuario filtra con un `visitId` que no le pertenece
- **THEN** el sistema responde 404

### Requirement: Estados visibles en el listado
El sistema SHALL incluir por defecto en el listado las actividades en cualquier estado, para que la app distinga planificadas, completadas, canceladas manualmente y canceladas por sistema.

#### Scenario: Sin filtro de estado
- **WHEN** el usuario consulta sin `state`
- **THEN** el listado incluye actividades `planned`, `completed`, `cancelled` y `cancelled_by_system`

### Requirement: Orden y paginación
El sistema SHALL ordenar por fecha y hora ascendente por defecto, permitir ordenar por probabilidad ascendente o descendente, y paginar con `page` y `limit` (20 por defecto, máximo 100), devolviendo el total de resultados.

#### Scenario: Orden por probabilidad
- **WHEN** el usuario pide orden por probabilidad ascendente
- **THEN** las actividades con probabilidad más baja aparecen primero y las de probabilidad nula al final

#### Scenario: Segunda página
- **WHEN** el usuario pide `page=2&limit=10`
- **THEN** recibe los resultados 11 a 20 y el total de resultados

### Requirement: Validación de parámetros
El sistema SHALL rechazar con error 400 y mensaje en español los parámetros fuera de rango, como `probabilityMin` mayor que `probabilityMax`, valores fuera de 0–100, `days` menor que 1 o un `state` desconocido.

#### Scenario: Rango invertido
- **WHEN** el usuario envía `probabilityMin=80&probabilityMax=20`
- **THEN** el sistema responde 400
