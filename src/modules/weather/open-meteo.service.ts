import { Injectable, Logger } from '@nestjs/common';
import {
  FORECAST_MAX_DAYS,
  OPEN_METEO_BASE_URL,
  REQUEST_TIMEOUT_MS,
  TARGET_HOUR,
} from './constants/weather.constants.js';
import { parseOpenMeteoRange } from './utils/open-meteo.utils.js';
import type { OpenMeteoHourlyResponse } from './utils/open-meteo.utils.js';
import type {
  WeatherPort,
  WeatherSnapshot,
} from './interfaces/weather-port.interface.js';

@Injectable()
export class OpenMeteoService implements WeatherPort {
  private readonly logger = new Logger(OpenMeteoService.name);

  async getSnapshot(
    latitude: number,
    longitude: number,
    date: Date,
  ): Promise<WeatherSnapshot | null> {
    const snapshots = await this.getSnapshotRange(
      latitude,
      longitude,
      date,
      date,
    );
    return snapshots.get(date.toISOString().slice(0, 10)) ?? null;
  }

  async getSnapshotRange(
    latitude: number,
    longitude: number,
    startDate: Date,
    endDate: Date,
  ): Promise<Map<string, WeatherSnapshot>> {
    const { today, maxDate } = this.getForecastBounds();
    const clippedStart = startDate < today ? today : startDate;
    const clippedEnd = endDate > maxDate ? maxDate : endDate;

    if (clippedStart > clippedEnd) {
      return new Map();
    }

    const startParam = clippedStart.toISOString().slice(0, 10);
    const endParam = clippedEnd.toISOString().slice(0, 10);

    const url = new URL(OPEN_METEO_BASE_URL);
    url.searchParams.set('latitude', latitude.toString());
    url.searchParams.set('longitude', longitude.toString());
    url.searchParams.set(
      'hourly',
      'temperature_2m,relative_humidity_2m,precipitation,pressure_msl',
    );
    url.searchParams.set('start_date', startParam);
    url.searchParams.set('end_date', endParam);
    url.searchParams.set('timezone', 'auto');

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `Open-Meteo respondió ${response.status} para (${latitude}, ${longitude}, ${startParam}..${endParam})`,
        );
        return new Map();
      }

      const raw = (await response.json()) as OpenMeteoHourlyResponse;
      const snapshots = parseOpenMeteoRange(raw, TARGET_HOUR);

      if (snapshots.size === 0) {
        this.logger.warn(
          `Open-Meteo no trajo datos horarios completos para (${latitude}, ${longitude}, ${startParam}..${endParam})`,
        );
      }

      return snapshots;
    } catch (error) {
      this.logger.warn(
        `Fallo al consultar Open-Meteo para (${latitude}, ${longitude}, ${startParam}..${endParam}): ${(error as Error).message}`,
      );
      return new Map();
    }
  }

  private getForecastBounds(): { today: Date; maxDate: Date } {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const maxDate = new Date(today);
    maxDate.setUTCDate(maxDate.getUTCDate() + FORECAST_MAX_DAYS);

    return { today, maxDate };
  }
}
