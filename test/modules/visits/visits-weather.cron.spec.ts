import { Test, TestingModule } from '@nestjs/testing';
import { VisitStatus } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  WEATHER_PORT,
  WeatherPort,
} from '../../../src/modules/weather/interfaces/weather-port.interface.js';
import { VisitsWeatherCron } from '../../../src/modules/visits/visits-weather.cron.js';

function decimal(value: number) {
  return { toNumber: () => value };
}

type PrismaMock = {
  visit: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    visit: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
  };
}

describe('VisitsWeatherCron', () => {
  let cron: VisitsWeatherCron;
  let prisma: PrismaMock;
  let weather: WeatherPort;

  const snapshot = {
    temperature: 22.4,
    humidity: 71,
    precipitation: 0.2,
    atmosphericPressure: 1013.4,
  };

  const visitA = {
    id: 1,
    latitude: decimal(14.5586),
    longitude: decimal(-90.7295),
    date: new Date('2026-09-25T00:00:00Z'),
  };

  const visitB = {
    id: 2,
    // Redondea a la misma coordenada que visitA (2 decimales) — debe caer en
    // el mismo grupo y no disparar una segunda consulta.
    latitude: decimal(14.5587),
    longitude: decimal(-90.7294),
    date: new Date('2026-09-26T00:00:00Z'),
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));

    prisma = createPrismaMock();
    weather = {
      getSnapshot: vi.fn(),
      getSnapshotRange: vi.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitsWeatherCron,
        { provide: PrismaService, useValue: prisma },
        { provide: WEATHER_PORT, useValue: weather },
      ],
    }).compile();

    cron = module.get<VisitsWeatherCron>(VisitsWeatherCron);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('only queries active, PLANNED visits within the 10-day forecast window', async () => {
    await cron.refreshUpcomingVisits();

    expect(prisma.visit.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        status: VisitStatus.PLANNED,
        date: {
          gte: new Date('2026-09-20T00:00:00Z'),
          lte: new Date('2026-09-30T00:00:00Z'),
        },
      },
      select: { id: true, latitude: true, longitude: true, date: true },
    });
  });

  it('groups visits at the same rounded coordinate into a single provider call', async () => {
    prisma.visit.findMany.mockResolvedValue([visitA, visitB]);
    (weather.getSnapshotRange as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([
        ['2026-09-25', snapshot],
        ['2026-09-26', snapshot],
      ]),
    );

    await cron.refreshUpcomingVisits();

    expect(weather.getSnapshotRange).toHaveBeenCalledTimes(1);
    expect(weather.getSnapshotRange).toHaveBeenCalledWith(
      14.5586,
      -90.7295,
      visitA.date,
      visitB.date,
    );
  });

  it('writes the five weather fields for a visit whose date has a snapshot', async () => {
    prisma.visit.findMany.mockResolvedValue([visitA]);
    (weather.getSnapshotRange as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([['2026-09-25', snapshot]]),
    );

    await cron.refreshUpcomingVisits();

    expect(prisma.visit.update).toHaveBeenCalledWith({
      where: { id: visitA.id },
      data: {
        temperature: snapshot.temperature,
        precipitation: snapshot.precipitation,
        humidity: snapshot.humidity,
        atmosphericPressure: snapshot.atmosphericPressure,
        weatherUpdate: expect.any(Date),
      },
    });
  });

  it('never writes when no snapshot is available for that date, preserving prior data', async () => {
    prisma.visit.findMany.mockResolvedValue([visitA]);
    (weather.getSnapshotRange as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map(),
    );

    await cron.refreshUpcomingVisits();

    expect(prisma.visit.update).not.toHaveBeenCalled();
  });

  it('keeps updating other groups when one group fails', async () => {
    const visitC = {
      id: 3,
      latitude: decimal(20.0),
      longitude: decimal(-100.0),
      date: new Date('2026-09-27T00:00:00Z'),
    };
    prisma.visit.findMany.mockResolvedValue([visitA, visitC]);

    (weather.getSnapshotRange as ReturnType<typeof vi.fn>).mockImplementation(
      async (latitude: number) => {
        if (latitude === 14.5586) {
          throw new Error('Open-Meteo unreachable');
        }
        return new Map([['2026-09-27', snapshot]]);
      },
    );

    await cron.refreshUpcomingVisits();

    expect(prisma.visit.update).toHaveBeenCalledTimes(1);
    expect(prisma.visit.update).toHaveBeenCalledWith({
      where: { id: visitC.id },
      data: expect.objectContaining({ temperature: snapshot.temperature }),
    });
  });

  it('skips a concurrent invocation while a run is already in progress', async () => {
    let resolveFindMany!: (value: unknown[]) => void;
    prisma.visit.findMany.mockReturnValue(
      new Promise((resolve) => {
        resolveFindMany = resolve;
      }),
    );

    const firstRun = cron.refreshUpcomingVisits();
    const secondRun = cron.refreshUpcomingVisits();

    resolveFindMany([]);
    await Promise.all([firstRun, secondRun]);

    expect(prisma.visit.findMany).toHaveBeenCalledTimes(1);
  });
});
