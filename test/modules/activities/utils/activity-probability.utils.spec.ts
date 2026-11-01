import { ActivityType } from '@prisma/client';
import {
  computeProbability,
  slotHours,
  toProbabilityBand,
} from '../../../../src/modules/activities/utils/activity-probability.utils.js';
import type { HourlyForecastHour } from '../../../../src/modules/weather/interfaces/hourly-forecast.interface.js';
import type { WeatherConditionName } from '../../../../src/modules/weather/constants/weather-conditions.constants.js';

const DATE = '2026-11-02';

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00Z`);
}

function hour(
  at: number,
  overrides: Partial<HourlyForecastHour> = {},
): HourlyForecastHour {
  return {
    time: `${DATE}T${String(at).padStart(2, '0')}:00`,
    weatherCode: 0,
    precipitation: 0,
    cloudCover: 5,
    windSpeed: 5,
    precipitationProbability: 10,
    ...overrides,
  };
}

function forecast(hours: HourlyForecastHour[]) {
  return { utcOffsetSeconds: -21600, hours };
}

function outdoor(
  desired: WeatherConditionName[],
  start: string,
  end: string,
  hours: HourlyForecastHour[] | null,
): number | null {
  return computeProbability({
    type: ActivityType.OUTDOOR,
    desired,
    date: DATE,
    startTime: time(start),
    endTime: time(end),
    hourly: hours ? forecast(hours) : null,
  });
}

describe('slotHours', () => {
  it.each([
    ['15:00', '17:00', [15, 16]],
    ['15:30', '16:30', [15, 16]],
    ['15:00', '15:30', [15]],
    ['09:15', '12:00', [9, 10, 11]],
  ])('%s-%s covers the hours it touches', (start, end, expected) => {
    expect(slotHours(time(start), time(end))).toEqual(expected);
  });
});

describe('computeProbability - OUTDOOR', () => {
  it('averages the per-hour score using the dry precipitation factor', () => {
    const result = outdoor(['sunny'], '15:00', '17:00', [
      hour(15, { precipitationProbability: 10 }),
      hour(16, { precipitationProbability: 30 }),
    ]);

    expect(result).toBe(80);
  });

  it('scores an hour that fails a sky condition as 0', () => {
    const result = outdoor(['sunny'], '15:00', '18:00', [
      hour(15),
      hour(16),
      hour(17, { cloudCover: 90 }),
    ]);

    expect(result).toBe(60);
  });

  it('uses 1 - p when the user did not ask for precipitation', () => {
    const result = outdoor(['cloudy'], '15:00', '16:00', [
      hour(15, { cloudCover: 90, precipitationProbability: 40 }),
    ]);

    expect(result).toBe(60);
  });

  it('uses p when the user asked for rain', () => {
    const result = outdoor(['rainy'], '15:00', '16:00', [
      hour(15, {
        precipitation: 2,
        weatherCode: 63,
        precipitationProbability: 80,
      }),
    ]);

    expect(result).toBe(80);
  });

  it('requires every sky and wind condition to hold at the same time', () => {
    const calm = outdoor(['sunny', 'windy'], '15:00', '16:00', [hour(15)]);
    const windy = outdoor(['sunny', 'windy'], '15:00', '16:00', [
      hour(15, { windSpeed: 40 }),
    ]);

    expect(calm).toBe(0);
    expect(windy).toBe(90);
  });

  it('is null when any hour of the slot has no forecast', () => {
    expect(outdoor(['sunny'], '15:00', '17:00', [hour(15)])).toBeNull();
  });

  it('is null without hourly data', () => {
    expect(outdoor(['sunny'], '15:00', '17:00', null)).toBeNull();
  });

  it('ignores forecast hours of another date', () => {
    const stale = hour(15);
    stale.time = '2026-11-01T15:00';

    expect(outdoor(['sunny'], '15:00', '16:00', [stale])).toBeNull();
  });
});

describe('computeProbability - INDOOR', () => {
  function indoor(hours: HourlyForecastHour[] | null): number | null {
    return computeProbability({
      type: ActivityType.INDOOR,
      desired: ['sunny'],
      date: DATE,
      startTime: time('15:00'),
      endTime: time('16:00'),
      hourly: hours ? forecast(hours) : null,
    });
  }

  it('is 100 with ordinary weather', () => {
    expect(indoor([hour(15, { precipitationProbability: 95 })])).toBe(100);
  });

  it('is capped at 70 with snow', () => {
    expect(indoor([hour(15, { weatherCode: 71 })])).toBe(70);
  });

  it('is capped at 70 with strong wind', () => {
    expect(indoor([hour(15, { windSpeed: 45 })])).toBe(70);
  });

  it('is 100 when there is no forecast', () => {
    expect(indoor(null)).toBe(100);
  });
});

describe('toProbabilityBand', () => {
  it.each([
    [100, 'GREEN'],
    [70, 'GREEN'],
    [69, 'YELLOW'],
    [40, 'YELLOW'],
    [39, 'RED'],
    [0, 'RED'],
    [null, null],
  ])('%s -> %s', (probability, band) => {
    expect(toProbabilityBand(probability)).toBe(band);
  });
});
