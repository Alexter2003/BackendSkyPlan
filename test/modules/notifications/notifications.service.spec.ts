import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { NotificationsGateway } from '../../../src/modules/notifications/notifications.gateway.js';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';

const createdAt = new Date('2026-10-04T12:00:00Z');

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: Record<string, ReturnType<typeof vi.fn>>;
  };
  let gateway: { emitToUser: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: vi.fn().mockResolvedValue({ id: 9, createdAt }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    gateway = { emitToUser: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('notify', () => {
    const activity = { id: 5, visitId: 10, name: 'Caminata' };

    it("persists the notification and emits it to the owner's room", async () => {
      await service.notify(1, activity, NotificationType.ACTIVITY_NOT_VIABLE);

      expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({
        userId: 1,
        activityId: 5,
        type: NotificationType.ACTIVITY_NOT_VIABLE,
        title: 'Actividad no viable',
      });
      expect(gateway.emitToUser).toHaveBeenCalledWith(
        1,
        'activity.viability_changed',
        expect.objectContaining({
          notificationId: 9,
          activityId: 5,
          visitId: 10,
          activityName: 'Caminata',
          isViable: false,
          createdAt,
        }),
      );
    });

    it('flags isViable true when the activity became viable again', async () => {
      await service.notify(1, activity, NotificationType.ACTIVITY_VIABLE_AGAIN);

      expect(gateway.emitToUser.mock.calls[0][2].isViable).toBe(true);
    });

    it('does not fail when the realtime emission throws (it is already persisted)', async () => {
      gateway.emitToUser.mockImplementation(() => {
        throw new Error('socket down');
      });

      await expect(
        service.notify(1, activity, NotificationType.ACTIVITY_NOT_VIABLE),
      ).resolves.toBeUndefined();
      expect(prisma.notification.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('filters by owner and only unread when requested', async () => {
      await service.findAll(1, true);

      expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({
        userId: 1,
        readAt: null,
      });
    });

    it('returns everything of the owner otherwise', async () => {
      await service.findAll(1, false);

      expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({
        userId: 1,
      });
    });
  });

  describe('markRead', () => {
    it("throws NotFoundException for another user's notification", async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead(1, 9)).rejects.toThrow(NotFoundException);
      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 9, userId: 1 },
      });
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it("sets readAt on the owner's notification", async () => {
      prisma.notification.findFirst.mockResolvedValue({ id: 9, readAt: null });
      prisma.notification.update.mockResolvedValue({
        id: 9,
        activityId: 5,
        type: NotificationType.ACTIVITY_NOT_VIABLE,
        title: 't',
        message: 'm',
        readAt: createdAt,
        createdAt,
        activity: { visitId: 10 },
      });

      const result = await service.markRead(1, 9);

      expect(
        prisma.notification.update.mock.calls[0][0].data.readAt,
      ).toBeInstanceOf(Date);
      expect(result.data.visitId).toBe(10);
    });
  });

  describe('markAllRead', () => {
    it("marks only the user's unread notifications and reports the count", async () => {
      const result = await service.markAllRead(1);

      expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({
        userId: 1,
        readAt: null,
      });
      expect(result.data).toEqual({ count: 2 });
    });
  });
});
