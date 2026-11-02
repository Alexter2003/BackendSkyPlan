import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { ActivityType, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { ActivityAutoCancelService } from '../../../src/modules/activities/activity-auto-cancel.service.js';
import { ActivityViabilityService } from '../../../src/modules/activities/activity-viability.service.js';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { WEATHER_PORT } from '../../../src/modules/weather/interfaces/weather-port.interface.js';

// 20:30 UTC con desfase -6 h = 14:30 hora local de la visita.
const NOW = new Date('2026-11-02T20:30:00Z');

function hourlyWith(precipitationProbability: number) {
  return {
    utcOffsetSeconds: -21600,
    hours: [15, 16].map((hour) => ({
      time: `2026-11-02T${hour}:00`,
      weatherCode: 0,
      precipitation: 0,
      cloudCover: 5,
      windSpeed: 5,
      precipitationProbability,
    })),
  };
}

const snapshot = {
  temperature: 22,
  humidity: 50,
  precipitation: 0,
  atmosphericPressure: 1013,
  cloudCover: 5,
  windSpeed: 5,
  weatherCode: 0,
};

function visitWith(overrides: object = {}) {
  return {
    id: 10,
    userId: 1,
    name: 'Antigua',
    latitude: new Prisma.Decimal(14.5586),
    longitude: new Prisma.Decimal(-90.7295),
    date: new Date('2026-11-02T00:00:00Z'),
    weatherUpdate: new Date('2026-11-02T14:30:00Z'),
    hourlyForecast: hourlyWith(10),
    ...overrides,
  };
}

function candidate(overrides: object = {}, visit: object = visitWith()) {
  return {
    id: 5,
    visitId: 10,
    name: 'Caminata',
    type: ActivityType.OUTDOOR,
    startTime: new Date('1970-01-01T15:00:00Z'),
    endTime: new Date('1970-01-01T17:00:00Z'),
    activityWeathers: [{ weatherCondition: { id: 1, name: 'sunny' } }],
    visit,
    ...overrides,
  };
}

describe('ActivityAutoCancelService', () => {
  let service: ActivityAutoCancelService;
  let prisma: {
    activity: {
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    visit: { update: ReturnType<typeof vi.fn> };
    state: { findUnique: ReturnType<typeof vi.fn> };
  };
  let weather: { getForecastRange: ReturnType<typeof vi.fn> };
  let viability: { evaluateVisitActivities: ReturnType<typeof vi.fn> };
  let notifications: { notify: ReturnType<typeof vi.fn> };

  function freshForecast(precipitationProbability: number) {
    const hourly = hourlyWith(precipitationProbability);
    weather.getForecastRange.mockResolvedValue(
      new Map([['2026-11-02', { snapshot, hourly }]]),
    );
    prisma.visit.update.mockResolvedValue(
      visitWith({ hourlyForecast: hourly, weatherUpdate: NOW }),
    );
  }

  beforeEach(async () => {
    prisma = {
      activity: {
        findMany: vi.fn().mockResolvedValue([candidate()]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      visit: { update: vi.fn() },
      state: {
        findUnique: vi.fn().mockResolvedValue({
          id: 4,
          name: 'cancelled_by_system',
        }),
      },
    };
    weather = { getForecastRange: vi.fn().mockResolvedValue(new Map()) };
    viability = {
      evaluateVisitActivities: vi.fn().mockResolvedValue(undefined),
    };
    notifications = { notify: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityAutoCancelService,
        { provide: PrismaService, useValue: prisma },
        { provide: WEATHER_PORT, useValue: weather },
        { provide: ActivityViabilityService, useValue: viability },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ActivityAutoCancelService);
  });

  it('only considers planned, active OUTDOOR activities that were not reactivated', async () => {
    await service.run(NOW);

    const where = prisma.activity.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      isActive: true,
      type: ActivityType.OUTDOOR,
      reactivatedAt: null,
      state: { name: 'planned' },
      visit: { isActive: true, status: 'PLANNED' },
    });
  });

  it('cancels by system when the probability is below 30 within the last hour', async () => {
    freshForecast(90);

    const result = await service.run(NOW);

    expect(result).toMatchObject({ inWindow: 1, cancelled: 1, skipped: 0 });
    const call = prisma.activity.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      id: 5,
      reactivatedAt: null,
      state: { name: 'planned' },
    });
    expect(call.data).toMatchObject({
      stateId: 4,
      probability: 10,
      cancelledAt: NOW,
    });
    expect(call.data.cancelReason).toContain('10%');
    expect(call.data.cancelReason).toContain('15:00');
    expect(notifications.notify).toHaveBeenCalledWith(
      1,
      { id: 5, visitId: 10, name: 'Caminata' },
      NotificationType.ACTIVITY_AUTO_CANCELLED,
    );
  });

  it('keeps the activity when the probability is acceptable', async () => {
    freshForecast(45);

    const result = await service.run(NOW);

    expect(result.cancelled).toBe(0);
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('keeps the activity at exactly the threshold (30)', async () => {
    freshForecast(70);

    await service.run(NOW);

    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });

  it('does not touch activities that start in more than 60 minutes', async () => {
    prisma.activity.findMany.mockResolvedValue([
      candidate({ startTime: new Date('1970-01-01T16:00:00Z') }),
    ]);

    const result = await service.run(NOW);

    expect(result.inWindow).toBe(0);
    expect(weather.getForecastRange).not.toHaveBeenCalled();
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });

  it('does not touch activities that already started', async () => {
    prisma.activity.findMany.mockResolvedValue([
      candidate({ startTime: new Date('1970-01-01T14:00:00Z') }),
    ]);

    const result = await service.run(NOW);

    expect(result.inWindow).toBe(0);
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });

  it('includes an activity that starts in exactly 60 minutes', async () => {
    prisma.activity.findMany.mockResolvedValue([
      candidate({ startTime: new Date('1970-01-01T15:30:00Z') }),
    ]);
    freshForecast(90);

    const result = await service.run(NOW);

    expect(result.inWindow).toBe(1);
  });

  it('refreshes the visit forecast and re-evaluates its activities', async () => {
    freshForecast(45);

    await service.run(NOW);

    expect(prisma.visit.update).toHaveBeenCalledTimes(1);
    expect(viability.evaluateVisitActivities).toHaveBeenCalledTimes(1);
  });

  it('never changes the visit status when it cancels activities', async () => {
    freshForecast(95);

    const result = await service.run(NOW);

    expect(result.cancelled).toBe(1);
    for (const [args] of prisma.visit.update.mock.calls) {
      expect(args.data).not.toHaveProperty('status');
    }
  });

  it('never cancels without data: no fresh forecast and a stale stored one', async () => {
    prisma.activity.findMany.mockResolvedValue([
      candidate(
        {},
        visitWith({
          hourlyForecast: hourlyWith(95),
          weatherUpdate: new Date('2026-11-02T10:00:00Z'),
        }),
      ),
    ]);

    const result = await service.run(NOW);

    expect(result).toMatchObject({ cancelled: 0, skipped: 1 });
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });

  it('falls back to a recent stored forecast when the provider fails', async () => {
    weather.getForecastRange.mockRejectedValue(new Error('network down'));
    prisma.activity.findMany.mockResolvedValue([
      candidate(
        {},
        visitWith({
          hourlyForecast: hourlyWith(95),
          weatherUpdate: new Date('2026-11-02T19:30:00Z'),
        }),
      ),
    ]);

    const result = await service.run(NOW);

    expect(result.cancelled).toBe(1);
  });

  it('does not notify when the user acted between the read and the write', async () => {
    freshForecast(90);
    prisma.activity.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.run(NOW);

    expect(result.cancelled).toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('keeps processing other visits when one of them fails', async () => {
    const other = candidate(
      { id: 6, visitId: 11 },
      visitWith({ id: 11, userId: 2 }),
    );
    prisma.activity.findMany.mockResolvedValue([candidate(), other]);
    freshForecast(90);
    prisma.activity.updateMany
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValue({ count: 1 });

    const result = await service.run(NOW);

    expect(result.cancelled).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('fails loudly if the cancelled_by_system state is not configured', async () => {
    freshForecast(90);
    prisma.state.findUnique.mockResolvedValue(null);

    await expect(service.run(NOW)).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
