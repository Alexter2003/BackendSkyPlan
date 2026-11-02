import {
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { VisitStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityViabilityService } from '../activities/activity-viability.service.js';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { getDayForecast } from '../weather/utils/day-forecast.utils.js';
import { WEATHER_PORT } from '../weather/interfaces/weather-port.interface.js';
import type { WeatherPort } from '../weather/interfaces/weather-port.interface.js';
import {
  ACTIVITY_INCLUDE,
  ACTIVITY_STATE,
  toActivityPublic,
} from '../activities/utils/activities.utils.js';
import type { CreateVisitDto } from './dto/create-visit.dto.js';
import type { UpdateVisitDto } from './dto/update-visit.dto.js';
import type {
  VisitDetail,
  VisitPublic,
} from './interfaces/visit-public.interface.js';
import type { VisitForecastFields } from './utils/visits.utils.js';
import {
  emptyProgress,
  getSingleVisitProgress,
  getVisitProgress,
  progressFromStates,
} from './utils/visit-progress.utils.js';
import {
  assertDateHasArrived,
  assertIsPlanned,
  assertNoVisitOnDate,
  assertNotPastDate,
  buildForecastFields,
  isSameDate,
  parseVisitDate,
  toVisitDetail,
  toVisitPublic,
} from './utils/visits.utils.js';

const WEATHER_PENDING_MESSAGE =
  'Ubicación registrada. Los datos climáticos se cargarán cuando la fecha esté dentro de los próximos 10 días';

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WEATHER_PORT) private readonly weather: WeatherPort,
    private readonly viability: ActivityViabilityService,
  ) {}

  async create(
    userId: number,
    dto: CreateVisitDto,
  ): Promise<ServiceResponse<VisitPublic>> {
    const date = parseVisitDate(dto.date);
    assertNotPastDate(date);
    await assertNoVisitOnDate(this.prisma, userId, date);

    const forecast = await getDayForecast(
      this.weather,
      dto.latitude,
      dto.longitude,
      date,
    );

    const visit = await this.prisma.visit.create({
      data: {
        userId,
        name: dto.name,
        latitude: dto.latitude,
        longitude: dto.longitude,
        date,
        ...buildForecastFields(forecast),
      },
    });

    return {
      status: HttpStatus.CREATED,
      message: forecast?.snapshot
        ? 'Ubicación registrada exitosamente'
        : WEATHER_PENDING_MESSAGE,
      data: toVisitPublic(visit, emptyProgress()),
    };
  }

  async findAll(userId: number): Promise<ServiceResponse<VisitPublic[]>> {
    const visits = await this.prisma.visit.findMany({
      where: { userId, isActive: true },
      orderBy: { date: 'asc' },
    });
    const progress = await getVisitProgress(
      this.prisma,
      visits.map((visit) => visit.id),
    );

    return {
      status: HttpStatus.OK,
      message: 'Ubicaciones obtenidas exitosamente',
      data: visits.map((visit) =>
        toVisitPublic(visit, progress.get(visit.id) ?? emptyProgress()),
      ),
    };
  }

  async findOne(
    userId: number,
    id: number,
  ): Promise<ServiceResponse<VisitDetail>> {
    const visit = await this.prisma.visit.findFirst({
      where: { id, userId, isActive: true },
      include: {
        activities: {
          where: { isActive: true },
          include: ACTIVITY_INCLUDE,
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!visit) {
      throw new NotFoundException('Ubicación no encontrada');
    }

    return {
      status: HttpStatus.OK,
      message: 'Ubicación obtenida exitosamente',
      data: toVisitDetail(
        visit,
        visit.activities.map((activity) =>
          toActivityPublic(activity, visit.date),
        ),
        progressFromStates(
          visit.activities.map((activity) => activity.state.name),
        ),
      ),
    };
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateVisitDto,
  ): Promise<ServiceResponse<VisitPublic>> {
    const existing = await this.prisma.visit.findFirst({
      where: { id, userId, isActive: true },
    });

    if (!existing) {
      throw new NotFoundException('Ubicación no encontrada');
    }

    assertIsPlanned(existing);

    const nextDate = dto.date ? parseVisitDate(dto.date) : existing.date;
    const dateChanged =
      dto.date !== undefined && !isSameDate(nextDate, existing.date);
    const locationChanged =
      dto.latitude !== undefined || dto.longitude !== undefined;

    if (dateChanged) {
      assertNotPastDate(nextDate);
      await assertNoVisitOnDate(this.prisma, userId, nextDate, id);
    }

    let weatherFields: VisitForecastFields | Record<string, never> = {};
    let message = 'Ubicación actualizada exitosamente';

    if (dateChanged || locationChanged) {
      const nextLatitude = dto.latitude ?? existing.latitude.toNumber();
      const nextLongitude = dto.longitude ?? existing.longitude.toNumber();

      const forecast = await getDayForecast(
        this.weather,
        nextLatitude,
        nextLongitude,
        nextDate,
      );
      weatherFields = buildForecastFields(forecast);
      if (!forecast?.snapshot) {
        message = WEATHER_PENDING_MESSAGE;
      }
    }

    const visit = await this.prisma.visit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dateChanged ? { date: nextDate } : {}),
        ...weatherFields,
      },
    });

    // La fecha o ubicación cambió, así que el clima guardado es otro: las
    // actividades se reevalúan y se avisa si alguna cambió de viabilidad.
    if (dateChanged || locationChanged) {
      await this.viability.evaluateVisitActivities(visit);
    }

    return {
      status: HttpStatus.OK,
      message,
      data: toVisitPublic(
        visit,
        await getSingleVisitProgress(this.prisma, visit.id),
      ),
    };
  }

  async complete(
    userId: number,
    id: number,
  ): Promise<ServiceResponse<VisitPublic>> {
    const existing = await this.prisma.visit.findFirst({
      where: { id, userId, isActive: true },
    });

    if (!existing) {
      throw new NotFoundException('Ubicación no encontrada');
    }

    assertIsPlanned(existing);
    assertDateHasArrived(existing.date);

    const visit = await this.prisma.visit.update({
      where: { id },
      data: { status: VisitStatus.COMPLETED },
    });

    return {
      status: HttpStatus.OK,
      message: 'Visita finalizada exitosamente',
      data: toVisitPublic(
        visit,
        await getSingleVisitProgress(this.prisma, visit.id),
      ),
    };
  }

  async cancel(
    userId: number,
    id: number,
  ): Promise<ServiceResponse<VisitPublic>> {
    const existing = await this.prisma.visit.findFirst({
      where: { id, userId, isActive: true },
    });

    if (!existing) {
      throw new NotFoundException('Ubicación no encontrada');
    }

    assertIsPlanned(existing);

    // Al cancelar la visita, sus actividades pendientes se cancelan con ella.
    const cancelledState = await this.prisma.state.findUnique({
      where: { name: ACTIVITY_STATE.CANCELLED },
    });
    if (!cancelledState) {
      throw new InternalServerErrorException(
        `El estado '${ACTIVITY_STATE.CANCELLED}' no está configurado`,
      );
    }

    const visit = await this.prisma.$transaction(async (tx) => {
      await tx.activity.updateMany({
        where: {
          visitId: id,
          isActive: true,
          state: { name: ACTIVITY_STATE.PLANNED },
        },
        data: { stateId: cancelledState.id, cancelledAt: new Date() },
      });
      return tx.visit.update({
        where: { id },
        data: { status: VisitStatus.CANCELLED },
      });
    });

    return {
      status: HttpStatus.OK,
      message: 'Visita cancelada exitosamente',
      data: toVisitPublic(
        visit,
        await getSingleVisitProgress(this.prisma, visit.id),
      ),
    };
  }

  async remove(userId: number, id: number): Promise<ServiceResponse<null>> {
    const existing = await this.prisma.visit.findFirst({
      where: { id, userId, isActive: true },
    });

    if (!existing) {
      throw new NotFoundException('Ubicación no encontrada');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.visit.update({ where: { id }, data: { isActive: false } });
      await tx.activity.updateMany({
        where: { visitId: id },
        data: { isActive: false },
      });
    });

    return {
      status: HttpStatus.OK,
      message: 'Ubicación eliminada exitosamente',
      data: null,
    };
  }
}
