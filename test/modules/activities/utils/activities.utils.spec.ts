import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import {
  assertForecastCompatible,
  assertNoContradictions,
  assertNoOverlap,
  assertValidTimeRange,
  parseTime,
  resolveViability,
  timesOverlap,
} from '../../../../src/modules/activities/utils/activities.utils.js';
import type { PrismaService } from '../../../../src/prisma/prisma.service.js';

const t = parseTime;

const rainyVisit = {
  cloudCover: 95,
  precipitation: 4.2,
  windSpeed: 10,
  weatherCode: 63,
};
const sunnyVisit = {
  cloudCover: 5,
  precipitation: 0,
  windSpeed: 10,
  weatherCode: 0,
};
const noWeather = {
  cloudCover: null,
  precipitation: null,
  windSpeed: null,
  weatherCode: null,
};

describe('parseTime', () => {
  it('parses HH:mm into a Date on the epoch day, in UTC', () => {
    expect(parseTime('08:30').toISOString()).toBe('1970-01-01T08:30:00.000Z');
  });
});

describe('timesOverlap', () => {
  it('detects a partial overlap', () => {
    expect(timesOverlap(t('09:00'), t('11:00'), t('10:00'), t('12:00'))).toBe(
      true,
    );
  });

  it('detects a contained range', () => {
    expect(timesOverlap(t('09:00'), t('12:00'), t('10:00'), t('11:00'))).toBe(
      true,
    );
  });

  it('detects identical ranges', () => {
    expect(timesOverlap(t('09:00'), t('10:00'), t('09:00'), t('10:00'))).toBe(
      true,
    );
  });

  it('allows back-to-back activities (end equals next start)', () => {
    expect(timesOverlap(t('09:00'), t('10:00'), t('10:00'), t('11:00'))).toBe(
      false,
    );
    expect(timesOverlap(t('10:00'), t('11:00'), t('09:00'), t('10:00'))).toBe(
      false,
    );
  });

  it('allows separate ranges', () => {
    expect(timesOverlap(t('08:00'), t('09:00'), t('14:00'), t('15:00'))).toBe(
      false,
    );
  });
});

describe('assertValidTimeRange', () => {
  it('rejects start equal to or after end', () => {
    expect(() => assertValidTimeRange(t('10:00'), t('10:00'))).toThrow(
      BadRequestException,
    );
    expect(() => assertValidTimeRange(t('11:00'), t('10:00'))).toThrow(
      BadRequestException,
    );
  });

  it('accepts start before end', () => {
    expect(() => assertValidTimeRange(t('09:00'), t('10:00'))).not.toThrow();
  });
});

describe('assertNoOverlap', () => {
  function prismaWith(found: unknown) {
    const findFirst = vi.fn().mockResolvedValue(found);
    return {
      prisma: { activity: { findFirst } } as unknown as PrismaService,
      findFirst,
    };
  }

  it('queries only active, non-cancelled activities of the same visit that intersect the range', async () => {
    const { prisma, findFirst } = prismaWith(null);

    await assertNoOverlap(prisma, 7, t('09:00'), t('11:00'));

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        visitId: 7,
        isActive: true,
        state: { name: { not: 'cancelled' } },
        startTime: { lt: t('11:00') },
        endTime: { gt: t('09:00') },
      },
    });
  });

  it('excludes the activity being edited', async () => {
    const { prisma, findFirst } = prismaWith(null);

    await assertNoOverlap(prisma, 7, t('09:00'), t('11:00'), 42);

    expect(findFirst.mock.calls[0][0].where.id).toEqual({ not: 42 });
  });

  it('throws ConflictException naming the conflicting activity and its times', async () => {
    const { prisma } = prismaWith({
      name: 'Caminata',
      startTime: t('08:00'),
      endTime: t('10:00'),
    });

    const call = assertNoOverlap(prisma, 7, t('09:00'), t('11:00'));

    await expect(call).rejects.toThrow(ConflictException);
    await expect(call).rejects.toThrow(/Caminata.*08:00.*10:00/);
  });
});

describe('assertNoContradictions', () => {
  it('rejects contradictory conditions naming both in Spanish', () => {
    expect(() => assertNoContradictions(['sunny', 'rainy'])).toThrow(
      /soleado.*lluvia/,
    );
    expect(() => assertNoContradictions(['sunny', 'rainy'])).toThrow(
      BadRequestException,
    );
  });

  it('accepts compatible conditions', () => {
    expect(() =>
      assertNoContradictions(['cloudy', 'rainy', 'windy']),
    ).not.toThrow();
  });
});

describe('resolveViability', () => {
  it('INDOOR is always viable, even with hostile weather or no data', () => {
    for (const weather of [rainyVisit, noWeather]) {
      expect(
        resolveViability({
          type: ActivityType.INDOOR,
          desired: ['sunny'],
          weather,
        }),
      ).toEqual({ isViable: true, detail: null });
    }
  });

  it('OUTDOOR without weather data is pending (null)', () => {
    expect(
      resolveViability({
        type: ActivityType.OUTDOOR,
        desired: ['sunny'],
        weather: noWeather,
      }),
    ).toEqual({ isViable: null, detail: null });
  });

  it('OUTDOOR is viable when the forecast matches every condition', () => {
    expect(
      resolveViability({
        type: ActivityType.OUTDOOR,
        desired: ['sunny', 'clear'],
        weather: sunnyVisit,
      }).isViable,
    ).toBe(true);
  });

  it('OUTDOOR is not viable when the forecast does not match, with the reason', () => {
    const result = resolveViability({
      type: ActivityType.OUTDOOR,
      desired: ['sunny'],
      weather: rainyVisit,
    });
    expect(result.isViable).toBe(false);
    expect(result.detail).toContain('lluvia');
    expect(result.detail).toContain('soleado');
  });
});

describe('assertForecastCompatible', () => {
  const visitDate = new Date('2026-10-05T00:00:00Z');

  it('throws 422 with a clear message when the forecast is incompatible', () => {
    const call = () =>
      assertForecastCompatible(
        { type: ActivityType.OUTDOOR, desired: ['sunny'], weather: rainyVisit },
        visitDate,
      );

    expect(call).toThrow(UnprocessableEntityException);
    expect(call).toThrow(/2026-10-05/);
    expect(call).toThrow(/incompatible con: soleado/);
  });

  it('returns the viability when it does not block', () => {
    expect(
      assertForecastCompatible(
        { type: ActivityType.OUTDOOR, desired: ['sunny'], weather: sunnyVisit },
        visitDate,
      ),
    ).toBe(true);
    expect(
      assertForecastCompatible(
        { type: ActivityType.OUTDOOR, desired: ['sunny'], weather: noWeather },
        visitDate,
      ),
    ).toBeNull();
  });
});
