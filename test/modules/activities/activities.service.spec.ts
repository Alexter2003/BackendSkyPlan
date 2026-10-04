import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ActivityType, VisitStatus } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { ActivitiesService } from '../../../src/modules/activities/activities.service.js';
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
    date: new Date('2026-10-05T00:00:00Z'),
    status: VisitStatus.PLANNED,
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
    completedAt: null,
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
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));

    const states: Record<string, number> = {
      planned: 1,
      completed: 2,
      cancelled: 3,
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        { provide: PrismaService, useValue: prisma },
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
      });
    });

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
