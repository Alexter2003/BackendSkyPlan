import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import type { Notification } from '@prisma/client';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { ACTIVITY_VIABILITY_EVENT } from './interfaces/notification-public.interface.js';
import type {
  ActivityViabilityEvent,
  NotificationPublic,
} from './interfaces/notification-public.interface.js';

export interface NotifyActivity {
  id: number;
  visitId: number;
  name: string;
}

type NotificationWithActivity = Notification & {
  activity: { visitId: number };
};

function toNotificationPublic(
  notification: NotificationWithActivity,
): NotificationPublic {
  return {
    id: notification.id,
    activityId: notification.activityId,
    visitId: notification.activity.visitId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

function buildContent(
  type: NotificationType,
  activityName: string,
): { title: string; message: string } {
  if (type === NotificationType.ACTIVITY_NOT_VIABLE) {
    return {
      title: 'Actividad no viable',
      message: `La actividad '${activityName}' ya no es viable según el pronóstico del clima`,
    };
  }
  return {
    title: 'Actividad viable nuevamente',
    message: `La actividad '${activityName}' volvió a ser viable según el pronóstico del clima`,
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  // Guarda el aviso (para recuperarlo si la app estaba cerrada) y lo emite al
  // room del usuario. Nunca lanza por la emisión: si el socket falla, el aviso
  // ya quedó persistido y el cliente lo recupera con GET /notifications.
  async notify(
    userId: number,
    activity: NotifyActivity,
    type: NotificationType,
  ): Promise<void> {
    const { title, message } = buildContent(type, activity.name);

    const notification = await this.prisma.notification.create({
      data: { userId, activityId: activity.id, type, title, message },
    });

    const event: ActivityViabilityEvent = {
      notificationId: notification.id,
      activityId: activity.id,
      visitId: activity.visitId,
      activityName: activity.name,
      type,
      isViable: type === NotificationType.ACTIVITY_VIABLE_AGAIN,
      title,
      message,
      createdAt: notification.createdAt,
    };

    try {
      this.gateway.emitToUser(userId, ACTIVITY_VIABILITY_EVENT, event);
    } catch {
      // Persistido arriba; la entrega en tiempo real es best-effort.
    }
  }

  async findAll(
    userId: number,
    unreadOnly: boolean,
  ): Promise<ServiceResponse<NotificationPublic[]>> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      include: { activity: { select: { visitId: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      status: HttpStatus.OK,
      message: 'Notificaciones obtenidas exitosamente',
      data: notifications.map(toNotificationPublic),
    };
  }

  async markRead(
    userId: number,
    id: number,
  ): Promise<ServiceResponse<NotificationPublic>> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('Notificación no encontrada');
    }

    const notification = await this.prisma.notification.update({
      where: { id },
      data: { readAt: existing.readAt ?? new Date() },
      include: { activity: { select: { visitId: true } } },
    });

    return {
      status: HttpStatus.OK,
      message: 'Notificación marcada como leída',
      data: toNotificationPublic(notification),
    };
  }

  async markAllRead(
    userId: number,
  ): Promise<ServiceResponse<{ count: number }>> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return {
      status: HttpStatus.OK,
      message: 'Notificaciones marcadas como leídas',
      data: { count },
    };
  }
}
