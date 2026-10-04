import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service.js';
import { resolveSession } from '../../common/utils/session-validation.utils.js';

export function userRoom(userId: number): string {
  return `user:${userId}`;
}

// Namespace propio para no mezclar el canal de notificaciones con otros
// gateways futuros. El cliente se conecta con `auth: { token }`, el mismo
// token Bearer que usa la API REST.
@WebSocketGateway({ namespace: '/notifications', cors: true })
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket): Promise<void> {
    const token: unknown = client.handshake.auth?.token;

    if (typeof token !== 'string' || token.length === 0) {
      client.disconnect(true);
      return;
    }

    try {
      const { user } = await resolveSession(this.prisma, token);
      await client.join(userRoom(user.id));
    } catch {
      this.logger.debug('Conexión WebSocket rechazada: sesión inválida');
      client.disconnect(true);
    }
  }

  emitToUser(userId: number, event: string, payload: unknown): void {
    this.server.to(userRoom(userId)).emit(event, payload);
  }
}
