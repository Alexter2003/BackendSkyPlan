# activity-reschedule Specification

## Purpose
Permitir al usuario mover una sola actividad a otra fecha y horario sin arrastrar las demás actividades de su visita, revalidando cruces de horario y compatibilidad climática en el destino.

## Requirements

### Requirement: Reagendar fecha y horario
El sistema SHALL permitir al dueño reagendar una actividad no completada enviando `date`, `startTime` y `endTime`, moviéndola a la visita que corresponda a esa fecha y a las mismas coordenadas.

#### Scenario: Ya existe una visita en esa fecha
- **GIVEN** el usuario tiene una visita activa y planificada en las mismas coordenadas con la fecha destino
- **WHEN** reagenda una actividad a esa fecha
- **THEN** la actividad queda asociada a esa visita con el nuevo horario

#### Scenario: No existe visita en esa fecha
- **WHEN** el usuario reagenda una actividad a una fecha sin visita en las mismas coordenadas
- **THEN** el sistema crea una visita con el mismo nombre y coordenadas para esa fecha, con su pronóstico si está disponible, y asocia la actividad a ella

### Requirement: Una sola visita por fecha
El sistema SHALL rechazar con error 409 el reagendado cuando el usuario ya tenga una visita activa en la fecha destino en coordenadas distintas, porque un usuario no puede tener dos visitas activas el mismo día, y MUST NOT crear una visita adicional.

#### Scenario: Visita ese día en otro lugar
- **GIVEN** el usuario tiene una visita activa en la fecha destino en otras coordenadas
- **WHEN** reagenda una actividad a esa fecha
- **THEN** el sistema responde 409 y no crea ni modifica visitas

### Requirement: Revalidar cruce de horario en el destino
El sistema SHALL rechazar el reagendado con error 409 cuando el nuevo horario se cruce con otra actividad activa y no cancelada de la visita destino.

#### Scenario: Horario ocupado
- **WHEN** el usuario reagenda una actividad a un horario que se cruza con otra actividad planificada del destino
- **THEN** el sistema responde 409 indicando la actividad con la que se cruza y no modifica la actividad

### Requirement: Revalidar compatibilidad climática en el destino
El sistema SHALL rechazar con error 422 el reagendado de una actividad OUTDOOR cuando el pronóstico de la fecha destino sea incompatible con sus condiciones, y aceptarlo con la viabilidad pendiente cuando no haya pronóstico disponible.

#### Scenario: Pronóstico incompatible
- **WHEN** el usuario reagenda una actividad OUTDOOR a una fecha cuyo pronóstico es incompatible con sus condiciones
- **THEN** el sistema responde 422 y la actividad conserva su fecha y horario

#### Scenario: Fecha fuera de la ventana de pronóstico
- **WHEN** el usuario reagenda una actividad OUTDOOR a una fecha sin pronóstico
- **THEN** el reagendado se acepta y la viabilidad y la probabilidad quedan nulas

### Requirement: Validar la entrada del reagendado
El sistema SHALL rechazar con error 400 un reagendado con fecha anterior a hoy, horario inválido o con la hora de inicio no anterior a la de fin.

#### Scenario: Fecha pasada
- **WHEN** el usuario reagenda a una fecha anterior a hoy
- **THEN** el sistema responde 400 con un mensaje en español

### Requirement: Reagendar una actividad cancelada la reactiva
El sistema SHALL devolver a `planned` una actividad cancelada, manual o por sistema, que se reagenda con éxito, limpiando su motivo y fecha de cancelación y la marca de reactivación.

#### Scenario: Cancelada por lluvia y movida a otro día
- **WHEN** el usuario reagenda con éxito una actividad `cancelled_by_system`
- **THEN** la actividad queda en estado `planned` en la nueva fecha y sin datos de cancelación

### Requirement: Actividades completadas no se reagendan
El sistema SHALL rechazar con error 400 el reagendado de una actividad completada.

#### Scenario: Reagendar una completada
- **WHEN** el usuario intenta reagendar una actividad completada
- **THEN** el sistema responde 400 y la actividad no cambia

### Requirement: Recalcular tras reagendar
El sistema SHALL recalcular la viabilidad y la probabilidad de la actividad reagendada con el pronóstico de su visita destino.

#### Scenario: Respuesta con datos actualizados
- **WHEN** el reagendado se completa
- **THEN** la respuesta incluye la fecha, el horario, la probabilidad y la banda de la nueva franja
