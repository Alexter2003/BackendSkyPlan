# SkyPlan API — Notificaciones en tiempo real

Para el recorrido completo ver `docs/api/activities-flow.md`.

Avisos cuando una actividad **al aire libre** deja de ser viable por un cambio en el
pronóstico, o vuelve a serlo. Hay dos canales que entregan lo mismo:

1. **WebSocket** (`/notifications`): llega al instante mientras la app está abierta.
2. **REST** (`/api/notifications`): para recuperar lo que llegó con la app cerrada.

Cada aviso se guarda siempre, así que no se pierde aunque el socket no estuviera conectado.

Cuándo se genera un aviso (lo hace el backend al refrescar el clima de la visita, cada 6 horas,
o cuando se edita la fecha/ubicación de la visita):

| Cambio de `isViable` | Aviso |
|---|---|
| `true`/`null` -> `false` | `ACTIVITY_NOT_VIABLE` |
| `false` -> `true` | `ACTIVITY_VIABLE_AGAIN` |
| `null` -> `true` | ninguno (solo quedó validada) |
| sin cambio | ninguno (no hay avisos repetidos) |

El backend **nunca cancela** la actividad: solo avisa. Solo se evalúan actividades `OUTDOOR`
en estado `planned`.

---

## WebSocket

- URL: `wss://<host>/notifications` (socket.io, **namespace** `/notifications`, sin el prefijo `/api`).
- Autenticación: el mismo token Bearer del login, enviado en el handshake como
  `auth: { token: "<token>" }`. Con token ausente, inválido, expirado o cuenta inactiva el
  servidor **desconecta** al cliente de inmediato (no hay mensaje de error).
- El servidor mete la conexión en una sala privada del usuario; solo recibe sus propios avisos.

### Evento `activity.viability_changed`

```json
{
  "notificationId": 9,
  "activityId": 5,
  "visitId": 10,
  "activityName": "Caminata",
  "type": "ACTIVITY_NOT_VIABLE",
  "isViable": false,
  "title": "Actividad no viable",
  "message": "La actividad 'Caminata' ya no es viable según el pronóstico del clima",
  "createdAt": "2026-10-04T18:00:00.000Z"
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `notificationId` | number | id en `GET /api/notifications` (para marcarla leída) |
| `activityId` / `visitId` | number | para navegar a la actividad |
| `activityName` | string | |
| `type` | string | `"ACTIVITY_NOT_VIABLE"` \| `"ACTIVITY_VIABLE_AGAIN"` |
| `isViable` | boolean | estado actual de la actividad |
| `title` / `message` | string | en español, listos para la notificación local |
| `createdAt` | string (ISO) | |

`type: "ACTIVITY_VIABLE_AGAIN"` usa `title: "Actividad viable nuevamente"` y
`message: "La actividad 'X' volvió a ser viable según el pronóstico del clima"`.

### Ejemplo en Flutter (`socket_io_client`)

```dart
final socket = io.io(
  'https://<host>/notifications',
  io.OptionBuilder()
      .setTransports(['websocket'])
      .setAuth({'token': accessToken})
      .build(),
);
socket.on('activity.viability_changed', (data) {
  // mostrar notificación local (flutter_local_notifications) con data['title'] / data['message']
  // y refrescar la actividad / la visita
});
```

Limitaciones: el socket solo llega con la app abierta o en segundo plano activo (no es un
push). No se corta solo si el usuario cierra sesión: el cliente debe desconectarlo en el logout.

---

## REST

Todos requieren `Authorization: Bearer <token>` y devuelven el sobre estándar
`{ status, message, data }`.

### El objeto `Notification`

```json
{
  "id": 9,
  "activityId": 5,
  "visitId": 10,
  "type": "ACTIVITY_NOT_VIABLE",
  "title": "Actividad no viable",
  "message": "La actividad 'Caminata' ya no es viable según el pronóstico del clima",
  "readAt": null,
  "createdAt": "2026-10-04T18:00:00.000Z"
}
```

`readAt` es `null` mientras no se marque como leída.

### 1. Listar — `GET /api/notifications`

| Query | Tipo | Notas |
|---|---|---|
| `unread` | `"true"` \| `"false"` | opcional. `true` solo trae las no leídas |

`200 OK`, `message`: `"Notificaciones obtenidas exitosamente"`, `data`: arreglo de
`Notification`, más recientes primero.

| Status | Cuándo | `message` |
|---|---|---|
| 400 | `unread` con otro valor | `"unread debe ser true o false"` |

### 2. Marcar una como leída — `PATCH /api/notifications/:id/read`

`200 OK`, `message`: `"Notificación marcada como leída"`, `data`: la `Notification`.

| Status | Cuándo | `message` |
|---|---|---|
| 404 | No existe o no es del usuario | `"Notificación no encontrada"` |

### 3. Marcar todas como leídas — `PATCH /api/notifications/read-all`

`200 OK`, `message`: `"Notificaciones marcadas como leídas"`, `data`: `{ "count": 2 }`.

---

## Flujo recomendado para el cliente (Flutter)

1. Tras el login, abrir el socket con el token y escuchar `activity.viability_changed`.
2. Al abrir la app (o volver a primer plano), llamar `GET /api/notifications?unread=true` y
   mostrar lo que llegó mientras estaba cerrada.
3. Al abrir una notificación, `PATCH /:id/read` y navegar a `visitId`/`activityId`.
4. En el logout, desconectar el socket.
