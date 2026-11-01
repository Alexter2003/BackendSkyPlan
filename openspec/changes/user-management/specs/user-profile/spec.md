# Spec Delta

## Purpose

Permitir al usuario autenticado consultar sus datos y editar sus datos personales no sensibles, impidiendo explícitamente cambiar por esa vía su nombre de usuario, su contraseña o su correo.

## ADDED Requirements

### Requirement: Consultar el perfil propio
El sistema SHALL exponer `GET /users/me` que devuelva los datos del usuario autenticado, incluidos id, correo, nombre de usuario, estado de confirmación del correo, nombre, apellido, fecha de creación y si tiene un cambio de contraseña pendiente, y MUST NOT devolver el hash de la contraseña ni datos de otros usuarios.

#### Scenario: Usuario autenticado
- **WHEN** un usuario con sesión válida llama a `GET /users/me`
- **THEN** el sistema responde 200 con sus datos

#### Scenario: Sin sesión
- **WHEN** se llama sin token o con un token inválido
- **THEN** el sistema responde 401

#### Scenario: Nombre y apellido sin definir
- **GIVEN** el usuario nunca definió nombre ni apellido
- **WHEN** consulta su perfil
- **THEN** ambos campos se devuelven en null

### Requirement: Editar datos personales
El sistema SHALL exponer `PUT /users/me` que permita actualizar el nombre y el apellido del usuario autenticado, exigiendo al menos uno de los dos y devolviendo el perfil actualizado.

#### Scenario: Edición exitosa
- **WHEN** el usuario envía un nombre y un apellido válidos
- **THEN** el sistema responde 200 con el perfil actualizado

#### Scenario: Edición parcial
- **WHEN** el usuario envía solo el nombre
- **THEN** el sistema actualiza el nombre y conserva el apellido

#### Scenario: Cuerpo vacío
- **WHEN** el usuario no envía ningún campo editable
- **THEN** el sistema responde 400 y no modifica nada

#### Scenario: Valor inválido
- **WHEN** el nombre o el apellido está vacío, solo tiene espacios o excede los 100 caracteres
- **THEN** el sistema responde 400 y no modifica nada

### Requirement: Rechazo explícito de campos inmutables
El sistema SHALL rechazar con 400 y un mensaje específico por campo cualquier intento de enviar `username`, `password` o `email` a `PUT /users/me`, sin modificar ningún dato aunque el cuerpo traiga además campos válidos.

#### Scenario: Intento de cambiar el nombre de usuario
- **WHEN** el cuerpo incluye `username`
- **THEN** el sistema responde 400 indicando que el nombre de usuario no se puede modificar y no actualiza nada

#### Scenario: Intento de cambiar la contraseña
- **WHEN** el cuerpo incluye `password`
- **THEN** el sistema responde 400 indicando que la contraseña se cambia por el flujo de recuperación y no actualiza nada

#### Scenario: Intento de cambiar el correo
- **WHEN** el cuerpo incluye `email`
- **THEN** el sistema responde 400 indicando que el correo no se puede modificar y no actualiza nada

#### Scenario: Campo desconocido
- **WHEN** el cuerpo incluye un campo que no existe en el perfil
- **THEN** el sistema responde 400 por campo no permitido

### Requirement: Nombre y apellido visibles en las respuestas de usuario
El sistema SHALL incluir el nombre y el apellido en la forma pública del usuario que devuelven el registro, la confirmación de correo y el login.

#### Scenario: Registro
- **WHEN** se registra un usuario nuevo
- **THEN** la respuesta incluye nombre y apellido en null
