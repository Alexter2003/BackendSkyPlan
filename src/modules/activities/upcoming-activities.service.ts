import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { addUtcDays, formatVisitDate } from '../visits/utils/visits.utils.js';
import { parseHourlyForecast } from '../weather/utils/hourly-forecast.utils.js';
import { DEFAULT_PAGE_LIMIT } from './dto/list-upcoming-activities-query.dto.js';
import type { ListUpcomingActivitiesQueryDto } from './dto/list-upcoming-activities-query.dto.js';
import type {
  UpcomingActivitiesPage,
  UpcomingActivityPublic,
} from './interfaces/upcoming-activity-public.interface.js';
import { getSlotForecast } from './utils/activity-probability.utils.js';
import {
  ACTIVITY_INCLUDE,
  localToday,
  toActivityPublic,
} from './utils/activities.utils.js';
import type { ActivityWithRelations } from './utils/activities.utils.js';
import type { Visit } from '@prisma/client';

type UpcomingRow = ActivityWithRelations & { visit: Visit };

function toUpcomingPublic(activity: UpcomingRow): UpcomingActivityPublic {
  const hourly = parseHourlyForecast(activity.visit.hourlyForecast);
  const slot = hourly
    ? getSlotForecast(
        hourly,
        formatVisitDate(activity.visit.date),
        activity.startTime,
        activity.endTime,
      ).hours
    : [];

  return {
    ...toActivityPublic(activity, activity.visit.date),
    visit: {
      id: activity.visit.id,
      name: activity.visit.name,
      latitude: activity.visit.latitude.toNumber(),
      longitude: activity.visit.longitude.toNumber(),
      date: formatVisitDate(activity.visit.date),
      status: activity.visit.status,
    },
    forecast: slot.length > 0 ? slot : null,
  };
}

@Injectable()
export class UpcomingActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findUpcoming(
    userId: number,
    query: ListUpcomingActivitiesQueryDto,
  ): Promise<ServiceResponse<UpcomingActivitiesPage>> {
    const { probabilityMin, probabilityMax } = query;
    if (
      probabilityMin !== undefined &&
      probabilityMax !== undefined &&
      probabilityMin > probabilityMax
    ) {
      throw new BadRequestException(
        'probabilityMin no puede ser mayor que probabilityMax',
      );
    }

    if (query.visitId !== undefined) {
      const visit = await this.prisma.visit.findFirst({
        where: { id: query.visitId, userId, isActive: true },
        select: { id: true },
      });
      if (!visit) {
        throw new NotFoundException('Ubicación no encontrada');
      }
    }

    const today = localToday();
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const order = query.order ?? 'asc';

    const where: Prisma.ActivityWhereInput = {
      isActive: true,
      visit: {
        userId,
        isActive: true,
        ...(query.visitId !== undefined ? { id: query.visitId } : {}),
        date: {
          gte: today,
          ...(query.days !== undefined
            ? { lte: addUtcDays(today, query.days) }
            : {}),
        },
      },
      ...(query.state ? { state: { name: query.state } } : {}),
      ...(probabilityMin !== undefined || probabilityMax !== undefined
        ? { probability: { gte: probabilityMin, lte: probabilityMax } }
        : {}),
    };

    const orderBy: Prisma.ActivityOrderByWithRelationInput[] =
      query.sortBy === 'probability'
        ? [
            { probability: { sort: order, nulls: 'last' } },
            { visit: { date: 'asc' } },
            { startTime: 'asc' },
          ]
        : [{ visit: { date: order } }, { startTime: order }];

    const [rows, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: { ...ACTIVITY_INCLUDE, visit: true },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activity.count({ where }),
    ]);

    return {
      status: HttpStatus.OK,
      message: 'Actividades próximas obtenidas exitosamente',
      data: { items: rows.map(toUpcomingPublic), page, limit, total },
    };
  }
}
