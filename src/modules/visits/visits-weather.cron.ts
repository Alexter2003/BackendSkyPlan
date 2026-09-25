import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { VisitStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FORECAST_MAX_DAYS } from '../weather/constants/weather.constants.js';
import { WEATHER_PORT } from '../weather/interfaces/weather-port.interface.js';
import type { WeatherPort } from '../weather/interfaces/weather-port.interface.js';
import {
  addUtcDays,
  buildWeatherFields,
  formatVisitDate,
  startOfUtcDay,
} from './utils/visits.utils.js';

// ~1km — muy por debajo de la resolución de grilla de Open-Meteo (~11km), así
// que agrupar por coordenada redondeada no cambia el pronóstico obtenido.
const COORDINATE_PRECISION = 2;
const GROUP_CONCURRENCY = 5;

interface VisitWeatherTarget {
  id: number;
  latitude: number;
  longitude: number;
  date: Date;
}

interface VisitWeatherGroup {
  latitude: number;
  longitude: number;
  visits: VisitWeatherTarget[];
}

@Injectable()
export class VisitsWeatherCron {
  private readonly logger = new Logger(VisitsWeatherCron.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WEATHER_PORT) private readonly weather: WeatherPort,
  ) {}

  @Cron('0 3 * * *', {
    name: 'refresh-visit-weather',
    timeZone: 'America/Guatemala',
  })
  async refreshUpcomingVisits(): Promise<void> {
    if (this.running) {
      this.logger.warn(
        'La corrida anterior aún está en curso, se omite esta ejecución',
      );
      return;
    }

    this.running = true;
    const startedAt = Date.now();
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const today = startOfUtcDay(new Date());
      const maxDate = addUtcDays(today, FORECAST_MAX_DAYS);

      const visits = await this.prisma.visit.findMany({
        where: {
          isActive: true,
          status: VisitStatus.PLANNED,
          date: { gte: today, lte: maxDate },
        },
        select: { id: true, latitude: true, longitude: true, date: true },
      });

      const targets: VisitWeatherTarget[] = visits.map((visit) => ({
        id: visit.id,
        latitude: visit.latitude.toNumber(),
        longitude: visit.longitude.toNumber(),
        date: visit.date,
      }));

      const groups = this.groupByCoordinate(targets);

      await this.runWithConcurrency(
        groups,
        GROUP_CONCURRENCY,
        async (group) => {
          try {
            const groupTimestamps = group.visits.map((visit) =>
              visit.date.getTime(),
            );
            const minDate = new Date(Math.min(...groupTimestamps));
            const maxGroupDate = new Date(Math.max(...groupTimestamps));

            const snapshots = await this.weather.getSnapshotRange(
              group.latitude,
              group.longitude,
              minDate,
              maxGroupDate,
            );

            for (const visit of group.visits) {
              const snapshot = snapshots.get(formatVisitDate(visit.date));
              if (!snapshot) {
                skipped += 1;
                continue;
              }

              await this.prisma.visit.update({
                where: { id: visit.id },
                data: buildWeatherFields(snapshot),
              });
              updated += 1;
            }
          } catch (error) {
            failed += group.visits.length;
            this.logger.warn(
              `Fallo al refrescar el grupo (${group.latitude}, ${group.longitude}): ${(error as Error).message}`,
            );
          }
        },
      );

      this.logger.log(
        `Cron de clima: ${targets.length} visitas escaneadas, ${groups.length} grupos, ` +
          `${updated} actualizadas, ${skipped} sin dato, ${failed} fallidas ` +
          `(${Date.now() - startedAt}ms)`,
      );
    } finally {
      this.running = false;
    }
  }

  private groupByCoordinate(
    targets: VisitWeatherTarget[],
  ): VisitWeatherGroup[] {
    const groups = new Map<string, VisitWeatherGroup>();

    for (const target of targets) {
      const key = `${target.latitude.toFixed(COORDINATE_PRECISION)}|${target.longitude.toFixed(COORDINATE_PRECISION)}`;
      const group = groups.get(key);

      if (group) {
        group.visits.push(target);
      } else {
        groups.set(key, {
          latitude: target.latitude,
          longitude: target.longitude,
          visits: [target],
        });
      }
    }

    return [...groups.values()];
  }

  private async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    task: (item: T) => Promise<void>,
  ): Promise<void> {
    let index = 0;

    const worker = async (): Promise<void> => {
      while (index < items.length) {
        const current = items[index];
        index += 1;
        await task(current);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, worker),
    );
  }
}
