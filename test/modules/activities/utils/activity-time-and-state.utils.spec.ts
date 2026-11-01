import {
  buildAutoCancelReason,
  CANCELLED_STATE_NAMES,
  computeActivityProbability,
  hasActivityEnded,
  isCancelled,
  localToday,
  minutesUntilStart,
} from '../../../../src/modules/activities/utils/activities.utils.js';
import { ActivityType } from '@prisma/client';

const hourly = {
  utcOffsetSeconds: -21600,
  hours: [
    {
      time: '2026-11-02T15:00',
      weatherCode: 0,
      precipitation: 0,
      cloudCover: 5,
      windSpeed: 5,
      precipitationProbability: 20,
    },
  ],
};

const visit = {
  date: new Date('2026-11-02T00:00:00Z'),
  hourlyForecast: hourly,
};
const time = (value: string) => new Date(`1970-01-01T${value}:00Z`);

describe('isCancelled', () => {
  it.each([
    ['cancelled', true],
    ['cancelled_by_system', true],
    ['planned', false],
    ['completed', false],
    ['confirmed', false],
  ])('%s -> %s', (name, expected) => {
    expect(isCancelled(name)).toBe(expected);
  });

  it('lists both cancelled states for queries', () => {
    expect([...CANCELLED_STATE_NAMES]).toEqual([
      'cancelled',
      'cancelled_by_system',
    ]);
  });
});

describe('minutesUntilStart', () => {
  it('uses the location offset: 20:30 UTC is 14:30 at UTC-6', () => {
    const now = new Date('2026-11-02T20:30:00Z');

    expect(minutesUntilStart(visit, time('15:00'), now)).toBe(30);
    expect(minutesUntilStart(visit, time('14:00'), now)).toBe(-30);
  });

  it('falls back to Guatemala time when the visit has no hourly forecast', () => {
    const now = new Date('2026-11-02T20:30:00Z');

    expect(
      minutesUntilStart(
        { date: visit.date, hourlyForecast: null },
        time('15:00'),
        now,
      ),
    ).toBe(30);
  });

  it('uses the offset of the visit, not a fixed one', () => {
    const tokyo = {
      date: visit.date,
      hourlyForecast: { ...hourly, utcOffsetSeconds: 32400 },
    };
    // 05:30 UTC = 14:30 en UTC+9
    const now = new Date('2026-11-02T05:30:00Z');

    expect(minutesUntilStart(tokyo, time('15:00'), now)).toBe(30);
  });
});

describe('hasActivityEnded', () => {
  const now = new Date('2026-11-02T20:30:00Z'); // 14:30 local

  it('is false before the end time and true from then on', () => {
    expect(hasActivityEnded(visit, time('15:00'), now)).toBe(false);
    expect(hasActivityEnded(visit, time('14:30'), now)).toBe(true);
    expect(hasActivityEnded(visit, time('14:00'), now)).toBe(true);
  });

  it('is true for any activity of a past date', () => {
    const past = { ...visit, date: new Date('2026-11-01T00:00:00Z') };

    expect(hasActivityEnded(past, time('23:59'), now)).toBe(true);
  });
});

describe('localToday', () => {
  it('is the Guatemala calendar day as midnight UTC', () => {
    expect(localToday(new Date('2026-11-02T18:00:00Z'))).toEqual(
      new Date('2026-11-02T00:00:00Z'),
    );
    expect(localToday(new Date('2026-11-03T05:59:00Z'))).toEqual(
      new Date('2026-11-02T00:00:00Z'),
    );
    expect(localToday(new Date('2026-11-03T06:00:00Z'))).toEqual(
      new Date('2026-11-03T00:00:00Z'),
    );
  });
});

describe('buildAutoCancelReason', () => {
  it('mentions the probability, the threshold and each forecast hour', () => {
    const reason = buildAutoCancelReason(22, 30, [
      { ...hourly.hours[0], precipitationProbability: 80, windSpeed: 12 },
    ]);

    expect(reason).toContain('22%');
    expect(reason).toContain('mínimo 30%');
    expect(reason).toContain('15:00');
    expect(reason).toContain('80% de precipitación');
  });

  it('never exceeds the 500 characters of the column', () => {
    const hours = Array.from({ length: 24 }, (_, index) => ({
      ...hourly.hours[0],
      time: `2026-11-02T${String(index).padStart(2, '0')}:00`,
    }));

    const reason = buildAutoCancelReason(10, 30, hours);

    expect(reason.length).toBeLessThanOrEqual(500);
    expect(reason.endsWith('…')).toBe(true);
  });
});

describe('computeActivityProbability', () => {
  it('reads the hourly forecast stored on the visit', () => {
    expect(
      computeActivityProbability({
        type: ActivityType.OUTDOOR,
        desired: ['sunny'],
        startTime: time('15:00'),
        endTime: time('16:00'),
        visit,
      }),
    ).toBe(80);
  });

  it('is null for OUTDOOR when the stored JSON is malformed', () => {
    expect(
      computeActivityProbability({
        type: ActivityType.OUTDOOR,
        desired: ['sunny'],
        startTime: time('15:00'),
        endTime: time('16:00'),
        visit: { date: visit.date, hourlyForecast: { broken: true } },
      }),
    ).toBeNull();
  });
});
