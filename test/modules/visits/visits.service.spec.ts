import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { VisitStatus } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  WEATHER_PORT,
  WeatherPort,
} from '../../../src/modules/weather/interfaces/weather-port.interface.js';
import { VisitsService } from '../../../src/modules/visits/visits.service.js';
import type { CreateVisitDto } from '../../../src/modules/visits/dto/create-visit.dto.js';
import type { UpdateVisitDto } from '../../../src/modules/visits/dto/update-visit.dto.js';

// Decimal.js-lite lo trae Prisma; para el mock basta un objeto con
// toNumber(), que es lo único que visits.utils.ts invoca.
function decimal(value: number) {
  return { toNumber: () => value };
}

type PrismaMock = {
  visit: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  activity: {
    updateMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

function createPrismaMock(): PrismaMock {
  const mock: PrismaMock = {
    visit: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    activity: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(),
  };

  mock.$transaction.mockImplementation(
    async (callback: (tx: PrismaMock) => unknown) => callback(mock),
  );

  return mock;
}

describe('VisitsService', () => {
  let service: VisitsService;
  let prisma: PrismaMock;
  let weather: WeatherPort;

  const userId = 1;

  const snapshot = {
    temperature: 22.4,
    humidity: 71,
    precipitation: 0.2,
    atmosphericPressure: 1013.4,
  };

  const baseVisit = {
    id: 10,
    userId,
    name: 'Antigua Guatemala',
    latitude: decimal(14.5586),
    longitude: decimal(-90.7295),
    date: new Date('2026-09-28T00:00:00Z'),
    status: VisitStatus.PLANNED,
    temperature: snapshot.temperature,
    precipitation: snapshot.precipitation,
    humidity: snapshot.humidity,
    atmosphericPressure: snapshot.atmosphericPressure,
    weatherUpdate: new Date('2026-09-20T12:00:00Z'),
    isActive: true,
    createdAt: new Date('2026-09-20T12:00:00Z'),
    updatedAt: new Date('2026-09-20T12:00:00Z'),
  };

  const createDto: CreateVisitDto = {
    name: 'Antigua Guatemala',
    latitude: 14.5586,
    longitude: -90.7295,
    date: '2026-09-28',
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));

    prisma = createPrismaMock();
    prisma.visit.findFirst.mockResolvedValue(null);
    prisma.visit.create.mockResolvedValue(baseVisit);
    prisma.visit.update.mockResolvedValue(baseVisit);
    prisma.visit.findMany.mockResolvedValue([baseVisit]);

    weather = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      getSnapshotRange: vi.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WEATHER_PORT, useValue: weather },
      ],
    }).compile();

    service = module.get<VisitsService>(VisitsService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('persists the visit with the weather snapshot and a success message', async () => {
      const result = await service.create(userId, createDto);

      const data = prisma.visit.create.mock.calls[0][0].data;
      expect(data.userId).toBe(userId);
      expect(data.temperature).toBe(snapshot.temperature);
      expect(data.weatherUpdate).toBeInstanceOf(Date);
      expect(result.status).toBe(HttpStatus.CREATED);
      expect(result.message).toBe('Ubicación registrada exitosamente');
    });

    it('persists the visit with null weather fields and a pending-weather message when the date is out of range', async () => {
      (weather.getSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.create(userId, createDto);

      const data = prisma.visit.create.mock.calls[0][0].data;
      expect(data.temperature).toBeNull();
      expect(data.weatherUpdate).toBeNull();
      expect(result.message).toContain('se cargarán cuando');
    });

    it('rejects a date in the past', async () => {
      await expect(
        service.create(userId, { ...createDto, date: '2026-09-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.visit.create).not.toHaveBeenCalled();
    });

    it('rejects when the user already has an active visit on that date', async () => {
      prisma.visit.findFirst.mockResolvedValue(baseVisit);

      await expect(service.create(userId, createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.visit.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns only the active visits of the given user, ordered by date', async () => {
      const result = await service.findAll(userId);

      expect(prisma.visit.findMany).toHaveBeenCalledWith({
        where: { userId, isActive: true },
        orderBy: { date: 'asc' },
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].latitude).toBe(14.5586);
    });
  });

  describe('findOne', () => {
    it('returns the visit with an empty activities array when it has none', async () => {
      prisma.visit.findFirst.mockResolvedValue({
        ...baseVisit,
        activities: [],
      });

      const result = await service.findOne(userId, baseVisit.id);

      expect(result.data.activities).toEqual([]);
    });

    it('returns the visit with its formatted activities', async () => {
      prisma.visit.findFirst.mockResolvedValue({
        ...baseVisit,
        activities: [
          {
            id: 5,
            name: 'Caminata',
            description: 'Cerro de la Cruz',
            date: new Date('2026-09-28T00:00:00Z'),
            startTime: new Date('1970-01-01T08:00:00Z'),
            endTime: new Date('1970-01-01T10:30:00Z'),
            state: { id: 1, name: 'Pendiente' },
          },
        ],
      });

      const result = await service.findOne(userId, baseVisit.id);

      expect(result.data.activities[0]).toMatchObject({
        startTime: '08:00',
        endTime: '10:30',
        state: { id: 1, name: 'Pendiente' },
      });
    });

    it('throws NotFoundException when the visit does not belong to the user or is inactive', async () => {
      prisma.visit.findFirst.mockResolvedValue(null);

      await expect(service.findOne(userId, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('does not query the weather provider when only the name changes', async () => {
      prisma.visit.findFirst.mockResolvedValueOnce(baseVisit);

      await service.update(userId, baseVisit.id, { name: 'Nuevo nombre' });

      expect(weather.getSnapshot).not.toHaveBeenCalled();
      const data = prisma.visit.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('temperature');
    });

    it('re-queries the weather provider when latitude changes and updates weatherUpdate', async () => {
      prisma.visit.findFirst.mockResolvedValueOnce(baseVisit);

      const dto: UpdateVisitDto = { latitude: 15.0 };
      await service.update(userId, baseVisit.id, dto);

      expect(weather.getSnapshot).toHaveBeenCalledWith(
        15.0,
        baseVisit.longitude.toNumber(),
        baseVisit.date,
      );
      const data = prisma.visit.update.mock.calls[0][0].data;
      expect(data.temperature).toBe(snapshot.temperature);
    });

    it('re-validates the duplicate-date rule and re-queries weather when the date changes', async () => {
      prisma.visit.findFirst
        .mockResolvedValueOnce(baseVisit) // existing lookup
        .mockResolvedValueOnce(null); // duplicate-date check

      await service.update(userId, baseVisit.id, { date: '2026-09-29' });

      expect(weather.getSnapshot).toHaveBeenCalledTimes(1);
      const data = prisma.visit.update.mock.calls[0][0].data;
      expect(data.date).toEqual(new Date('2026-09-29T00:00:00Z'));
    });

    it('rejects when the new date collides with another active visit', async () => {
      const otherVisit = { ...baseVisit, id: 20 };
      prisma.visit.findFirst
        .mockResolvedValueOnce(baseVisit)
        .mockResolvedValueOnce(otherVisit);

      await expect(
        service.update(userId, baseVisit.id, { date: '2026-09-29' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when the visit does not belong to the user', async () => {
      prisma.visit.findFirst.mockResolvedValueOnce(null);

      await expect(service.update(userId, 999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects editing a visit that is not PLANNED', async () => {
      prisma.visit.findFirst.mockResolvedValueOnce({
        ...baseVisit,
        status: VisitStatus.COMPLETED,
      });

      await expect(
        service.update(userId, baseVisit.id, { name: 'X' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.visit.update).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('marks a PLANNED visit whose date has arrived as COMPLETED', async () => {
      const pastVisit = {
        ...baseVisit,
        date: new Date('2026-09-20T00:00:00Z'),
      };
      prisma.visit.findFirst.mockResolvedValue(pastVisit);
      prisma.visit.update.mockResolvedValue({
        ...pastVisit,
        status: VisitStatus.COMPLETED,
      });

      const result = await service.complete(userId, baseVisit.id);

      expect(prisma.visit.update).toHaveBeenCalledWith({
        where: { id: baseVisit.id },
        data: { status: VisitStatus.COMPLETED },
      });
      expect(result.data.status).toBe(VisitStatus.COMPLETED);
      expect(result.message).toBe('Visita finalizada exitosamente');
    });

    it('rejects completing a visit whose date has not arrived yet', async () => {
      prisma.visit.findFirst.mockResolvedValue(baseVisit); // date: 2026-09-28, "today" is 2026-09-20

      await expect(service.complete(userId, baseVisit.id)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.visit.update).not.toHaveBeenCalled();
    });

    it('rejects completing a visit that is already COMPLETED', async () => {
      prisma.visit.findFirst.mockResolvedValue({
        ...baseVisit,
        date: new Date('2026-09-20T00:00:00Z'),
        status: VisitStatus.COMPLETED,
      });

      await expect(service.complete(userId, baseVisit.id)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.visit.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a visit belonging to another user', async () => {
      prisma.visit.findFirst.mockResolvedValue(null);

      await expect(service.complete(userId, baseVisit.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cancel', () => {
    it('marks a PLANNED visit as CANCELLED regardless of date', async () => {
      prisma.visit.findFirst.mockResolvedValue(baseVisit);
      prisma.visit.update.mockResolvedValue({
        ...baseVisit,
        status: VisitStatus.CANCELLED,
      });

      const result = await service.cancel(userId, baseVisit.id);

      expect(prisma.visit.update).toHaveBeenCalledWith({
        where: { id: baseVisit.id },
        data: { status: VisitStatus.CANCELLED },
      });
      expect(result.data.status).toBe(VisitStatus.CANCELLED);
    });

    it('rejects cancelling a visit that is already CANCELLED', async () => {
      prisma.visit.findFirst.mockResolvedValue({
        ...baseVisit,
        status: VisitStatus.CANCELLED,
      });

      await expect(service.cancel(userId, baseVisit.id)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.visit.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes the visit and cascades to its activities in one transaction', async () => {
      prisma.visit.findFirst.mockResolvedValue(baseVisit);

      const result = await service.remove(userId, baseVisit.id);

      expect(prisma.visit.update).toHaveBeenCalledWith({
        where: { id: baseVisit.id },
        data: { isActive: false },
      });
      expect(prisma.activity.updateMany).toHaveBeenCalledWith({
        where: { visitId: baseVisit.id },
        data: { isActive: false },
      });
      expect(result.status).toBe(HttpStatus.OK);
      expect(result.data).toBeNull();
    });

    it('throws NotFoundException for a visit belonging to another user', async () => {
      prisma.visit.findFirst.mockResolvedValue(null);

      await expect(service.remove(userId, baseVisit.id)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.visit.update).not.toHaveBeenCalled();
    });
  });
});
