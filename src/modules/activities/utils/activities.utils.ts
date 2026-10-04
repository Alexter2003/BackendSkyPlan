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
} as const;

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
    completedAt: activity.completedAt,
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
      state: { name: { not: ACTIVITY_STATE.CANCELLED } },
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
