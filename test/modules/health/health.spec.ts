import 'reflect-metadata';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import { HealthController } from '../../../src/modules/health/health.controller.js';
import { HealthService } from '../../../src/modules/health/health.service.js';
import type { PrismaService } from '../../../src/prisma/prisma.service.js';
import { IS_PUBLIC_KEY } from '../../../src/common/decorators/public.decorator.js';

describe('HealthService', () => {
  it('queries the database and reports it as up', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = new HealthService({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('propagates the error when the database is down', async () => {
    const service = new HealthService({
      $queryRaw: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as PrismaService);

    await expect(service.check()).rejects.toThrow('db down');
  });
});

describe('HealthController', () => {
  it('wraps the result in the standard envelope', async () => {
    const data = { status: 'ok' as const, database: 'up' as const };
    const controller = new HealthController({
      check: vi.fn().mockResolvedValue(data),
    } as unknown as HealthService);

    await expect(controller.check()).resolves.toEqual({
      status: HttpStatus.OK,
      message: 'Servicio operativo',
      data,
    });
  });

  it('is public and routed as GET /health', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.check),
    ).toBe(true);
    expect(Reflect.getMetadata('path', HealthController)).toBe('health');
    expect(
      Reflect.getMetadata('method', HealthController.prototype.check),
    ).toBe(RequestMethod.GET);
  });
});
