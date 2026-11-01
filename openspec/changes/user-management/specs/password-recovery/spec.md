# Spec Delta

## Purpose

Permitir que un usuario recupere el acceso a su cuenta pidiendo una contraseña temporal por correo, sin revelar a terceros qué correos están registrados y sin que se pueda usar el endpoint para bombardear a una cuenta.

## ADDED Requirements

### Requirement: Solicitar recuperación por correo
El sistema SHALL exponer un endpoint público que reciba un correo y, si pertenece a una cuenta activa con correo confirmado, asigne una contraseña temporal aleatoria que reemplace la contraseña vigente, marque la cuenta con cambio de contraseña obligatorio, fije una expiración para la temporal y la envíe al correo registrado.

#### Scenario: Cuenta activa y confirmada
- **GIVEN** existe una cuenta activa con el correo confirmado
- **WHEN** se solicita la recuperación con su correo
- **THEN** la contraseña anterior deja de funcionar, la cuenta queda con cambio obligatorio y expiración de la temporal, y se envía la temporal por correo

#### Scenario: Temporal válida para el cambio obligatorio
- **WHEN** se emite una contraseña temporal
- **THEN** cumple las mismas reglas de complejidad que el registro, de modo que puede usarse como contraseña actual en el cambio obligatorio

### Requirement: Respuesta que no revela qué correos existen
El sistema SHALL responder 200 con el mismo mensaje y la misma forma de respuesta para cualquier correo con formato válido, exista o no, esté la cuenta inactiva o sin confirmar, o esté en cooldown, y MUST NOT enviar nada en esos casos.

#### Scenario: Correo no registrado
- **WHEN** se solicita la recuperación con un correo que no existe
- **THEN** el sistema responde 200 con el mensaje genérico y no envía ningún correo

#### Scenario: Cuenta inactiva o sin confirmar
- **WHEN** se solicita la recuperación con el correo de una cuenta inactiva o con correo sin confirmar
- **THEN** el sistema responde 200 con el mismo mensaje genérico, no modifica la cuenta y no envía ningún correo

#### Scenario: Correo con formato inválido
- **WHEN** se solicita la recuperación con un valor que no es un correo válido
- **THEN** el sistema responde 400 por validación del cuerpo

### Requirement: Tiempo de respuesta indistinguible
El sistema SHALL ejecutar el mismo trabajo costoso de hash para cualquier solicitud válida y MUST NOT esperar al envío del correo antes de responder, para que el tiempo de respuesta no delate si el correo existe.

#### Scenario: Envío de correo lento o fallido
- **WHEN** el proveedor de correo tarda o falla al enviar la temporal
- **THEN** la respuesta al cliente no se retrasa por ello, el fallo se registra en el log y la solicitud sigue respondiendo 200

### Requirement: Cooldown entre recuperaciones
El sistema SHALL ignorar, con la misma respuesta genérica, una nueva solicitud para una cuenta cuya última contraseña temporal se emitió hace menos de 5 minutos, sin emitir otra temporal ni enviar correo.

#### Scenario: Solicitud repetida dentro del cooldown
- **GIVEN** a una cuenta se le emitió una temporal hace menos de 5 minutos
- **WHEN** se solicita de nuevo la recuperación con su correo
- **THEN** el sistema responde 200 genérico, conserva la temporal vigente y no envía otro correo

#### Scenario: Solicitud tras el cooldown
- **GIVEN** a una cuenta se le emitió una temporal hace más de 5 minutos
- **WHEN** se solicita de nuevo la recuperación con su correo
- **THEN** el sistema emite una temporal nueva que reemplaza a la anterior y la envía por correo

### Requirement: Expiración de la contraseña temporal
El sistema SHALL fijar para cada temporal una expiración de 30 minutos desde su emisión, y MUST NOT autenticar con ella la operación de cambio obligatorio una vez vencida.

#### Scenario: Temporal vigente
- **WHEN** el usuario inicia sesión con la temporal antes de que expire
- **THEN** el login responde 200 con `mustChangePassword` en true

#### Scenario: Temporal vencida
- **WHEN** el usuario intenta el cambio obligatorio con una temporal vencida
- **THEN** el sistema rechaza la operación e indica que debe solicitar una nueva
