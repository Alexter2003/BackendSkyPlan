# Spec Delta

## Purpose

Definir la cancelación de actividades, manual y por sistema, con un registro mínimo del motivo y la fecha, y la reactivación por el usuario, de modo que el sistema nunca deje al usuario sin poder revertir una cancelación automática.

## ADDED Requirements

### Requirement: Cancelación manual con registro
El sistema SHALL permitir al usuario cancelar en cualquier momento una actividad planificada, dejándola en estado `cancelled`, con la fecha de cancelación y un motivo opcional enviado por el usuario.

#### Scenario: Cancelar con motivo
- **WHEN** el usuario cancela una actividad planificada enviando un motivo
- **THEN** la actividad queda en estado `cancelled` con el motivo y la fecha de cancelación registrados

#### Scenario: Cancelar sin motivo
- **WHEN** el usuario cancela una actividad planificada sin enviar motivo
- **THEN** la actividad queda en estado `cancelled` con la fecha registrada y sin motivo

#### Scenario: Cancelar una actividad ya completada
- **WHEN** el usuario intenta cancelar una actividad completada
- **THEN** el sistema responde con error 400 y la actividad no cambia

### Requirement: Aviso temprano sin cancelar
El sistema SHALL limitarse a avisar al usuario mientras falten más de 60 minutos para el inicio de la actividad, aunque su probabilidad sea baja, y MUST NOT cancelarla antes de esa ventana.

#### Scenario: Probabilidad baja con tiempo de sobra
- **WHEN** faltan 5 horas para una actividad OUTDOOR cuya probabilidad es 10
- **THEN** la actividad sigue planificada

### Requirement: Cancelación automática por sistema
El sistema SHALL cancelar una actividad OUTDOOR planificada cuando falten 60 minutos o menos para su inicio y su probabilidad sea menor que 30, dejándola en estado `cancelled_by_system` con motivo y fecha de cancelación.

#### Scenario: Probabilidad baja a una hora del inicio
- **WHEN** faltan 45 minutos para una actividad OUTDOOR planificada cuya probabilidad actualizada es 22
- **THEN** la actividad queda en estado `cancelled_by_system` con un motivo y la fecha de cancelación registrados

#### Scenario: Probabilidad aceptable a una hora del inicio
- **WHEN** faltan 45 minutos para una actividad OUTDOOR planificada cuya probabilidad actualizada es 55
- **THEN** la actividad sigue planificada

#### Scenario: Actividad de interior
- **WHEN** faltan 30 minutos para una actividad INDOOR
- **THEN** el sistema no la cancela automáticamente

### Requirement: Nunca cancelar sin datos de clima
El sistema SHALL omitir la cancelación automática de una actividad cuando no pueda obtener un pronóstico vigente para su franja.

#### Scenario: El proveedor de clima falla
- **WHEN** falta 30 minutos para una actividad OUTDOOR y el proveedor no responde ni hay pronóstico guardado reciente
- **THEN** la actividad sigue planificada

### Requirement: Motivo legible de la cancelación por sistema
El sistema SHALL guardar como motivo de la cancelación por sistema una descripción en español que incluya la probabilidad calculada y las horas y valores del pronóstico que la causaron.

#### Scenario: Motivo con valores del pronóstico
- **WHEN** el sistema cancela una actividad por probabilidad 22%
- **THEN** el motivo menciona esa probabilidad y la probabilidad de precipitación de las horas desfavorables

### Requirement: Notificación de cancelación automática
El sistema SHALL guardar y emitir una notificación de tipo `ACTIVITY_AUTO_CANCELLED` al dueño de la actividad cuando la cancele por sistema.

#### Scenario: Usuario conectado
- **WHEN** el sistema cancela una actividad por sistema
- **THEN** la notificación queda guardada y se emite en tiempo real al usuario si está conectado

### Requirement: Reactivar una actividad cancelada
El sistema SHALL permitir al dueño reactivar una actividad cancelada, manual o por sistema, devolviéndola a `planned`, limpiando el motivo y la fecha de cancelación y registrando la fecha de reactivación, sin exigir ninguna bandera de confirmación.

#### Scenario: Reactivar con el clima aún malo
- **WHEN** el usuario reactiva una actividad cancelada por sistema y el pronóstico sigue desfavorable
- **THEN** la actividad queda en estado `planned` y la solicitud no es rechazada por el clima

#### Scenario: Horario ocupado por otra actividad
- **WHEN** el usuario reactiva una actividad y su horario se cruza con otra actividad activa de la misma visita
- **THEN** el sistema responde con error 409 y la actividad sigue cancelada

#### Scenario: Actividad ya terminada
- **WHEN** el usuario reactiva una actividad cuya hora de fin ya pasó
- **THEN** el sistema responde con error 400 y la actividad sigue cancelada

### Requirement: Respetar la reactivación del usuario
El sistema MUST NOT volver a cancelar por sistema una actividad que el usuario reactivó, aunque su probabilidad siga siendo menor que 30; la marca se limpia si el usuario cambia su horario o la reagenda.

#### Scenario: Reactivada y clima aún malo
- **GIVEN** una actividad que el usuario reactivó
- **WHEN** corre la revisión de la última hora y la probabilidad es 10
- **THEN** la actividad sigue planificada

#### Scenario: Reactivada y luego reagendada
- **WHEN** el usuario reagenda una actividad que había reactivado
- **THEN** la marca de reactivación se limpia y la nueva franja vuelve a estar sujeta a cancelación automática

### Requirement: Cancelada no ocupa horario
El sistema SHALL tratar como libres los horarios de las actividades en estado `cancelled` o `cancelled_by_system` al validar cruces de horario.

#### Scenario: Nueva actividad sobre una cancelada por sistema
- **WHEN** el usuario crea una actividad en el horario de una actividad `cancelled_by_system`
- **THEN** la creación no se rechaza por cruce de horario
