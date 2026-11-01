import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ActivityType, NotificationType, VisitStatus } from '@prisma/client';
import type { Visit } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  addUtcDays,
  buildForecastFields,
  formatVisitDate,
  startOfUtcDay,
} from '../visits/utils/visits.utils.js';
import { WEATHER_PORT } from '../weather/interfaces/weather-port.interface.js';
import type { WeatherPort } from '../weather/interfaces/weather-port.interface.js';
import { parseHourlyForecast } from '../weather/utils/hourly-forecast.utils.js';
import { isWeatherConditionName } from '../weather/utils/weather-conditions.utils.js';
import { ActivityViabilityService } from './activity-viability.service.js';
import {
  CANCEL_THRESHOLD,
  CANCEL_WINDOW_MINUTES,
  STORED_FORECAST_MAX_AGE_MINUTES,
} from './constants/activity-probability.constants.js';
import { getSlotForecast } from './utils/activity-probability.utils.js';
import {
  ACTIVITY_INCLUDE,
  ACTIVITY_STATE,
  buildAutoCancelReason,
  computeActivityProbability,
  minutesUntilStart,
} from './utils/activities.utils.js';
import type { ActivityWithRelations } from './utils/activities.utils.js';

// ~1km: por debajo de la resolución de grilla de Open-Meteo, así que agrupar
// por coordenada redondeada no cambia el pronóstico obtenido.
const COORDINATE_PRECISION = 2;

type Candidate = ActivityWithRelations & { visit: Visit };

export interface AutoCancelResult {
  scanned: number;
  inWindow: number;
  cancelled: number;
  skipped: number;
}

/**
 * Cancelación automática de la última hora. Si falta CANCEL_WINDOW_MINUTES o
 * menos para que empiece una actividad OUTDOOR planificada y su probabilidad
 * (recalculada con el pronóstico más fresco posible) es menor que
 * CANCEL_THRESHOLD, el sistema la cancela, registra el motivo y avisa.
 *
 * Reglas que no se rompen:
 *  - Nunca cancela sin datos: si no hay pronóstico fresco ni uno guardado
 *    reciente, la actividad se deja como está.
 *  - Respeta las reactivaciones del usuario (`reactivatedAt`).
 *  - La cancelación es condicional al estado actual, así que una acción del
 *    usuario hecha entre la lectura y la escritura nunca se pisa.
 */
@Injectable()
export class ActivityAutoCancelService {
  private readonly logger = new Logger(ActivityAutoCancelService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WEATHER_PORT) private readonly weather: WeatherPort,
    private readonly viability: ActivityViabilityService,
    private readonly notifications: NotificationsService,
  ) {}

  async run(now: Date = new Date()): Promise<AutoCancelResult> {
    const today = startOfUtcDay(now);

    // Ventana amplia en fechas (ayer a mañana UTC) para cubrir cualquier
    // desfase horario; el filtro fino es `minutesUntilStart`.
    const candidates: Candidate[] = await this.prisma.activity.findMany({
      where: {
        isActive: true,
        type: ActivityType.OUTDOOR,
        reactivatedAt: null,
        state: { name: ACTIVITY_STATE.PLANNED },
        visit: {
          isActive: true,
          status: VisitStatus.PLANNED,
          date: { gte: addUtcDays(today, -1), lte: addUtcDays(today, 1) },
        },
      },
      include: { ...ACTIVITY_INCLUDE, visit: true },
    });

    const imminent = candidates.filter((activity) => {
      const minutes = minutesUntilStart(
        activity.visit,
        activity.startTime,
        now,
      );
      return minutes > 0 && minutes <= CANCEL_WINDOW_MINUTES;
    });

    const result: AutoCancelResult = {
      scanned: candidates.length,
      inWindow: imminent.length,
      cancelled: 0,
      skipped: 0,
    };
    if (imminent.length === 0) {
      return result;
    }

    const byVisit = new Map<number, Candidate[]>();
    for (const activity of imminent) {
      byVisit.set(activity.visitId, [
        ...(byVisit.get(activity.visitId) ?? []),
        activity,
      ]);
    }

    const fresh = await this.fetchFreshVisits(
      [...byVisit.values()].map((activities) => activities[0].visit),
    );
    const cancelledStateId = await this.getStateId(
      ACTIVITY_STATE.CANCELLED_BY_SYSTEM,
    );

    for (const [visitId, activities] of byVisit) {
      try {
        const visit =
          fresh.get(visitId) ?? this.usableStored(activities[0].visit, now);
        if (!visit) {
          result.skipped += activities.length;
          continue;
        }

        for (const activity of activities) {
          const wasCancelled = await this.cancelIfNeeded(
            activity,
            visit,
            cancelledStateId,
            now,
          );
          if (wasCancelled) {
            result.cancelled += 1;
          } else {
            result.skipped += 1;
          }
        }
      } catch (error) {
        result.skipped += activities.length;
        this.logger.warn(
          `Fallo al revisar las actividades de la visita ${visitId}: ${(error as Error).message}`,
        );
      }
    }

    return result;
  }

  // Pide el pronóstico actual (una consulta por grupo de coordenadas), lo
  // guarda en la visita y reevalúa viabilidad y avisos como lo hace el cron de
  // 6 h. Las visitas sin dato fresco no aparecen en el mapa devuelto.
  private async fetchFreshVisits(visits: Visit[]): Promise<Map<number, Visit>> {
    const groups = new Map<string, Visit[]>();
    for (const visit of visits) {
      const key = `${visit.latitude.toNumber().toFixed(COORDINATE_PRECISION)}|${visit.longitude.toNumber().toFixed(COORDINATE_PRECISION)}`;
      groups.set(key, [...(groups.get(key) ?? []), visit]);
    }

    const fresh = new Map<number, Visit>();

    for (const group of groups.values()) {
      try {
        const timestamps = group.map((visit) => visit.date.getTime());
        const forecasts = await this.weather.getForecastRange(
          group[0].latitude.toNumber(),
          group[0].longitude.toNumber(),
          new Date(Math.min(...timestamps)),
          new Date(Math.max(...timestamps)),
        );

        for (const visit of group) {
          const forecast = forecasts.get(formatVisitDate(visit.date));
          if (!forecast?.snapshot || !forecast.hourly) {
            continue;
          }

          const updated = await this.prisma.visit.update({
            where: { id: visit.id },
            data: buildForecastFields(forecast),
          });
          fresh.set(visit.id, updated);

          try {
            await this.viability.evaluateVisitActivities(updated);
          } catch (error) {
            this.logger.warn(
              `Fallo al reevaluar actividades de la visita ${visit.id}: ${(error as Error).message}`,
            );
          }
        }
      } catch (error) {
        this.logger.warn(
          `Fallo al refrescar el pronóstico del grupo: ${(error as Error).message}`,
        );
      }
    }

    return fresh;
  }

  // Si no hubo pronóstico fresco, el guardado sirve solo si es reciente y
  // tiene detalle horario.
  private usableStored(visit: Visit, now: Date): Visit | null {
    if (!visit.weatherUpdate || !parseHourlyForecast(visit.hourlyForecast)) {
      return null;
    }
    const ageMinutes = (now.getTime() - visit.weatherUpdate.getTime()) / 60_000;
    return ageMinutes <= STORED_FORECAST_MAX_AGE_MINUTES ? visit : null;
  }

  private async cancelIfNeeded(
    activity: Candidate,
    visit: Visit,
    cancelledStateId: number,
    now: Date,
  ): Promise<boolean> {
    const desired = activity.activityWeathers
      .map((link) => link.weatherCondition.name)
      .filter(isWeatherConditionName);

    const probability = computeActivityProbability({
      type: activity.type,
      desired,
      startTime: activity.startTime,
      endTime: activity.endTime,
      visit,
    });

    if (probability === null || probability >= CANCEL_THRESHOLD) {
      return false;
    }

    const hourly = parseHourlyForecast(visit.hourlyForecast);
    const hours = hourly
      ? getSlotForecast(
          hourly,
          formatVisitDate(visit.date),
          activity.startTime,
          activity.endTime,
        ).hours
      : [];

    const { count } = await this.prisma.activity.updateMany({
      where: {
        id: activity.id,
        reactivatedAt: null,
        state: { name: ACTIVITY_STATE.PLANNED },
      },
      data: {
        stateId: cancelledStateId,
        probability,
        cancelledAt: now,
        cancelReason: buildAutoCancelReason(
          probability,
          CANCEL_THRESHOLD,
          hours,
        ),
      },
    });

    if (count === 0) {
      return false;
    }

    await this.notifications.notify(
      visit.userId,
      { id: activity.id, visitId: activity.visitId, name: activity.name },
      NotificationType.ACTIVITY_AUTO_CANCELLED,
    );
    return true;
  }

  private async getStateId(name: string): Promise<number> {
    const state = await this.prisma.state.findUnique({ where: { name } });

    if (!state) {
      throw new InternalServerErrorException(
        `El estado '${name}' no está configurado`,
      );
    }

    return state.id;
  }
}
