import { WeatherConditionsService } from '../../../src/modules/weather/weather-conditions.service.js';
import type { PrismaService } from '../../../src/prisma/prisma.service.js';

describe('WeatherConditionsService', () => {
  it('lists the catalog with the ids each condition conflicts with', async () => {
    const prisma = {
      weatherCondition: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            name: 'sunny',
            description: 'Clear sky with abundant sunshine',
          },
          { id: 2, name: 'rainy', description: 'Continuous rainfall' },
          { id: 3, name: 'cloudy', description: 'Overcast sky' },
          { id: 4, name: 'windy', description: 'Strong sustained wind' },
        ]),
      },
    };
    const service = new WeatherConditionsService(
      prisma as unknown as PrismaService,
    );

    const { data } = await service.findAll();

    const byName = Object.fromEntries(
      data.map((item) => [item.name, item.conflictsWith]),
    );
    expect(byName.sunny.sort()).toEqual([2, 3]);
    expect(byName.rainy).toEqual([1]);
    expect(byName.cloudy).toEqual([1]);
    expect(byName.windy).toEqual([]);
  });

  it('ignores catalog conflicts whose conditions are not seeded in the DB', async () => {
    const prisma = {
      weatherCondition: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 1, name: 'sunny', description: '' }]),
      },
    };
    const service = new WeatherConditionsService(
      prisma as unknown as PrismaService,
    );

    const { data } = await service.findAll();

    expect(data[0].conflictsWith).toEqual([]);
  });
});
