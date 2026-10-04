import type { WeatherSnapshot } from '../interfaces/weather-port.interface.js';

export interface OpenMeteoHourlyResponse {
  hourly?: {
    time: string[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    precipitation?: (number | null)[];
    pressure_msl?: (number | null)[];
    cloud_cover?: (number | null)[];
    weather_code?: (number | null)[];
    wind_speed_10m?: (number | null)[];
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
