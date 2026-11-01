import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityType, Prisma, VisitStatus } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { UpcomingActivitiesService } from '../../../src/modules/activities/upcoming-activities.service.js';

const userId = 1;
// 18:00 UTC = 12:00 en Guatemala: hoy local es 2026-11-02.
const NOW = new Date('2026-11-02T18:00:00Z');

const hourlyForecast = {
  utcOffsetSeconds: -21600,
  hours: [15, 16].map((hour) => ({
    time: `2026-11-03T${hour}:00`,
    weatherCode: 0,
    precipitation: 0,
    cloudCover: 5,
    windSpeed: 5,
    precipitationProbability: 10,
  })),
};

function row(overrides: object = {}, visit: object = {}) {
  return {
    id: 5,
    visitId: 10,
    name: 'Caminata',
    description: 'Cerro de la Cruz',
    type: ActivityType.OUTDOOR,
    startTime: new Date('1970-01-01T15:00:00Z'),
    endTime: new Date('1970-01-01T17:00:00Z'),
    isViable: true,
    viabilityCheckedAt: null,
    probability: 90,
    completedAt: null,
    cancelReason: null,
    cancelledAt: null,
    state: { id: 1, name: 'planned' },
    activityWeathers: [{ weatherCondition: { id: 1, name: 'sunny' } }],
    visit: {
      id: 10,
      name: 'Antigua',
      latitude: new Prisma.Decimal(14.5586),
      longitude: new Prisma.Decimal(-90.7295),
      date: new Date('2026-11-03T00:00:00Z'),
      status: VisitStatus.PLANNED,
      hourlyForecast,
      ...visit,
    },
    ...overrides,
  };
}

describe('UpcomingActivitiesService', () => {
  let service: UpcomingActivitiesService;
  let prisma: {
    activity: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    visit: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    prisma = {
      activity: {
        findMany: vi.fn().mockResolvedValue([row()]),
        count: vi.fn().mockResolvedValue(1),
      },
      visit: { findFirst: vi.fn().mockResolvedValue({ id: 10 }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpcomingActivitiesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(UpcomingActivitiesService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scopes to the user, active visits and activities, from today on', async () => {
    await service.findUpcoming(userId, {});

    const where = prisma.activity.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      isActive: true,
      visit: {
        userId,
        isActive: true,
        date: { gte: new Date('2026-11-02T00:00:00Z') },
      },
    });
  });

  it('counts "today" in Guatemala time, not UTC', async () => {
    vi.setSystemTime(new Date('2026-11-03T02:00:00Z')); // 20:00 del 2 en Guatemala

    await service.findUpcoming(userId, {});

    expect(
      prisma.activity.findMany.mock.calls[0][0].where.visit.date.gte,
    ).toEqual(new Date('2026-11-02T00:00:00Z'));
  });

  it('combines every filter', async () => {
    await service.findUpcoming(userId, {
      days: 3,
      visitId: 10,
      probabilityMin: 70,
      probabilityMax: 100,
      state: 'cancelled_by_system',
    });

    const where = prisma.activity.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      isActive: true,
      visit: {
        userId,
        isActive: true,
        id: 10,
        date: {
          gte: new Date('2026-11-02T00:00:00Z'),
          lte: new Date('2026-11-05T00:00:00Z'),
        },
      },
      state: { name: 'cancelled_by_system' },
      probability: { gte: 70, lte: 100 },
    });
  });

  it("answers 404 for a visit that is not the user's", async () => {
    prisma.visit.findFirst.mockResolvedValue(null);

    await expect(service.findUpcoming(userId, { visitId: 99 })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.activity.findMany).not.toHaveBeenCalled();
  });

  it('rejects an inverted probability range', async () => {
    await expect(
      service.findUpcoming(userId, { probabilityMin: 80, probabilityMax: 20 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('orders by date and start time by default', async () => {
    await service.findUpcoming(userId, {});

    expect(prisma.activity.findMany.mock.calls[0][0].orderBy).toEqual([
      { visit: { date: 'asc' } },
      { startTime: 'asc' },
    ]);
  });

  it('orders by probability with nulls last, then by date', async () => {
    await service.findUpcoming(userId, { sortBy: 'probability', order: 'asc' });

    expect(prisma.activity.findMany.mock.calls[0][0].orderBy).toEqual([
      { probability: { sort: 'asc', nulls: 'last' } },
      { visit: { date: 'asc' } },
      { startTime: 'asc' },
    ]);
  });

  it('paginates and returns the total', async () => {
    prisma.activity.count.mockResolvedValue(25);

    const result = await service.findUpcoming(userId, { page: 2, limit: 10 });

    const args = prisma.activity.findMany.mock.calls[0][0];
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(result.data).toMatchObject({ page: 2, limit: 10, total: 25 });
  });

  it('defaults to page 1 with 20 items', async () => {
    const result = await service.findUpcoming(userId, {});

    expect(prisma.activity.findMany.mock.calls[0][0].take).toBe(20);
    expect(result.data).toMatchObject({ page: 1, limit: 20 });
  });

  it('returns each activity with its visit, probability band and projected forecast', async () => {
    const result = await service.findUpcoming(userId, {});

    const [item] = result.data.items;
    expect(item).toMatchObject({
      id: 5,
      date: '2026-11-03',
      probability: 90,
      probabilityBand: 'GREEN',
      visit: { id: 10, name: 'Antigua', date: '2026-11-03' },
    });
    expect(item.forecast?.map((hour) => hour.time)).toEqual([
      '2026-11-03T15:00',
      '2026-11-03T16:00',
    ]);
  });

  it('returns null forecast, probability and band when the visit has no hourly data', async () => {
    prisma.activity.findMany.mockResolvedValue([
      row({ probability: null }, { hourlyForecast: null }),
    ]);

    const result = await service.findUpcoming(userId, {});

    expect(result.data.items[0]).toMatchObject({
      forecast: null,
      probability: null,
      probabilityBand: null,
    });
  });
});
