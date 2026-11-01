import {
  findForecastHour,
  parseHourlyForecast,
} from '../../../../src/modules/weather/utils/hourly-forecast.utils.js';
import {
  parseOpenMeteoForecast,
  parseOpenMeteoHourly,
} from '../../../../src/modules/weather/utils/open-meteo.utils.js';
import type { OpenMeteoHourlyResponse } from '../../../../src/modules/weather/utils/open-meteo.utils.js';

const validHour = {
  time: '2026-09-28T15:00',
  weatherCode: 3,
  precipitation: 0,
  cloudCover: 50,
  windSpeed: 5,
  precipitationProbability: 20,
};

describe('parseHourlyForecast', () => {
  it('reads a well-formed forecast', () => {
    const forecast = parseHourlyForecast({
      utcOffsetSeconds: -21600,
      hours: [validHour],
    });

    expect(forecast).toEqual({ utcOffsetSeconds: -21600, hours: [validHour] });
  });

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['an array', []],
    ['missing hours', { utcOffsetSeconds: 0 }],
    ['missing offset', { hours: [validHour] }],
    ['only malformed hours', { utcOffsetSeconds: 0, hours: [{ time: 'x' }] }],
  ])('treats %s as no data', (_label, value) => {
    expect(parseHourlyForecast(value)).toBeNull();
  });

  it('drops malformed hours but keeps the valid ones', () => {
    const forecast = parseHourlyForecast({
      utcOffsetSeconds: 0,
      hours: [validHour, { time: 'broken' }],
    });

    expect(forecast?.hours).toEqual([validHour]);
  });
});

describe('findForecastHour', () => {
  it('finds a local hour of the given date', () => {
    const forecast = { utcOffsetSeconds: 0, hours: [validHour] };

    expect(findForecastHour(forecast, '2026-09-28', 15)).toEqual(validHour);
    expect(findForecastHour(forecast, '2026-09-28', 16)).toBeUndefined();
    expect(findForecastHour(forecast, '2026-09-29', 15)).toBeUndefined();
  });
});

function response(
  overrides: Partial<NonNullable<OpenMeteoHourlyResponse['hourly']>> = {},
  offset: number | null = -21600,
): OpenMeteoHourlyResponse {
  return {
    ...(offset === null ? {} : { utc_offset_seconds: offset }),
    hourly: {
      time: ['2026-09-28T11:00', '2026-09-28T12:00'],
      precipitation: [0, 0.2],
      cloud_cover: [10, 85],
      weather_code: [1, 61],
      wind_speed_10m: [5, 12.5],
      precipitation_probability: [10, 70],
      temperature_2m: [20, 22],
      relative_humidity_2m: [60, 71],
      pressure_msl: [1013, 1013.4],
      ...overrides,
    },
  };
}

describe('parseOpenMeteoHourly', () => {
  it('groups complete hours by date and keeps the UTC offset', () => {
    const result = parseOpenMeteoHourly(response());

    expect(result.get('2026-09-28')).toEqual({
      utcOffsetSeconds: -21600,
      hours: [
        {
          time: '2026-09-28T11:00',
          weatherCode: 1,
          precipitation: 0,
          cloudCover: 10,
          windSpeed: 5,
          precipitationProbability: 10,
        },
        {
          time: '2026-09-28T12:00',
          weatherCode: 61,
          precipitation: 0.2,
          cloudCover: 85,
          windSpeed: 12.5,
          precipitationProbability: 70,
        },
      ],
    });
  });

  it('omits an hour that is missing the precipitation probability', () => {
    const result = parseOpenMeteoHourly(
      response({ precipitation_probability: [null, 70] }),
    );

    expect(result.get('2026-09-28')?.hours.map((hour) => hour.time)).toEqual([
      '2026-09-28T12:00',
    ]);
  });

  it('returns nothing when the UTC offset is unknown', () => {
    expect(parseOpenMeteoHourly(response({}, null)).size).toBe(0);
  });
});

describe('parseOpenMeteoForecast', () => {
  it('returns the snapshot and the hourly detail of each date', () => {
    const result = parseOpenMeteoForecast(response(), 12);

    const day = result.get('2026-09-28');
    expect(day?.snapshot?.weatherCode).toBe(61);
    expect(day?.hourly?.hours).toHaveLength(2);
  });

  it('keeps the snapshot even if the hourly detail is unavailable', () => {
    const result = parseOpenMeteoForecast(response({}, null), 12);

    const day = result.get('2026-09-28');
    expect(day?.snapshot).not.toBeNull();
    expect(day?.hourly).toBeNull();
  });
});
