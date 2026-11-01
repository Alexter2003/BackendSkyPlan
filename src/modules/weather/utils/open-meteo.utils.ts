import type {
  HourlyForecast,
  HourlyForecastHour,
} from '../interfaces/hourly-forecast.interface.js';
import type {
  DayForecast,
  WeatherSnapshot,
} from '../interfaces/weather-port.interface.js';

export interface OpenMeteoHourlyResponse {
  utc_offset_seconds?: number;
  hourly?: {
    time: string[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    precipitation?: (number | null)[];
    pressure_msl?: (number | null)[];
    cloud_cover?: (number | null)[];
    weather_code?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    precipitation_probability?: (number | null)[];
  };
}

// Clave del mapa devuelto: "YYYY-MM-DD" (la porción de fecha de `hourly.time`).
export function parseOpenMeteoRange(
  raw: OpenMeteoHourlyResponse,
  targetHour: number,
): Map<string, WeatherSnapshot> {
  const snapshots = new Map<string, WeatherSnapshot>();
  const hourly = raw.hourly;
  if (!hourly) {
    return snapshots;
  }

  const targetHourSuffix = `T${targetHour.toString().padStart(2, '0')}:00`;

  hourly.time.forEach((time, index) => {
    if (!time.endsWith(targetHourSuffix)) {
      return;
    }

    const temperature = hourly.temperature_2m?.[index];
    const humidity = hourly.relative_humidity_2m?.[index];
    const precipitation = hourly.precipitation?.[index];
    const atmosphericPressure = hourly.pressure_msl?.[index];
    const cloudCover = hourly.cloud_cover?.[index];
    const weatherCode = hourly.weather_code?.[index];
    const windSpeed = hourly.wind_speed_10m?.[index];

    if (
      temperature == null ||
      humidity == null ||
      precipitation == null ||
      atmosphericPressure == null ||
      cloudCover == null ||
      weatherCode == null ||
      windSpeed == null
    ) {
      return;
    }

    snapshots.set(time.slice(0, 10), {
      temperature,
      humidity,
      precipitation,
      atmosphericPressure,
      cloudCover,
      weatherCode,
      windSpeed,
    });
  });

  return snapshots;
}

/**
 * Arma el pronóstico horario de cada fecha de la respuesta. Una hora con
 * cualquier dato faltante se omite (la probabilidad de las actividades que la
 * cubran quedará nula en vez de inventar un valor). Sin `utc_offset_seconds`
 * no se puede ubicar la hora local, así que no hay pronóstico horario.
 * Clave del mapa: "YYYY-MM-DD".
 */
export function parseOpenMeteoHourly(
  raw: OpenMeteoHourlyResponse,
): Map<string, HourlyForecast> {
  const forecasts = new Map<string, HourlyForecast>();
  const hourly = raw.hourly;
  const utcOffsetSeconds = raw.utc_offset_seconds;
  if (!hourly || typeof utcOffsetSeconds !== 'number') {
    return forecasts;
  }

  hourly.time.forEach((time, index) => {
    const weatherCode = hourly.weather_code?.[index];
    const precipitation = hourly.precipitation?.[index];
    const cloudCover = hourly.cloud_cover?.[index];
    const windSpeed = hourly.wind_speed_10m?.[index];
    const precipitationProbability = hourly.precipitation_probability?.[index];

    if (
      weatherCode == null ||
      precipitation == null ||
      cloudCover == null ||
      windSpeed == null ||
      precipitationProbability == null
    ) {
      return;
    }

    const hour: HourlyForecastHour = {
      time,
      weatherCode,
      precipitation,
      cloudCover,
      windSpeed,
      precipitationProbability,
    };

    const date = time.slice(0, 10);
    const forecast = forecasts.get(date);
    if (forecast) {
      forecast.hours.push(hour);
    } else {
      forecasts.set(date, { utcOffsetSeconds, hours: [hour] });
    }
  });

  return forecasts;
}

export function parseOpenMeteoForecast(
  raw: OpenMeteoHourlyResponse,
  targetHour: number,
): Map<string, DayForecast> {
  const snapshots = parseOpenMeteoRange(raw, targetHour);
  const hourly = parseOpenMeteoHourly(raw);
  const forecasts = new Map<string, DayForecast>();

  for (const date of new Set([...snapshots.keys(), ...hourly.keys()])) {
    forecasts.set(date, {
      snapshot: snapshots.get(date) ?? null,
      hourly: hourly.get(date) ?? null,
    });
  }

  return forecasts;
}
