# Spec Delta

## Purpose

Hacer que las visitas funcionen como una lista de tareas: el progreso de sus actividades es visible, la visita se cierra sola al resolverlas todas y el usuario puede corregir un check equivocado sin dejar la visita en un estado incoherente.

## ADDED Requirements

### Requirement: Progreso de la visita
El sistema SHALL incluir en toda respuesta que represente una visita un objeto `progress` con `completed` (actividades completadas) y `total` (actividades planificadas más completadas), contando solo actividades activas y MUST NOT contar las canceladas, ya sea por el usuario o por el sistema.

#### Scenario: Visita con actividades en distintos estados
- **GIVEN** una visita con dos actividades completadas, una planificada y una cancelada
- **WHEN** el usuario consulta la visita
- **THEN** `progress` es `{ completed: 2, total: 3 }`

#### Scenario: Visita sin actividades
- **WHEN** el usuario consulta una visita sin actividades
- **THEN** `progress` es `{ completed: 0, total: 0 }`

#### Scenario: Actividad eliminada
- **GIVEN** una visita con dos actividades completadas
- **WHEN** el usuario elimina una de ellas y consulta la visita
- **THEN** `progress` es `{ completed: 1, total: 1 }`

#### Scenario: Lista de visitas
- **WHEN** el usuario consulta la lista de visitas
- **THEN** cada visita trae su propio `progress`, calculado sin cargar sus actividades

### Requirement: Cierre automático de la visita
El sistema SHALL pasar una visita planificada a `COMPLETED` cuando el usuario complete o cancele una de sus actividades y, como resultado, no quede ninguna actividad activa `planned` y exista al menos una `completed`, y SHALL hacerlo en la misma operación que el check.

#### Scenario: Se completa la última actividad pendiente
- **GIVEN** una visita cuya fecha llegó, con una actividad completada y otra planificada
- **WHEN** el usuario completa la planificada
- **THEN** la actividad queda `completed` y la visita pasa a `COMPLETED`

#### Scenario: Se cancela la última actividad pendiente
- **GIVEN** una visita con una actividad completada y otra planificada
- **WHEN** el usuario cancela la planificada
- **THEN** la visita pasa a `COMPLETED`

#### Scenario: Aún quedan actividades pendientes
- **GIVEN** una visita con tres actividades planificadas
- **WHEN** el usuario completa una
- **THEN** la visita sigue `PLANNED`

#### Scenario: Todas las actividades canceladas
- **GIVEN** una visita con una sola actividad planificada
- **WHEN** el usuario la cancela
- **THEN** la visita sigue `PLANNED`, porque no hay ninguna completada

#### Scenario: Visita futura
- **GIVEN** una visita con fecha futura y una actividad planificada
- **WHEN** el usuario la cancela
- **THEN** la visita sigue `PLANNED`

#### Scenario: Visita ya cancelada o finalizada
- **GIVEN** una visita cancelada o ya `COMPLETED`
- **WHEN** el usuario completa o cancela una actividad
- **THEN** el estado de la visita no cambia

### Requirement: Solo los checks del usuario cierran la visita
El sistema MUST NOT cambiar el estado de una visita como efecto de la cancelación automática por clima, del reagendado o de la eliminación de una actividad.

#### Scenario: Cancelación por el sistema de la última pendiente
- **GIVEN** una visita con una actividad completada y otra planificada
- **WHEN** el sistema cancela la planificada por mal clima
- **THEN** la visita sigue `PLANNED`

#### Scenario: Eliminar la última pendiente
- **GIVEN** una visita con una actividad completada y otra planificada
- **WHEN** el usuario elimina la planificada
- **THEN** la visita sigue `PLANNED`

### Requirement: Cierres simultáneos
El sistema SHALL evaluar el cierre automático de una visita de forma serializada, de modo que dos checks simultáneos sobre actividades de la misma visita nunca la dejen `PLANNED` cuando ya no quedan actividades pendientes.

#### Scenario: Dos últimas actividades marcadas a la vez
- **GIVEN** una visita con dos actividades planificadas
- **WHEN** el usuario completa ambas en peticiones simultáneas
- **THEN** ambas quedan `completed` y la visita queda `COMPLETED`

### Requirement: Deshacer una actividad completada
El sistema SHALL exponer `PATCH /activities/:id/uncomplete` para el dueño de la actividad, que devuelve una actividad `completed` al estado `planned` y borra su fecha de completado, y MUST rechazar con 400 una actividad que no esté completada.

#### Scenario: Deshacer con la visita planificada
- **GIVEN** una actividad completada en una visita `PLANNED`
- **WHEN** el usuario la deshace
- **THEN** la actividad queda `planned` con `completedAt` nulo y la visita sigue `PLANNED`

#### Scenario: La actividad no está completada
- **WHEN** el usuario deshace una actividad `planned` o cancelada
- **THEN** el sistema responde 400 y no modifica nada

#### Scenario: Actividad ajena o inexistente
- **WHEN** el usuario deshace una actividad que no es suya o no existe
- **THEN** el sistema responde 404

### Requirement: Reabrir la visita al deshacer
El sistema SHALL devolver a `PLANNED` una visita `COMPLETED` cuando se deshaga una de sus actividades completadas, en la misma operación, y MUST rechazar con 400 deshacer una actividad de una visita `CANCELLED`.

#### Scenario: Deshacer el último check
- **GIVEN** una visita `COMPLETED` cerrada automáticamente al completar su última actividad
- **WHEN** el usuario deshace esa actividad
- **THEN** la actividad queda `planned` y la visita vuelve a `PLANNED`

#### Scenario: Visita finalizada a mano
- **GIVEN** una visita finalizada manualmente con una actividad completada
- **WHEN** el usuario deshace esa actividad
- **THEN** la visita vuelve a `PLANNED`

#### Scenario: Visita cancelada
- **GIVEN** una visita `CANCELLED` que conserva una actividad completada
- **WHEN** el usuario intenta deshacerla
- **THEN** el sistema responde 400 y no modifica nada

### Requirement: Estado de la visita en las respuestas del checklist
El sistema SHALL incluir `visitStatus` con el estado resultante de la visita en las respuestas de completar, cancelar y deshacer una actividad.

#### Scenario: Completar cierra la visita
- **WHEN** el usuario completa la última actividad pendiente
- **THEN** la respuesta incluye la actividad y `visitStatus` igual a `COMPLETED`

#### Scenario: Deshacer reabre la visita
- **WHEN** el usuario deshace una actividad de una visita `COMPLETED`
- **THEN** la respuesta incluye la actividad y `visitStatus` igual a `PLANNED`

### Requirement: Fecha de Guatemala para finalizar
El sistema SHALL decidir si "la fecha de la visita ya llegó" al finalizar una visita o completar una actividad usando el día calendario de Guatemala (UTC-6), y MUST rechazar con 400 la operación cuando la fecha de la visita sea posterior a ese día, sin exigir la hora de inicio de la actividad.

#### Scenario: Noche en Guatemala
- **GIVEN** son las 19:00 en Guatemala del día D, que ya es D+1 en UTC
- **WHEN** el usuario intenta finalizar la visita del día D+1
- **THEN** el sistema responde 400

#### Scenario: Mañana en Guatemala
- **GIVEN** son las 08:00 en Guatemala del día D
- **WHEN** el usuario completa una actividad de las 15:00 de una visita del día D
- **THEN** el sistema la completa

### Requirement: Finalización manual disponible
El sistema SHALL mantener `PATCH /visits/:id/complete` para finalizar una visita planificada cuya fecha llegó, tenga o no actividades pendientes, sin modificar el estado de sus actividades.

#### Scenario: Visita sin actividades
- **GIVEN** una visita planificada sin actividades y con fecha de hoy
- **WHEN** el usuario la finaliza
- **THEN** la visita pasa a `COMPLETED`

#### Scenario: Visita con actividades pendientes
- **GIVEN** una visita con fecha de hoy y una actividad planificada
- **WHEN** el usuario la finaliza manualmente
- **THEN** la visita pasa a `COMPLETED` y la actividad sigue `planned`
