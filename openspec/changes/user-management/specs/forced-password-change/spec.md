# Spec Delta

## Purpose

Garantizar que quien inicia sesión con una contraseña temporal no pueda usar el resto de la API hasta definir una contraseña propia, y definir el endpoint que realiza ese cambio de forma segura.

## ADDED Requirements

### Requirement: Bloqueo de la API mientras el cambio esté pendiente
El sistema SHALL responder 403 con un mensaje que indique que debe cambiar su contraseña a cualquier petición autenticada de un usuario con cambio de contraseña pendiente, salvo las rutas permitidas explícitamente, y MUST bloquear por defecto cualquier ruta nueva.

#### Scenario: Ruta no permitida
- **GIVEN** un usuario con sesión válida y cambio de contraseña pendiente
- **WHEN** llama a cualquier ruta protegida que no esté permitida
- **THEN** el sistema responde 403 y no ejecuta la operación

#### Scenario: Rutas permitidas
- **GIVEN** un usuario con sesión válida y cambio de contraseña pendiente
- **WHEN** llama a cambiar contraseña, cerrar sesión o consultar su perfil
- **THEN** el sistema procesa la petición con normalidad

#### Scenario: Sesiones anteriores a la recuperación
- **GIVEN** un usuario tenía una sesión abierta antes de pedir la recuperación
- **WHEN** esa sesión llama a una ruta no permitida tras emitirse la temporal
- **THEN** el sistema responde 403

### Requirement: Canal de notificaciones en tiempo real bloqueado
El sistema SHALL rechazar la conexión al canal de notificaciones en tiempo real de un usuario con cambio de contraseña pendiente.

#### Scenario: Conexión con cambio pendiente
- **WHEN** un usuario con cambio de contraseña pendiente intenta conectarse al canal de notificaciones
- **THEN** la conexión se rechaza

### Requirement: Cambiar la contraseña
El sistema SHALL exponer `PUT /auth/change-password` que reciba la contraseña actual, la nueva y su confirmación, y que solo opere cuando el usuario tiene el cambio de contraseña pendiente.

#### Scenario: Cambio exitoso
- **GIVEN** un usuario con cambio pendiente y contraseña temporal vigente
- **WHEN** envía la temporal como contraseña actual, una nueva válida y la misma nueva como confirmación
- **THEN** el sistema guarda la nueva contraseña, retira la marca de cambio pendiente y borra la expiración de la temporal

#### Scenario: Sin cambio pendiente
- **WHEN** un usuario sin cambio de contraseña pendiente llama al endpoint
- **THEN** el sistema responde 403 y no modifica la contraseña

#### Scenario: Confirmación distinta
- **WHEN** la confirmación de la nueva contraseña no coincide con la nueva
- **THEN** el sistema responde 400 por validación del cuerpo

#### Scenario: Nueva contraseña débil
- **WHEN** la nueva contraseña no cumple las reglas de complejidad del registro
- **THEN** el sistema responde 400 por validación del cuerpo

#### Scenario: Contraseña actual incorrecta
- **WHEN** la contraseña actual enviada no coincide con la vigente
- **THEN** el sistema responde 400 y no modifica la contraseña

#### Scenario: Nueva igual a la actual
- **WHEN** la nueva contraseña es igual a la actual
- **THEN** el sistema responde 400 y no modifica la contraseña

#### Scenario: Temporal vencida
- **GIVEN** la expiración de la temporal ya pasó
- **WHEN** el usuario intenta el cambio
- **THEN** el sistema responde 403 indicando que la temporal expiró y que debe solicitar una nueva, sin modificar la contraseña

### Requirement: Cierre de las demás sesiones
El sistema SHALL, al completar un cambio de contraseña, eliminar todas las demás sesiones del usuario y conservar la sesión desde la que se hizo el cambio, de forma atómica con la actualización de la contraseña.

#### Scenario: Usuario con varias sesiones
- **GIVEN** un usuario con tres sesiones abiertas
- **WHEN** completa el cambio de contraseña desde una de ellas
- **THEN** solo queda esa sesión y las otras dos dejan de ser válidas

#### Scenario: Fallo a mitad de la operación
- **WHEN** falla la persistencia durante el cambio
- **THEN** no se modifica la contraseña ni se cierran sesiones

### Requirement: El login no valida la temporal
El sistema SHALL seguir permitiendo el login con credenciales válidas aunque la temporal haya vencido, devolviendo `mustChangePassword`, y MUST delegar el rechazo de la temporal vencida al cambio obligatorio.

#### Scenario: Login con temporal vencida
- **GIVEN** la temporal del usuario ya venció
- **WHEN** inicia sesión con ella
- **THEN** el login responde 200 con `mustChangePassword` en true y la sesión solo puede cerrar sesión o consultar su perfil
