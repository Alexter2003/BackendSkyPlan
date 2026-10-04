import { Test, TestingModule } from '@nestjs/testing';
import { ActivityType, NotificationType } from '@prisma/client';
import type { Visit } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { ActivityViabilityService } from '../../../src/modules/activities/activity-viability.service.js';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';

const sunny = { cloudCover: 5, precipitation: 0, windSpeed: 8, weatherCode: 0 };
const rainy = {
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

function visitWith(weather: object): Visit {
  return { id: 10, userId: 1, ...weather } as unknown as Visit;
}

function activity(isViable: boolean | null, conditionName = 'sunny') {
  return {
    id: 5,
    visitId: 10,
    name: 'Caminata',
    type: ActivityType.OUTDOOR,
    isViable,
    activityWeathers: [{ weatherCondition: { id: 1, name: conditionName } }],
  };
}

describe('ActivityViabilityService', () => {
  let service: ActivityViabilityService;
  let prisma: {
    activity: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let notifications: { notify: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      activity: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    };
    notifications = { notify: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityViabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ActivityViabilityService);
  });

  it('only loads active, planned OUTDOOR activities of the visit', async () => {
    await service.evaluateVisitActivities(visitWith(sunny));

    expect(prisma.activity.findMany.mock.calls[0][0].where).toEqual({
      visitId: 10,
      isActive: true,
      type: ActivityType.OUTDOOR,
      state: { name: 'planned' },
    });
  });

  it.each([
    ['true -> false', true, rainy, NotificationType.ACTIVITY_NOT_VIABLE],
    ['null -> false', null, rainy, NotificationType.ACTIVITY_NOT_VIABLE],
    ['false -> true', false, sunny, NotificationType.ACTIVITY_VIABLE_AGAIN],
  ])('notifies on %s', async (_label, previous, weather, expectedType) => {
    prisma.activity.findMany.mockResolvedValue([activity(previous)]);

    await service.evaluateVisitActivities(visitWith(weather));

    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      1,
      { id: 5, visitId: 10, name: 'Caminata' },
      expectedType,
    );
  });

  it.each([
    ['null -> true', null, sunny],
    ['true -> true', true, sunny],
    ['false -> false', false, rainy],
  ])('does not notify on %s', async (_label, previous, weather) => {
    prisma.activity.findMany.mockResolvedValue([activity(previous)]);

    await service.evaluateVisitActivities(visitWith(weather));

    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('persists the new viability with its check timestamp', async () => {
    prisma.activity.findMany.mockResolvedValue([activity(true)]);

    await service.evaluateVisitActivities(visitWith(rainy));

    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { isViable: false, viabilityCheckedAt: expect.any(Date) },
    });
  });

  it.each([true, false])(
    'resets a known viability (%s) to pending when the visit has no weather data, without notifying',
    async (previous) => {
      prisma.activity.findMany.mockResolvedValue([activity(previous)]);

      await service.evaluateVisitActivities(visitWith(noWeather));

      expect(prisma.activity.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { isViable: null, viabilityCheckedAt: null },
      });
      expect(notifications.notify).not.toHaveBeenCalled();
    },
  );

  it('does not write when the viability is already pending and there is still no weather', async () => {
    prisma.activity.findMany.mockResolvedValue([activity(null)]);

    await service.evaluateVisitActivities(visitWith(noWeather));

    expect(prisma.activity.update).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('never cancels an activity', async () => {
    prisma.activity.findMany.mockResolvedValue([activity(true)]);

    await service.evaluateVisitActivities(visitWith(rainy));

    expect(prisma.activity.update.mock.calls[0][0].data).not.toHaveProperty(
      'stateId',
    );
  });
});
