import { ActivityType } from '@prisma/client';
import type { HourlyForecast } from '../../weather/interfaces/hourly-forecast.interface.js';
import type { HourlyForecastHour } from '../../weather/interfaces/hourly-forecast.interface.js';
import { WEATHER_CONDITION } from '../../weather/constants/weather-conditions.constants.js';
import type { WeatherConditionName } from '../../weather/constants/weather-conditions.constants.js';
import { findForecastHour } from '../../weather/utils/hourly-forecast.utils.js';
import { classifyWeather } from '../../weather/utils/weather-conditions.utils.js';
import {
  BAND_GREEN_MIN,
  BAND_YELLOW_MIN,
  INDOOR_SEVERE_CAP,
  PROBABILITY_BAND,
} from '../constants/activity-probability.constants.js';
import type { ProbabilityBand } from '../constants/activity-probability.constants.js';

// Condiciones que se evalúan de forma determinista (se cumplen o no) contra
// el clima de cada hora. Las de precipitación no: dependen de la probabilidad
// de precipitación del pronóstico.
const DETERMINISTIC_CONDITIONS: ReadonlySet<WeatherConditionName> = new Set([
  WEATHER_CONDITION.SUNNY,
  WEATHER_CONDITION.CLEAR,
  WEATHER_CONDITION.PARTLY_CLOUDY,
  WEATHER_CONDITION.CLOUDY,
  WEATHER_CONDITION.WINDY,
]);

const PRECIPITATION_CONDITIONS: ReadonlySet<WeatherConditionName> = new Set([
  WEATHER_CONDITION.DRIZZLE,
  WEATHER_CONDITION.RAINY,
  WEATHER_CONDITION.SNOWY,
]);

export interface ProbabilityInput {
  type: ActivityType;
  desired: readonly WeatherConditionName[];
  // Fecha de la visita, "YYYY-MM-DD".
  date: string;
  // Horas locales de la actividad, guardadas como hora del día sobre 1970-01-01 UTC.
  startTime: Date;
  endTime: Date;
  hourly: HourlyForecast | null;
}

export function minutesOfDay(time: Date): number {
  return time.getUTCHours() * 60 + time.getUTCMinutes();
}

/** Horas locales (0-23) que toca la franja [startTime, endTime). */
export function slotHours(startTime: Date, endTime: Date): number[] {
  const first = Math.floor(minutesOfDay(startTime) / 60);
  const last = Math.ceil(minutesOfDay(endTime) / 60) - 1;

  const hours: number[] = [];
  for (let hour = first; hour <= last; hour += 1) {
    hours.push(hour);
  }
  return hours;
}

/**
 * Datos del pronóstico para las horas de la franja. `complete` es false si
 * falta alguna hora, en cuyo caso no se debe calcular una probabilidad.
 */
export function getSlotForecast(
  hourly: HourlyForecast,
  date: string,
  startTime: Date,
  endTime: Date,
): { hours: HourlyForecastHour[]; complete: boolean } {
  const hours: HourlyForecastHour[] = [];
  let complete = true;

  for (const hour of slotHours(startTime, endTime)) {
    const found = findForecastHour(hourly, date, hour);
    if (found) {
      hours.push(found);
    } else {
      complete = false;
    }
  }

  return { hours, complete };
}

function hourScore(
  hour: HourlyForecastHour,
  desired: readonly WeatherConditionName[],
): number {
  const observed = classifyWeather({
    cloudCover: hour.cloudCover,
    precipitation: hour.precipitation,
    windSpeed: hour.windSpeed,
    weatherCode: hour.weatherCode,
  });

  const deterministicMet = desired
    .filter((name) => DETERMINISTIC_CONDITIONS.has(name))
    .every((name) => observed.has(name));
  if (!deterministicMet) {
    return 0;
  }

  const chance = hour.precipitationProbability / 100;
  const wantsPrecipitation = desired.some((name) =>
    PRECIPITATION_CONDITIONS.has(name),
  );
  return wantsPrecipitation ? chance : 1 - chance;
}

function isSevere(hour: HourlyForecastHour): boolean {
  const observed = classifyWeather({
    cloudCover: hour.cloudCover,
    precipitation: hour.precipitation,
    windSpeed: hour.windSpeed,
    weatherCode: hour.weatherCode,
  });
  return (
    observed.has(WEATHER_CONDITION.SNOWY) ||
    observed.has(WEATHER_CONDITION.WINDY)
  );
}

/**
 * Probabilidad de realización (0-100): idoneidad del clima de la franja para
 * lo que pidió el usuario. No es una probabilidad meteorológica.
 *
 * - OUTDOOR: promedio, sobre las horas de la franja, de un puntaje por hora
 *   (1/0 por las condiciones de cielo y viento, por el factor de
 *   precipitación). Si falta cualquier hora, null: no se inventa un valor.
 * - INDOOR: 100, o INDOOR_SEVERE_CAP si alguna hora tiene nieve o viento fuerte.
 */
export function computeProbability(input: ProbabilityInput): number | null {
  if (input.type === ActivityType.INDOOR) {
    if (!input.hourly) {
      return 100;
    }
    const { hours } = getSlotForecast(
      input.hourly,
      input.date,
      input.startTime,
      input.endTime,
    );
    return hours.some(isSevere) ? INDOOR_SEVERE_CAP : 100;
  }

  if (!input.hourly) {
    return null;
  }

  const { hours, complete } = getSlotForecast(
    input.hourly,
    input.date,
    input.startTime,
    input.endTime,
  );
  if (!complete || hours.length === 0) {
    return null;
  }

  const total = hours.reduce(
    (sum, hour) => sum + hourScore(hour, input.desired),
    0,
  );
  return Math.round((total / hours.length) * 100);
}

export function toProbabilityBand(
  probability: number | null,
): ProbabilityBand | null {
  if (probability === null) {
    return null;
  }
  if (probability >= BAND_GREEN_MIN) {
    return PROBABILITY_BAND.GREEN;
  }
  if (probability >= BAND_YELLOW_MIN) {
    return PROBABILITY_BAND.YELLOW;
  }
  return PROBABILITY_BAND.RED;
}
