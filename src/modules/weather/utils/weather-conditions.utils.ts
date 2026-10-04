import {
  CLASSIFICATION_THRESHOLDS,
  WEATHER_CONDITION,
  WEATHER_CONDITION_CONFLICTS,
  WEATHER_CONDITION_LABELS,
  WEATHER_CONDITION_NAMES,
  WMO_CODES,
} from '../constants/weather-conditions.constants.js';
import type { WeatherConditionName } from '../constants/weather-conditions.constants.js';

// Datos climáticos de una visita contra los que se evalúan las actividades.
export interface VisitWeatherData {
  cloudCover: number; // %
  precipitation: number; // mm
  windSpeed: number; // km/h
  weatherCode: number; // WMO
}

export interface ConditionEvaluation {
  compatible: boolean;
  unmet: WeatherConditionName[];
  summary: string;
}

export function isWeatherConditionName(
  value: string,
): value is WeatherConditionName {
  return (WEATHER_CONDITION_NAMES as readonly string[]).includes(value);
}

/**
 * Arma los datos de clima de una visita. Devuelve null si falta cualquiera:
 * sin datos completos no se puede evaluar nada (la actividad queda "pendiente
 * de validar").
 */
export function toVisitWeatherData(visit: {
  cloudCover: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
}): VisitWeatherData | null {
  if (
    visit.cloudCover === null ||
    visit.precipitation === null ||
    visit.windSpeed === null ||
    visit.weatherCode === null
  ) {
    return null;
  }

  return {
    cloudCover: visit.cloudCover,
    precipitation: visit.precipitation,
    windSpeed: visit.windSpeed,
    weatherCode: visit.weatherCode,
  };
}

/**
 * Devuelve los pares de condiciones contradictorias dentro de `names`.
 * La contradicción es simétrica: se detecta sin importar el orden en que el
 * usuario eligió las condiciones. Las fuentes de verdad son los pares de
 * WEATHER_CONDITION_CONFLICTS.
 */
export function findConflicts(
  names: readonly WeatherConditionName[],
): [WeatherConditionName, WeatherConditionName][] {
  const selected = new Set(names);

  return WEATHER_CONDITION_CONFLICTS.filter(
    ([a, b]) => selected.has(a) && selected.has(b),
  ).map(([a, b]) => [a, b]);
}

/**
 * Traduce los datos numéricos del clima a las condiciones del catálogo que
 * se cumplen.
 *
 * - Precipitación: manda el código WMO; si el código no la indica, se usan
 *   los milímetros (>= 1 lluvia, >= 0.1 llovizna). Solo se reporta un tipo.
 * - Cielo: si hay precipitación nunca es soleado ni despejado. Si no, la
 *   nubosidad decide: < 30% despejado (sunny y clear), < 70% parcialmente
 *   nublado, >= 70% nublado.
 * - Viento: >= 30 km/h es ventoso, y se combina con cualquier otra condición.
 */
export function classifyWeather(
  data: VisitWeatherData,
): Set<WeatherConditionName> {
  const thresholds = CLASSIFICATION_THRESHOLDS;
  const result = new Set<WeatherConditionName>();

  const isSnow = (WMO_CODES.SNOW as readonly number[]).includes(
    data.weatherCode,
  );
  const isRain =
    (WMO_CODES.RAIN as readonly number[]).includes(data.weatherCode) ||
    data.precipitation >= thresholds.PRECIPITATION_RAIN_MIN;
  const isDrizzle =
    (WMO_CODES.DRIZZLE as readonly number[]).includes(data.weatherCode) ||
    data.precipitation >= thresholds.PRECIPITATION_DRIZZLE_MIN;

  if (isSnow) {
    result.add(WEATHER_CONDITION.SNOWY);
  } else if (isRain) {
    result.add(WEATHER_CONDITION.RAINY);
  } else if (isDrizzle) {
    result.add(WEATHER_CONDITION.DRIZZLE);
  }
  const hasPrecipitation = result.size > 0;

  if (data.cloudCover >= thresholds.CLOUD_COVER_PARTLY_CLOUDY_MAX) {
    result.add(WEATHER_CONDITION.CLOUDY);
  } else if (data.cloudCover >= thresholds.CLOUD_COVER_CLEAR_MAX) {
    result.add(WEATHER_CONDITION.PARTLY_CLOUDY);
  } else if (!hasPrecipitation) {
    result.add(WEATHER_CONDITION.SUNNY);
    result.add(WEATHER_CONDITION.CLEAR);
  }

  if (data.windSpeed >= thresholds.WIND_SPEED_WINDY_MIN) {
    result.add(WEATHER_CONDITION.WINDY);
  }

  return result;
}

/**
 * Evalúa las condiciones deseadas contra el clima de la visita con semántica
 * AND: la actividad es compatible solo si TODAS las condiciones elegidas se
 * cumplen. `unmet` lista las que no, y `summary` describe lo observado para
 * armar mensajes de error legibles.
 */
export function evaluateConditions(
  desired: readonly WeatherConditionName[],
  data: VisitWeatherData,
): ConditionEvaluation {
  const observed = classifyWeather(data);
  const unmet = desired.filter((name) => !observed.has(name));

  const observedLabels = [...observed].map(
    (name) => WEATHER_CONDITION_LABELS[name],
  );
  const summary =
    `${observedLabels.join(', ') || 'sin condiciones destacadas'} ` +
    `(${data.precipitation} mm, ${data.cloudCover}% de nubosidad, ` +
    `${data.windSpeed} km/h de viento)`;

  return { compatible: unmet.length === 0, unmet, summary };
}
