import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ActivityType, Prisma, VisitStatus } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { ActivitiesService } from '../../../src/modules/activities/activities.service.js';
import { WEATHER_PORT } from '../../../src/modules/weather/interfaces/weather-port.interface.js';
import type { CreateActivityDto } from '../../../src/modules/activities/dto/create-activity.dto.js';

const userId = 1;

const sunnyWeather = {
  cloudCover: 5,
  precipitation: 0,
  windSpeed: 8,
  weatherCode: 0,
};
const rainyWeather = {
  cloudCover: 95,
  precipitation: 4.2,
  windSpeed: 8,
  weatherCode: 63,
};
const noWeather = {
  cloudCover: null,
  precipitation: null,
  windSpeed: null,
  weatherCode: null,
};

function visitWith(weather: object, overrides: object = {}) {
  return {
    id: 10,
    userId,
    name: 'Antigua Guatemala',
    latitude: new Prisma.Decimal(14.5586),
    longitude: new Prisma.Decimal(-90.7295),
    date: new Date('2026-10-05T00:00:00Z'),
    status: VisitStatus.PLANNED,
    hourlyForecast: null,
    isActive: true,
    ...weather,
    ...overrides,
  };
}

const conditions = [
  { id: 1, name: 'sunny', description: '' },
  { id: 2, name: 'rainy', description: '' },
  { id: 3, name: 'cloudy', description: '' },
  { id: 4, name: 'windy', description: '' },
];

function activityRow(overrides: object = {}) {
  return {
    id: 5,
    visitId: 10,
    stateId: 1,
    name: 'Caminata',
    description: 'Cerro de la Cruz',
    type: ActivityType.OUTDOOR,
    startTime: new Date('1970-01-01T09:00:00Z'),
    endTime: new Date('1970-01-01T11:00:00Z'),
    isViable: true,
    viabilityCheckedAt: new Date('2026-10-04T12:00:00Z'),
    probability: null,
    completedAt: null,
    cancelReason: null,
    cancelledAt: null,
    reactivatedAt: null,
    isActive: true,
    state: { id: 1, name: 'planned' },
    activityWeathers: [{ weatherCondition: conditions[0] }],
    ...overrides,
  };
}

const createDto: CreateActivityDto = {
  visitId: 10,
  name: 'Caminata',
  description: 'Cerro de la Cruz',
  startTime: '09:00',
  endTime: '11:00',
  type: ActivityType.OUTDOOR,
  weatherConditionIds: [1],
};

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let prisma: {
    visit: { findFirst: ReturnType<typeof vi.fn> };
    activity: Record<string, ReturnType<typeof vi.fn>>;
    weatherCondition: { findMany: ReturnType<typeof vi.fn> };
    state: { findUnique: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let tx: {
    visit: { create: ReturnType<typeof vi.fn> };
    activity: { update: ReturnType<typeof vi.fn> };
  };
  let weather: { getForecastRange: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));

    const states: Record<string, number> = {
      planned: 1,
      completed: 2,
      cancelled: 3,
      cancelled_by_system: 4,
    };
    prisma = {
      visit: { findFirst: vi.fn().mockResolvedValue(visitWith(sunnyWeather)) },
      activity: {
        create: vi.fn().mockResolvedValue(activityRow()),
        update: vi.fn().mockResolvedValue(activityRow()),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      weatherCondition: {
        findMany: vi
          .fn()
          .mockImplementation(
            ({ where }: { where: { id: { in: number[] } } }) =>
              Promise.resolve(
                conditions.filter((condition) =>
                  where.id.in.includes(condition.id),
                ),
              ),
          ),
      },
      state: {
        findUnique: vi
          .fn()
          .mockImplementation(({ where }: { where: { name: string } }) =>
            Promise.resolve({ id: states[where.name], name: where.name }),
          ),
      },
      $transaction: vi.fn(),
    };

    tx = {
      visit: { create: vi.fn().mockResolvedValue({ id: 99 }) },
      activity: { update: prisma.activity.update },
    };
    prisma.$transaction = vi
      .fn()
      .mockImplementation((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      );
    weather = { getForecastRange: vi.fn().mockResolvedValue(new Map()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: WEATHER_PORT, useValue: weather },
      ],
    }).compile();

    service = module.get(ActivitiesService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('creates a compatible OUTDOOR activity as planned and viable', async () => {
      const result = await service.create(userId, createDto);

      const data = prisma.activity.create.mock.calls[0][0].data;
      expect(data.visitId).toBe(10);
      expect(data.stateId).toBe(1);
      expect(data.isViable).toBe(true);
      expect(data.viabilityCheckedAt).toBeInstanceOf(Date);
      expect(data.activityWeathers.create).toEqual([{ weatherConditionId: 1 }]);
      expect(result.status).toBe(HttpStatus.CREATED);
      expect(result.data.date).toBe('2026-10-05');
      expect(result.data.startTime).toBe('09:00');
    });

    it("throws NotFoundException when the visit is not the user's or is inactive", async () => {
      prisma.visit.findFirst.mockResolvedValue(null);

      await expect(service.create(userId, createDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.visit.findFirst).toHaveBeenCalledWith({
        where: { id: 10, userId, isActive: true },
      });
    });

    it('rejects when the visit is not PLANNED', async () => {
      prisma.visit.findFirst.mockResolvedValue(
        visitWith(sunnyWeather, { status: VisitStatus.CANCELLED }),
      );

      await expect(service.create(userId, createDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.activity.create).not.toHaveBeenCalled();
    });

    it('rejects an end time that is not after the start time', async () => {
      await expect(
        service.create(userId, {
          ...createDto,
          startTime: '11:00',
          endTime: '11:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a weather condition id that does not exist', async () => {
      await expect(
        service.create(userId, { ...createDto, weatherConditionIds: [1, 999] }),
      ).rejects.toThrow('Condición climática inválida');
    });

    it('rejects contradictory weather conditions', async () => {
      await expect(
        service.create(userId, { ...createDto, weatherConditionIds: [1, 2] }),
      ).rejects.toThrow(/contradictorias/);
      expect(prisma.activity.create).not.toHaveBeenCalled();
    });

    it('rejects a schedule that overlaps another activity of the visit', async () => {
      prisma.activity.findFirst.mockResolvedValue(
        activityRow({
          name: 'Almuerzo',
          startTime: new Date('1970-01-01T10:00:00Z'),
        }),
      );

      await expect(service.create(userId, createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.activity.create).not.toHaveBeenCalled();
    });

    it('blocks an OUTDOOR activity whose conditions contradict the forecast with 422', async () => {
      prisma.visit.findFirst.mockResolvedValue(visitWith(rainyWeather));

      const call = service.create(userId, createDto);

      await expect(call).rejects.toThrow(UnprocessableEntityException);
      await expect(call).rejects.toThrow(
        /2026-10-05.*lluvia.*incompatible con: soleado/,
      );
      expect(prisma.activity.create).not.toHaveBeenCalled();
    });

    it('accepts rain-tolerant conditions when the forecast is rainy', async () => {
      prisma.visit.findFirst.mockResolvedValue(visitWith(rainyWeather));

      const result = await service.create(userId, {
        ...createDto,
        weatherConditionIds: [2, 3],
      });

      expect(result.status).toBe(HttpStatus.CREATED);
    });

    it('creates the activity as pending validation (isViable null) when the visit has no weather yet', async () => {
      prisma.visit.findFirst.mockResolvedValue(visitWith(noWeather));
      prisma.activity.create.mockResolvedValue(activityRow({ isViable: null }));

      const result = await service.create(userId, createDto);

      const data = prisma.activity.create.mock.calls[0][0].data;
      expect(data.isViable).toBeNull();
      expect(data.viabilityCheckedAt).toBeNull();
      expect(result.message).toContain('Se validará contra el clima');
    });

    it('does not validate INDOOR activities against the forecast', async () => {
      prisma.visit.findFirst.mockResolvedValue(visitWith(rainyWeather));

      const result = await service.create(userId, {
        ...createDto,
        type: ActivityType.INDOOR,
      });

      expect(prisma.activity.create.mock.calls[0][0].data.isViable).toBe(true);
      expect(result.status).toBe(HttpStatus.CREATED);
    });
  });

  describe('findAll', () => {
    it('lists the active activities of an owned visit ordered by start time', async () => {
      prisma.activity.findMany.mockResolvedValue([activityRow()]);

      const result = await service.findAll(userId, { visitId: 10 });

      expect(prisma.activity.findMany.mock.calls[0][0]).toMatchObject({
        where: { visitId: 10, isActive: true },
        orderBy: { startTime: 'asc' },
      });
      expect(result.data).toHaveLength(1);
    });

    it('throws NotFoundException for a visit of another user', async () => {
      prisma.visit.findFirst.mockResolvedValue(null);

      await expect(service.findAll(userId, { visitId: 99 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('scopes the lookup to the user through the visit', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        ...activityRow(),
        visit: visitWith(sunnyWeather),
      });

      await service.findOne(userId, 5);

      expect(prisma.activity.findFirst.mock.calls[0][0].where).toEqual({
        id: 5,
        isActive: true,
        visit: { userId, isActive: true },
      });
    });

    it('throws NotFoundException when it does not exist', async () => {
      await expect(service.findOne(userId, 5)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const existing = () => ({
      ...activityRow(),
      visit: visitWith(sunnyWeather),
    });

    beforeEach(() => {
      prisma.activity.findFirst.mockResolvedValueOnce(existing());
    });

    it('only updates the given fields and does not revalidate for name/description', async () => {
      await service.update(userId, 5, { name: 'Nuevo' });

      const data = prisma.activity.update.mock.calls[0][0].data;
      expect(data).toEqual({ name: 'Nuevo' });
      expect(prisma.activity.findFirst).toHaveBeenCalledTimes(1);
    });

    it('excludes itself when checking overlap on a schedule change', async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(null);

      await service.update(userId, 5, { startTime: '09:30' });

      const overlapQuery = prisma.activity.findFirst.mock.calls[1][0];
      expect(overlapQuery.where.id).toEqual({ not: 5 });
    });

    it('rejects a schedule change that overlaps another activity', async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(
        activityRow({ name: 'Otra' }),
      );

      await expect(
        service.update(userId, 5, { endTime: '12:00' }),
      ).rejects.toThrow(ConflictException);
    });

    it('replaces the weather conditions and revalidates against the forecast', async () => {
      await service.update(userId, 5, { weatherConditionIds: [1] });

      const data = prisma.activity.update.mock.calls[0][0].data;
      expect(data.activityWeathers).toEqual({
        deleteMany: {},
        create: [{ weatherConditionId: 1 }],
      });
      expect(data.isViable).toBe(true);
    });

    it('rejects new conditions that contradict each other', async () => {
      await expect(
        service.update(userId, 5, { weatherConditionIds: [1, 2] }),
      ).rejects.toThrow(/contradictorias/);
    });

    it('rejects new conditions that contradict the forecast', async () => {
      prisma.activity.findFirst.mockReset();
      prisma.activity.findFirst.mockResolvedValueOnce({
        ...activityRow(),
        visit: visitWith(rainyWeather),
      });

      await expect(
        service.update(userId, 5, { weatherConditionIds: [1] }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects editing a completed or cancelled activity', async () => {
      for (const name of ['completed', 'cancelled']) {
        prisma.activity.findFirst.mockReset();
        prisma.activity.findFirst.mockResolvedValueOnce({
          ...activityRow({ state: { id: 2, name } }),
          visit: visitWith(sunnyWeather),
        });

        await expect(service.update(userId, 5, { name: 'x' })).rejects.toThrow(
          BadRequestException,
        );
      }
      expect(prisma.activity.update).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('marks a planned activity as completed when the visit date has arrived', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        ...activityRow(),
        visit: visitWith(sunnyWeather, {
          date: new Date('2026-10-04T00:00:00Z'),
        }),
      });

      await service.complete(userId, 5);

      expect(prisma.activity.update.mock.calls[0][0].data).toEqual({
        stateId: 2,
        completedAt: expect.any(Date),
      });
    });

    it('rejects completing before the visit date', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        ...activityRow(),
        visit: visitWith(sunnyWeather),
      });

      await expect(service.complete(userId, 5)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.activity.update).not.toHaveBeenCalled();
    });

    it('rejects completing an already completed activity', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        ...activityRow({ state: { id: 2, name: 'completed' } }),
        visit: visitWith(sunnyWeather, {
          date: new Date('2026-10-04T00:00:00Z'),
        }),
      });

      await expect(service.complete(userId, 5)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancel', () => {
    it('cancels a planned activity at any time', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        ...activityRow(),
        visit: visitWith(sunnyWeather),
      });

      await service.cancel(userId, 5);

      expect(prisma.activity.update.mock.calls[0][0].data).toEqual({
        stateId: 3,
        cancelledAt: new Date('2026-10-04T12:00:00Z'),
        cancelReason: null,
      });
    });

    it('stores the reason the user sends', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        ...activityRow(),
        visit: visitWith(sunnyWeather),
      });

      await service.cancel(userId, 5, { reason: 'Me enfermé' });

      expect(prisma.activity.update.mock.calls[0][0].data.cancelReason).toBe(
        'Me enfermé',
      );
    });

    it.each(['cancelled', 'cancelled_by_system'])(
      'rejects cancelling an activity that is already %s',
      async (name) => {
        prisma.activity.findFirst.mockResolvedValue({
          ...activityRow({ state: { id: 3, name } }),
          visit: visitWith(sunnyWeather),
        });

        await expect(service.cancel(userId, 5)).rejects.toThrow(
          BadRequestException,
        );
      },
    );

    it('rejects cancelling a completed activity', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        ...activityRow({ state: { id: 2, name: 'completed' } }),
        visit: visitWith(sunnyWeather),
      });

      await expect(service.cancel(userId, 5)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('probability and reactivation marker', () => {
    const hourlyForecast = {
      utcOffsetSeconds: -21600,
      hours: [9, 10].map((hour) => ({
        time: `2026-10-05T${String(hour).padStart(2, '0')}:00`,
        weatherCode: 0,
        precipitation: 0,
        cloudCover: 5,
        windSpeed: 5,
        precipitationProbability: 10,
      })),
    };

    it('persists the probability computed from the visit hourly forecast on create', async () => {
      prisma.visit.findFirst.mockResolvedValue(
        visitWith(sunnyWeather, { hourlyForecast }),
      );

      await service.create(userId, createDto);

      expect(prisma.activity.create.mock.calls[0][0].data.probability).toBe(90);
    });

    it('leaves the probability null when the visit has no hourly forecast', async () => {
      await service.create(userId, createDto);

      expect(
        prisma.activity.create.mock.calls[0][0].data.probability,
      ).toBeNull();
    });

    it('clears the reactivation marker when the schedule changes', async () => {
      prisma.activity.findFirst
        .mockResolvedValueOnce({
          ...activityRow({ reactivatedAt: new Date('2026-10-04T10:00:00Z') }),
          visit: visitWith(sunnyWeather),
        })
        .mockResolvedValueOnce(null);

      await service.update(userId, 5, { startTime: '10:00', endTime: '12:00' });

      expect(
        prisma.activity.update.mock.calls[0][0].data.reactivatedAt,
      ).toBeNull();
    });

    it('keeps the reactivation marker when only the name changes', async () => {
      prisma.activity.findFirst.mockResolvedValueOnce({
        ...activityRow({ reactivatedAt: new Date('2026-10-04T10:00:00Z') }),
        visit: visitWith(sunnyWeather),
      });

      await service.update(userId, 5, { name: 'Otro nombre' });

      expect(prisma.activity.update.mock.calls[0][0].data).not.toHaveProperty(
        'reactivatedAt',
      );
    });
  });

  describe('reactivate', () => {
    function cancelled(name: string, visit: object = visitWith(rainyWeather)) {
      return {
        ...activityRow({
          state: { id: 4, name },
          cancelReason: 'Cancelada automáticamente',
          cancelledAt: new Date('2026-10-04T11:00:00Z'),
        }),
        visit,
      };
    }

    it.each(['cancelled', 'cancelled_by_system'])(
      'reactivates a %s activity even if the forecast is still bad',
      async (name) => {
        prisma.activity.findFirst
          .mockResolvedValueOnce(cancelled(name))
          .mockResolvedValueOnce(null);

        const result = await service.reactivate(userId, 5);

        expect(result.status).toBe(HttpStatus.OK);
        expect(prisma.activity.update.mock.calls[0][0].data).toMatchObject({
          stateId: 1,
          cancelReason: null,
          cancelledAt: null,
          reactivatedAt: new Date('2026-10-04T12:00:00Z'),
        });
      },
    );

    it('rejects an activity that is not cancelled', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        ...activityRow(),
        visit: visitWith(sunnyWeather),
      });

      await expect(service.reactivate(userId, 5)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects with 409 when another activity took the schedule', async () => {
      prisma.activity.findFirst
        .mockResolvedValueOnce(cancelled('cancelled_by_system'))
        .mockResolvedValueOnce({
          name: 'Almuerzo',
          startTime: new Date('1970-01-01T10:00:00Z'),
          endTime: new Date('1970-01-01T12:00:00Z'),
        });

      await expect(service.reactivate(userId, 5)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.activity.update).not.toHaveBeenCalled();
    });

    it('rejects an activity whose end time already passed in the visit local time', async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(
        cancelled(
          'cancelled',
          visitWith(rainyWeather, { date: new Date('2026-10-03T00:00:00Z') }),
        ),
      );

      await expect(service.reactivate(userId, 5)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when the visit itself is cancelled', async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(
        cancelled(
          'cancelled',
          visitWith(rainyWeather, { status: VisitStatus.CANCELLED }),
        ),
      );

      await expect(service.reactivate(userId, 5)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reschedule', () => {
    const dto = { date: '2026-10-06', startTime: '14:00', endTime: '16:00' };
    const owned = () => ({
      ...activityRow(),
      visit: visitWith(sunnyWeather),
    });
    const targetVisit = (overrides: object = {}) =>
      visitWith(sunnyWeather, {
        id: 11,
        date: new Date('2026-10-06T00:00:00Z'),
        ...overrides,
      });

    it('moves the activity to the existing visit of that date at the same place', async () => {
      prisma.activity.findFirst
        .mockResolvedValueOnce(owned())
        .mockResolvedValueOnce(null);
      prisma.visit.findFirst.mockResolvedValue(targetVisit());

      await service.reschedule(userId, 5, dto);

      expect(tx.visit.create).not.toHaveBeenCalled();
      expect(prisma.activity.update.mock.calls[0][0].data).toMatchObject({
        visitId: 11,
        startTime: new Date('1970-01-01T14:00:00Z'),
        endTime: new Date('1970-01-01T16:00:00Z'),
        stateId: 1,
        reactivatedAt: null,
      });
    });

    it('creates the visit for that date, copying name and coordinates, when none exists', async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(owned());
      prisma.visit.findFirst.mockResolvedValue(null);
      weather.getForecastRange.mockResolvedValue(
        new Map([
          [
            '2026-10-06',
            {
              snapshot: {
                temperature: 22,
                humidity: 50,
                precipitation: 0,
                atmosphericPressure: 1013,
                cloudCover: 5,
                windSpeed: 8,
                weatherCode: 0,
              },
              hourly: null,
            },
          ],
        ]),
      );

      await service.reschedule(userId, 5, dto);

      const created = tx.visit.create.mock.calls[0][0].data;
      expect(created).toMatchObject({
        userId,
        name: 'Antigua Guatemala',
        date: new Date('2026-10-06T00:00:00Z'),
      });
      expect(prisma.activity.update.mock.calls[0][0].data.visitId).toBe(99);
    });

    it('accepts a date without forecast and leaves viability pending', async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(owned());
      prisma.visit.findFirst.mockResolvedValue(null);

      const result = await service.reschedule(userId, 5, dto);

      const data = prisma.activity.update.mock.calls[0][0].data;
      expect(data.isViable).toBeNull();
      expect(data.probability).toBeNull();
      expect(result.message).toContain('Se validará');
    });

    it('rejects with 409 when the new schedule overlaps an activity of the target visit', async () => {
      prisma.activity.findFirst
        .mockResolvedValueOnce(owned())
        .mockResolvedValueOnce({
          name: 'Almuerzo',
          startTime: new Date('1970-01-01T15:00:00Z'),
          endTime: new Date('1970-01-01T17:00:00Z'),
        });
      prisma.visit.findFirst.mockResolvedValue(targetVisit());

      await expect(service.reschedule(userId, 5, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.activity.update).not.toHaveBeenCalled();
    });

    it('rejects with 422 when the forecast of the target date is incompatible', async () => {
      prisma.activity.findFirst
        .mockResolvedValueOnce(owned())
        .mockResolvedValueOnce(null);
      prisma.visit.findFirst.mockResolvedValue(targetVisit(rainyWeather));

      await expect(service.reschedule(userId, 5, dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(prisma.activity.update).not.toHaveBeenCalled();
    });

    it('rejects with 409 when the user already has a visit that date at another place', async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(owned());
      prisma.visit.findFirst.mockResolvedValue(
        targetVisit({ latitude: new Prisma.Decimal(15.5) }),
      );

      await expect(service.reschedule(userId, 5, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(tx.visit.create).not.toHaveBeenCalled();
    });

    it('reactivates a cancelled-by-system activity and clears its cancellation data', async () => {
      prisma.activity.findFirst
        .mockResolvedValueOnce({
          ...activityRow({
            state: { id: 4, name: 'cancelled_by_system' },
            cancelReason: 'x',
            cancelledAt: new Date(),
            reactivatedAt: new Date(),
          }),
          visit: visitWith(sunnyWeather),
        })
        .mockResolvedValueOnce(null);
      prisma.visit.findFirst.mockResolvedValue(targetVisit());

      await service.reschedule(userId, 5, dto);

      expect(prisma.activity.update.mock.calls[0][0].data).toMatchObject({
        stateId: 1,
        cancelReason: null,
        cancelledAt: null,
        reactivatedAt: null,
      });
    });

    it.each([
      ['a completed activity', { state: { id: 2, name: 'completed' } }, dto],
      ['a past date', {}, { ...dto, date: '2026-10-03' }],
      ['an invalid calendar date', {}, { ...dto, date: '2026-02-31' }],
      ['an end before the start', {}, { ...dto, startTime: '17:00' }],
    ])('rejects %s with 400', async (_label, overrides, body) => {
      prisma.activity.findFirst.mockResolvedValue({
        ...activityRow(overrides),
        visit: visitWith(sunnyWeather),
      });

      await expect(service.reschedule(userId, 5, body)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.activity.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes the activity', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        ...activityRow(),
        visit: visitWith(sunnyWeather),
      });

      const result = await service.remove(userId, 5);

      expect(prisma.activity.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { isActive: false },
      });
      expect(result.data).toBeNull();
    });

    it('throws NotFoundException for an activity of another user', async () => {
      await expect(service.remove(userId, 5)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
