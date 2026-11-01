import type {
  HourlyForecast,
  HourlyForecastHour,
} from '../interfaces/hourly-forecast.interface.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHour(value: unknown): HourlyForecastHour | null {
  if (!isRecord(value)) {
    return null;
  }

  const { time, weatherCode, precipitation, cloudCover, windSpeed } = value;
  const { precipitationProbability } = value;

  if (
    typeof time !== 'string' ||
    typeof weatherCode !== 'number' ||
    typeof precipitation !== 'number' ||
    typeof cloudCover !== 'number' ||
    typeof windSpeed !== 'number' ||
    typeof precipitationProbability !== 'number'
  ) {
    return null;
  }

  return {
    time,
    weatherCode,
    precipitation,
    cloudCover,
    windSpeed,
    precipitationProbability,
  };
}

/**
 * Lee el JSON guardado en `Visit.hourlyForecast`. Un valor ausente o con una
 * forma inesperada se trata como "sin datos" (null) en vez de lanzar: el
 * dominio decide qué hacer sin pronóstico.
 */
export function parseHourlyForecast(value: unknown): HourlyForecast | null {
  if (!isRecord(value) || !Array.isArray(value.hours)) {
    return null;
  }

  const { utcOffsetSeconds } = value;
  if (typeof utcOffsetSeconds !== 'number') {
    return null;
  }

  const hours: HourlyForecastHour[] = [];
  for (const raw of value.hours as unknown[]) {
    const hour = parseHour(raw);
    if (hour) {
      hours.push(hour);
    }
  }

  return hours.length > 0 ? { utcOffsetSeconds, hours } : null;
}

/** Busca la hora local `hour` (0-23) de la fecha `date` ("YYYY-MM-DD"). */
export function findForecastHour(
  forecast: HourlyForecast,
  date: string,
  hour: number,
): HourlyForecastHour | undefined {
  const time = `${date}T${hour.toString().padStart(2, '0')}:00`;
  return forecast.hours.find((candidate) => candidate.time === time);
}
