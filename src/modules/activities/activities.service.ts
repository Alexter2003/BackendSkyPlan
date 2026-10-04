import {
  BadRequestException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Visit } from '@prisma/client';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  assertDateHasArrived,
  assertIsPlanned,
} from '../visits/utils/visits.utils.js';
import { isWeatherConditionName } from '../weather/utils/weather-conditions.utils.js';
import type { WeatherConditionName } from '../weather/constants/weather-conditions.constants.js';
import type { CreateActivityDto } from './dto/create-activity.dto.js';
import type { ListActivitiesQueryDto } from './dto/list-activities-query.dto.js';
import type { UpdateActivityDto } from './dto/update-activity.dto.js';
import type { ActivityPublic } from './interfaces/activity-public.interface.js';
import {
  ACTIVITY_INCLUDE,
  ACTIVITY_STATE,
  assertForecastCompatible,
  assertNoContradictions,
  assertNoOverlap,
  assertValidTimeRange,
  parseTime,
  toActivityPublic,
} from './utils/activities.utils.js';
import type { ActivityWithRelations } from './utils/activities.utils.js';

const VIABILITY_PENDING_MESSAGE =
  'Actividad guardada. Se validará contra el clima cuando la fecha esté dentro de los próximos 10 días';

type ActivityWithVisit = ActivityWithRelations & { visit: Visit };

/**
 * Orden de validación al crear/editar una actividad (de la más barata a la
 * más cara; la primera que falla corta el flujo):
 *  1. La visita existe, es del usuario y está activa           -> 404
 *  2. La visita sigue en PLANNED                                -> 400
 *  3. startTime < endTime                                       -> 400
 *  4. Todas las condiciones climáticas existen en el catálogo   -> 400
 *  5. Las condiciones no se contradicen entre sí                -> 400
 *  6. El horario no se cruza con otra actividad de la visita    -> 409
 *  7. Solo OUTDOOR: el clima guardado en la visita es
 *     compatible con TODAS las condiciones elegidas             -> 422
 *     (sin datos de clima todavía queda `isViable = null`).
 */
@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: number,
    dto: CreateActivityDto,
  ): Promise<ServiceResponse<ActivityPublic>> {
    const visit = await this.findOwnedVisit(userId, dto.visitId);
    assertIsPlanned(visit);

    const start = parseTime(dto.startTime);
    const end = parseTime(dto.endTime);
    assertValidTimeRange(start, end);

    const names = await this.resolveConditionNames(dto.weatherConditionIds);
    assertNoContradictions(names);
    await assertNoOverlap(this.prisma, visit.id, start, end);

    const isViable = assertForecastCompatible(
      { type: dto.type, desired: names, weather: visit },
      visit.date,
    );
    const stateId = await this.getStateId(ACTIVITY_STATE.PLANNED);

    const activity = await this.prisma.activity.create({
      data: {
        visitId: visit.id,
        stateId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        startTime: start,
        endTime: end,
        isViable,
        viabilityCheckedAt: isViable === null ? null : new Date(),
        activityWeathers: {
          create: dto.weatherConditionIds.map((weatherConditionId) => ({
            weatherConditionId,
          })),
        },
      },
      include: ACTIVITY_INCLUDE,
    });

    return {
      status: HttpStatus.CREATED,
      message:
        isViable === null
          ? VIABILITY_PENDING_MESSAGE
          : 'Actividad creada exitosamente',
      data: toActivityPublic(activity, visit.date),
    };
  }

  async findAll(
    userId: number,
    query: ListActivitiesQueryDto,
  ): Promise<ServiceResponse<ActivityPublic[]>> {
    const visit = await this.findOwnedVisit(userId, query.visitId);

    const activities = await this.prisma.activity.findMany({
      where: { visitId: visit.id, isActive: true },
      include: ACTIVITY_INCLUDE,
      orderBy: { startTime: 'asc' },
    });

    return {
      status: HttpStatus.OK,
      message: 'Actividades obtenidas exitosamente',
      data: activities.map((activity) =>
        toActivityPublic(activity, visit.date),
      ),
    };
  }

  async findOne(
    userId: number,
    id: number,
  ): Promise<ServiceResponse<ActivityPublic>> {
    const activity = await this.findOwnedActivity(userId, id);

    return {
      status: HttpStatus.OK,
      message: 'Actividad obtenida exitosamente',
      data: toActivityPublic(activity, activity.visit.date),
    };
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateActivityDto,
  ): Promise<ServiceResponse<ActivityPublic>> {
    const existing = await this.findOwnedActivity(userId, id);
    this.assertActivityIsPlanned(existing);
    assertIsPlanned(existing.visit);

    const start = dto.startTime ? parseTime(dto.startTime) : existing.startTime;
    const end = dto.endTime ? parseTime(dto.endTime) : existing.endTime;
    const type = dto.type ?? existing.type;

    const scheduleChanged =
      dto.startTime !== undefined || dto.endTime !== undefined;
    const needsRevalidation =
      scheduleChanged ||
      dto.type !== undefined ||
      dto.weatherConditionIds !== undefined;

    let viability: {
      isViable: boolean | null;
      viabilityCheckedAt: Date | null;
    } | null = null;
    let message = 'Actividad actualizada exitosamente';

    if (needsRevalidation) {
      assertValidTimeRange(start, end);

      const names = dto.weatherConditionIds
        ? await this.resolveConditionNames(dto.weatherConditionIds)
        : existing.activityWeathers
            .map((link) => link.weatherCondition.name)
            .filter(isWeatherConditionName);
      assertNoContradictions(names);

      if (scheduleChanged) {
        await assertNoOverlap(this.prisma, existing.visitId, start, end, id);
      }

      const isViable = assertForecastCompatible(
        { type, desired: names, weather: existing.visit },
        existing.visit.date,
      );
      viability = {
        isViable,
        viabilityCheckedAt: isViable === null ? null : new Date(),
      };
      if (isViable === null) {
        message = VIABILITY_PENDING_MESSAGE;
      }
    }

    const activity = await this.prisma.activity.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.startTime !== undefined ? { startTime: start } : {}),
        ...(dto.endTime !== undefined ? { endTime: end } : {}),
        ...viability,
        ...(dto.weatherConditionIds
          ? {
              activityWeathers: {
                deleteMany: {},
                create: dto.weatherConditionIds.map((weatherConditionId) => ({
                  weatherConditionId,
                })),
              },
            }
          : {}),
      },
      include: ACTIVITY_INCLUDE,
    });

    return {
      status: HttpStatus.OK,
      message,
      data: toActivityPublic(activity, existing.visit.date),
    };
  }

  // Checklist del día de la visita: el usuario marca la actividad como hecha.
  async complete(
    userId: number,
    id: number,
  ): Promise<ServiceResponse<ActivityPublic>> {
    const existing = await this.findOwnedActivity(userId, id);
    this.assertActivityIsPlanned(existing);
    assertDateHasArrived(existing.visit.date);

    const stateId = await this.getStateId(ACTIVITY_STATE.COMPLETED);
    const activity = await this.prisma.activity.update({
      where: { id },
      data: { stateId, completedAt: new Date() },
      include: ACTIVITY_INCLUDE,
    });

    return {
      status: HttpStatus.OK,
      message: 'Actividad completada exitosamente',
      data: toActivityPublic(activity, existing.visit.date),
    };
  }

  // Checklist: el usuario decide que ya no la va a realizar. Puede hacerlo en
  // cualquier momento mientras la actividad siga planificada.
  async cancel(
    userId: number,
    id: number,
  ): Promise<ServiceResponse<ActivityPublic>> {
    const existing = await this.findOwnedActivity(userId, id);
    this.assertActivityIsPlanned(existing);

    const stateId = await this.getStateId(ACTIVITY_STATE.CANCELLED);
    const activity = await this.prisma.activity.update({
      where: { id },
      data: { stateId },
      include: ACTIVITY_INCLUDE,
    });

    return {
      status: HttpStatus.OK,
      message: 'Actividad cancelada exitosamente',
      data: toActivityPublic(activity, existing.visit.date),
    };
  }

  async remove(userId: number, id: number): Promise<ServiceResponse<null>> {
    await this.findOwnedActivity(userId, id);

    await this.prisma.activity.update({
      where: { id },
      data: { isActive: false },
    });

    return {
      status: HttpStatus.OK,
      message: 'Actividad eliminada exitosamente',
      data: null,
    };
  }

  private async findOwnedVisit(
    userId: number,
    visitId: number,
  ): Promise<Visit> {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, userId, isActive: true },
    });

    if (!visit) {
      throw new NotFoundException('Ubicación no encontrada');
    }

    return visit;
  }

  private async findOwnedActivity(
    userId: number,
    id: number,
  ): Promise<ActivityWithVisit> {
    const activity = await this.prisma.activity.findFirst({
      where: { id, isActive: true, visit: { userId, isActive: true } },
      include: { ...ACTIVITY_INCLUDE, visit: true },
    });

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada');
    }

    return activity;
  }

  // Una actividad completada o cancelada queda congelada.
  private assertActivityIsPlanned(activity: ActivityWithRelations): void {
    if (activity.state.name === ACTIVITY_STATE.COMPLETED) {
      throw new BadRequestException('La actividad ya fue completada');
    }
    if (activity.state.name === ACTIVITY_STATE.CANCELLED) {
      throw new BadRequestException('La actividad está cancelada');
    }
  }

  private async resolveConditionNames(
    ids: number[],
  ): Promise<WeatherConditionName[]> {
    const conditions = await this.prisma.weatherCondition.findMany({
      where: { id: { in: ids } },
    });

    const names = conditions.map((condition) => condition.name);
    if (
      conditions.length !== ids.length ||
      !names.every(isWeatherConditionName)
    ) {
      throw new BadRequestException('Condición climática inválida');
    }

    return names;
  }

  private async getStateId(name: string): Promise<number> {
    const state = await this.prisma.state.findUnique({ where: { name } });

    if (!state) {
      throw new InternalServerErrorException(
        `El estado '${name}' no está configurado`,
      );
    }

    return state.id;
  }
}
