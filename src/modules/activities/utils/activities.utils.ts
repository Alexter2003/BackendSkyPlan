import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  Activity,
  ActivityType,
  ActivityWeather,
  Prisma,
  State,
  WeatherCondition,
} from '@prisma/client';
import { ActivityType as ActivityTypeEnum } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { WEATHER_CONDITION_LABELS } from '../../weather/constants/weather-conditions.constants.js';
import type { WeatherConditionName } from '../../weather/constants/weather-conditions.constants.js';
import type { HourlyForecastHour } from '../../weather/interfaces/hourly-forecast.interface.js';
import { parseHourlyForecast } from '../../weather/utils/hourly-forecast.utils.js';
import {
  computeProbability,
  minutesOfDay,
  toProbabilityBand,
} from './activity-probability.utils.js';
import {
  evaluateConditions,
  findConflicts,
  toVisitWeatherData,
} from '../../weather/utils/weather-conditions.utils.js';
import {
  formatTime,
  formatVisitDate,
} from '../../visits/utils/visits.utils.js';
import type { ActivityPublic } from '../interfaces/activity-public.interface.js';

// Nombres de las filas de la tabla State que usa una actividad.
export const ACTIVITY_STATE = {
  PLANNED: 'planned',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  CANCELLED_BY_SYSTEM: 'cancelled_by_system',
} as const;

// Única fuente de verdad de "está cancelada": cubre la cancelación manual y la
// hecha por el sistema. No comparar contra ACTIVITY_STATE.CANCELLED a mano.
export const CANCELLED_STATE_NAMES: readonly string[] = [
  ACTIVITY_STATE.CANCELLED,
  ACTIVITY_STATE.CANCELLED_BY_SYSTEM,
];

export function isCancelled(stateName: string): boolean {
  return CANCELLED_STATE_NAMES.includes(stateName);
}

export const ACTIVITY_INCLUDE = {
  state: true,
  activityWeathers: { include: { weatherCondition: true } },
} satisfies Prisma.ActivityInclude;

export type ActivityWithRelations = Activity & {
  state: State;
  activityWeathers: (ActivityWeather & {
    weatherCondition: WeatherCondition;
  })[];
};

export function parseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00Z`);
}

export function toActivityPublic(
  activity: ActivityWithRelations,
  visitDate: Date,
): ActivityPublic {
  return {
    id: activity.id,
    visitId: activity.visitId,
    name: activity.name,
    description: activity.description,
    date: formatVisitDate(visitDate),
    startTime: formatTime(activity.startTime),
    endTime: formatTime(activity.endTime),
    type: activity.type,
    state: { id: activity.state.id, name: activity.state.name },
    isViable: activity.isViable,
    viabilityCheckedAt: activity.viabilityCheckedAt,
    probability: activity.probability,
    probabilityBand: toProbabilityBand(activity.probability),
    completedAt: activity.completedAt,
    cancelReason: activity.cancelReason,
    cancelledAt: activity.cancelledAt,
    weatherConditions: activity.activityWeathers.map((link) => ({
      id: link.weatherCondition.id,
      name: link.weatherCondition.name,
    })),
  };
}

/**
 * Dos rangos se cruzan si cada uno empieza antes de que termine el otro.
 * Los extremos son exclusivos: una actividad que termina a las 10:00 y otra
 * que empieza a las 10:00 NO se cruzan.
 */
export function timesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && endA > startB;
}

export function assertValidTimeRange(start: Date, end: Date): void {
  if (start >= end) {
    throw new BadRequestException(
      'La hora de inicio debe ser anterior a la hora de fin',
    );
  }
}

/**
 * Regla de negocio: no puede haber dos actividades cruzadas en horario dentro
 * de la misma ubicación. Las canceladas y eliminadas no ocupan horario. En
 * edición se excluye la propia actividad con `excludeId`.
 */
export async function assertNoOverlap(
  prisma: PrismaService,
  visitId: number,
  start: Date,
  end: Date,
  excludeId?: number,
): Promise<void> {
  const overlapping = await prisma.activity.findFirst({
    where: {
      visitId,
      isActive: true,
      state: { name: { notIn: [...CANCELLED_STATE_NAMES] } },
      startTime: { lt: end },
      endTime: { gt: start },
      ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
    },
  });

  if (overlapping) {
    throw new ConflictException(
      `El horario se cruza con la actividad '${overlapping.name}' ` +
        `(${formatTime(overlapping.startTime)}–${formatTime(overlapping.endTime)})`,
    );
  }
}

/**
 * Regla de negocio: el usuario no puede elegir condiciones climáticas
 * contradictorias entre sí (ej. soleado + lluvia). Se valida en backend
 * aunque el cliente ya deshabilite las opciones.
 */
export function assertNoContradictions(
  names: readonly WeatherConditionName[],
): void {
  const conflicts = findConflicts(names);

  if (conflicts.length > 0) {
    const detail = conflicts
      .map(
        ([a, b]) =>
          `'${WEATHER_CONDITION_LABELS[a]}' y '${WEATHER_CONDITION_LABELS[b]}'`,
      )
      .join(', ');
    throw new BadRequestException(
      `Las condiciones climáticas elegidas son contradictorias: ${detail}`,
    );
  }
}

interface ViabilityInput {
  type: ActivityType;
  desired: readonly WeatherConditionName[];
  weather: Parameters<typeof toVisitWeatherData>[0];
}

/**
 * Viabilidad de una actividad según el clima guardado en su visita:
 * - INDOOR: siempre viable, el clima exterior no la afecta.
 * - OUTDOOR sin datos de clima completos: null (pendiente de validar).
 * - OUTDOOR con datos: viable solo si TODAS las condiciones elegidas se
 *   cumplen (semántica AND).
 * `detail` trae el motivo para armar el mensaje cuando no es viable.
 */
export function resolveViability(input: ViabilityInput): {
  isViable: boolean | null;
  detail: string | null;
} {
  if (input.type === ActivityTypeEnum.INDOOR) {
    return { isViable: true, detail: null };
  }

  const data = toVisitWeatherData(input.weather);
  if (!data) {
    return { isViable: null, detail: null };
  }

  const evaluation = evaluateConditions(input.desired, data);
  if (evaluation.compatible) {
    return { isViable: true, detail: null };
  }

  const unmet = evaluation.unmet
    .map((name) => WEATHER_CONDITION_LABELS[name])
    .join(', ');
  return {
    isViable: false,
    detail: `el pronóstico indica ${evaluation.summary}, incompatible con: ${unmet}`,
  };
}

/**
 * Regla de negocio: solo se permite crear (o editar) una actividad al aire
 * libre si su clima deseado es consistente con el pronóstico de la visita.
 */
export function assertForecastCompatible(
  input: ViabilityInput,
  visitDate: Date,
): boolean | null {
  const { isViable, detail } = resolveViability(input);

  if (isViable === false) {
    throw new UnprocessableEntityException(
      `No se puede guardar la actividad: para el ${formatVisitDate(visitDate)} ${detail}`,
    );
  }

  return isViable;
}

interface ProbabilityVisitSource {
  date: Date;
  hourlyForecast: unknown;
}

/**
 * Probabilidad de realización de una actividad con el pronóstico horario que
 * guarda su visita. Es el único punto por el que pasan creación, edición,
 * reactivación, reagendado y los crons, para que el valor sea siempre el mismo.
 */
export function computeActivityProbability(input: {
  type: ActivityType;
  desired: readonly WeatherConditionName[];
  startTime: Date;
  endTime: Date;
  visit: ProbabilityVisitSource;
}): number | null {
  return computeProbability({
    type: input.type,
    desired: input.desired,
    date: formatVisitDate(input.visit.date),
    startTime: input.startTime,
    endTime: input.endTime,
    hourly: parseHourlyForecast(input.visit.hourlyForecast),
  });
}

// Desfase de Guatemala (UTC-6, sin horario de verano), la zona de los crons.
// Se usa solo cuando la visita aún no tiene pronóstico horario con su desfase.
const FALLBACK_UTC_OFFSET_SECONDS = -6 * 60 * 60;

/** Fecha de hoy en hora de Guatemala, como medianoche UTC (igual que `Visit.date`). */
export function localToday(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + FALLBACK_UTC_OFFSET_SECONDS * 1000);
  local.setUTCHours(0, 0, 0, 0);
  return local;
}

/**
 * Minutos que faltan para que empiece la actividad, en hora local de la
 * ubicación de su visita (negativo si ya empezó). `startTime` y `date` son
 * hora y fecha locales guardadas como UTC, por eso el "ahora" se desplaza con
 * el desfase de la ubicación antes de compararlo.
 */
export function minutesUntilStart(
  visit: ProbabilityVisitSource,
  startTime: Date,
  now: Date = new Date(),
): number {
  const offsetSeconds =
    parseHourlyForecast(visit.hourlyForecast)?.utcOffsetSeconds ??
    FALLBACK_UTC_OFFSET_SECONDS;
  const localNowMs = now.getTime() + offsetSeconds * 1000;
  const startMs = visit.date.getTime() + minutesOfDay(startTime) * 60_000;
  return (startMs - localNowMs) / 60_000;
}

export function hasActivityEnded(
  visit: ProbabilityVisitSource,
  endTime: Date,
  now: Date = new Date(),
): boolean {
  return minutesUntilStart(visit, endTime, now) <= 0;
}

const REASON_MAX_LENGTH = 500;

/**
 * Motivo legible que se guarda al cancelar por sistema: la probabilidad que
 * lo causó y el pronóstico de cada hora de la franja.
 */
export function buildAutoCancelReason(
  probability: number,
  threshold: number,
  hours: readonly HourlyForecastHour[],
): string {
  const detail = hours
    .map(
      (hour) =>
        `${hour.time.slice(11, 16)} (${hour.precipitationProbability}% de precipitación, ` +
        `${hour.windSpeed} km/h de viento, ${hour.cloudCover}% de nubosidad)`,
    )
    .join('; ');

  const reason =
    `Cancelada automáticamente: la probabilidad de realización bajó a ` +
    `${probability}% (mínimo ${threshold}%). Pronóstico de la franja: ${detail}`;

  return reason.length > REASON_MAX_LENGTH
    ? `${reason.slice(0, REASON_MAX_LENGTH - 1)}…`
    : reason;
}
