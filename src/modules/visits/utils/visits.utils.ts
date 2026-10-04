import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Visit } from '@prisma/client';
import { VisitStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { WeatherSnapshot } from '../../weather/interfaces/weather-port.interface.js';
import type { ActivityPublic } from '../../activities/interfaces/activity-public.interface.js';
import type {
  VisitDetail,
  VisitPublic,
} from '../interfaces/visit-public.interface.js';

export interface VisitWeatherFields {
  temperature: number | null;
  precipitation: number | null;
  humidity: number | null;
  atmosphericPressure: number | null;
  cloudCover: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  weatherUpdate: Date | null;
}

export function parseVisitDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function formatVisitDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatTime(date: Date): string {
  return date.toISOString().slice(11, 16);
}

export function toVisitPublic(visit: Visit): VisitPublic {
  return {
    id: visit.id,
    name: visit.name,
    latitude: visit.latitude.toNumber(),
    longitude: visit.longitude.toNumber(),
    date: formatVisitDate(visit.date),
    status: visit.status,
    temperature: visit.temperature,
    precipitation: visit.precipitation,
    humidity: visit.humidity,
    atmosphericPressure: visit.atmosphericPressure,
    cloudCover: visit.cloudCover,
    windSpeed: visit.windSpeed,
    weatherCode: visit.weatherCode,
    weatherUpdate: visit.weatherUpdate,
    createdAt: visit.createdAt,
  };
}

export function toVisitDetail(
  visit: Visit,
  activities: ActivityPublic[],
): VisitDetail {
  return {
    ...toVisitPublic(visit),
    activities,
  };
}

export function buildWeatherFields(
  snapshot: WeatherSnapshot | null,
): VisitWeatherFields {
  if (!snapshot) {
    return {
      temperature: null,
      precipitation: null,
      humidity: null,
      atmosphericPressure: null,
      cloudCover: null,
      windSpeed: null,
      weatherCode: null,
      weatherUpdate: null,
    };
  }
  return {
    temperature: snapshot.temperature,
    precipitation: snapshot.precipitation,
    humidity: snapshot.humidity,
    atmosphericPressure: snapshot.atmosphericPressure,
    cloudCover: snapshot.cloudCover,
    windSpeed: snapshot.windSpeed,
    weatherCode: snapshot.weatherCode,
    weatherUpdate: new Date(),
  };
}

export function startOfUtcDay(date: Date): Date {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function assertNotPastDate(date: Date): void {
  const today = startOfUtcDay(new Date());

  if (date < today) {
    throw new BadRequestException(
      'La fecha de la visita no puede estar en el pasado',
    );
  }
}

export function assertIsPlanned(visit: Visit): void {
  if (visit.status === VisitStatus.COMPLETED) {
    throw new BadRequestException('La visita ya fue finalizada');
  }
  if (visit.status === VisitStatus.CANCELLED) {
    throw new BadRequestException('La visita está cancelada');
  }
}

export function assertDateHasArrived(date: Date): void {
  const today = startOfUtcDay(new Date());

  if (date > today) {
    throw new BadRequestException(
      'No puedes finalizar una visita cuya fecha aún no ha llegado',
    );
  }
}

export function isSameDate(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

export async function assertNoVisitOnDate(
  prisma: PrismaService,
  userId: number,
  date: Date,
  excludeId?: number,
): Promise<void> {
  const duplicate = await prisma.visit.findFirst({
    where: {
      userId,
      date,
      isActive: true,
      ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
    },
  });

  if (duplicate) {
    throw new ConflictException(
      'Ya tienes una ubicación registrada para esa fecha',
    );
  }
}
