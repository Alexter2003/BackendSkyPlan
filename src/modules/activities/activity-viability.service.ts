import { Injectable } from '@nestjs/common';
import { ActivityType, NotificationType } from '@prisma/client';
import type { Visit } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isWeatherConditionName } from '../weather/utils/weather-conditions.utils.js';
import { ACTIVITY_STATE, resolveViability } from './utils/activities.utils.js';

/**
 * Reevalúa la viabilidad de las actividades de una visita cuando su clima se
 * actualiza (cron, cambio de fecha o ubicación) y avisa al usuario.
 *
 * Solo se evalúan las actividades OUTDOOR, activas y en estado `planned`: las
 * INDOOR no dependen del clima y las completadas/canceladas están congeladas.
 *
 * Transiciones de `isViable` y su efecto:
 *   null  -> true   solo queda validada, no se notifica
 *   true  -> false  ACTIVITY_NOT_VIABLE
 *   null  -> false  ACTIVITY_NOT_VIABLE
 *   false -> true   ACTIVITY_VIABLE_AGAIN
 *   sin cambio      no se hace nada, así el cron no genera avisos repetidos
 *
 * Si la visita no tiene datos de clima completos no se toca nada: un dato
 * faltante nunca pisa una viabilidad ya conocida. Este servicio nunca cancela
 * una actividad; esa decisión es del usuario.
 */
@Injectable()
export class ActivityViabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async evaluateVisitActivities(visit: Visit): Promise<void> {
    const activities = await this.prisma.activity.findMany({
      where: {
        visitId: visit.id,
        isActive: true,
        type: ActivityType.OUTDOOR,
        state: { name: ACTIVITY_STATE.PLANNED },
      },
      include: { activityWeathers: { include: { weatherCondition: true } } },
    });

    for (const activity of activities) {
      const desired = activity.activityWeathers
        .map((link) => link.weatherCondition.name)
        .filter(isWeatherConditionName);

      const { isViable } = resolveViability({
        type: activity.type,
        desired,
        weather: visit,
      });

      if (isViable === null) {
        continue;
      }

      await this.prisma.activity.update({
        where: { id: activity.id },
        data: { isViable, viabilityCheckedAt: new Date() },
      });

      const target = {
        id: activity.id,
        visitId: activity.visitId,
        name: activity.name,
      };

      if (isViable === false && activity.isViable !== false) {
        await this.notifications.notify(
          visit.userId,
          target,
          NotificationType.ACTIVITY_NOT_VIABLE,
        );
      } else if (isViable === true && activity.isViable === false) {
        await this.notifications.notify(
          visit.userId,
          target,
          NotificationType.ACTIVITY_VIABLE_AGAIN,
        );
      }
    }
  }
}
