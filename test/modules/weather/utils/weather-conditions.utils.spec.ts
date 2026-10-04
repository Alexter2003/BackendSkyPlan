import {
  classifyWeather,
  evaluateConditions,
  findConflicts,
  toVisitWeatherData,
} from '../../../../src/modules/weather/utils/weather-conditions.utils.js';
import type { VisitWeatherData } from '../../../../src/modules/weather/utils/weather-conditions.utils.js';
import { WEATHER_CONDITION_CONFLICTS } from '../../../../src/modules/weather/constants/weather-conditions.constants.js';

const base: VisitWeatherData = {
  cloudCover: 10,
  precipitation: 0,
  windSpeed: 5,
  weatherCode: 0,
};

describe('findConflicts', () => {
  it('detects sunny + rainy as contradictory', () => {
    expect(findConflicts(['sunny', 'rainy'])).toEqual([['sunny', 'rainy']]);
  });

  it('is symmetric: the order of selection does not matter', () => {
    expect(findConflicts(['rainy', 'sunny'])).toHaveLength(1);
  });

  it('returns nothing for a single condition or compatible ones', () => {
    expect(findConflicts(['sunny'])).toEqual([]);
    expect(findConflicts(['cloudy', 'rainy', 'windy'])).toEqual([]);
    expect(findConflicts(['sunny', 'clear', 'windy'])).toEqual([]);
  });

  it('keeps windy compatible with every other condition', () => {
    expect(
      WEATHER_CONDITION_CONFLICTS.some(
        ([a, b]) => a === 'windy' || b === 'windy',
      ),
    ).toBe(false);
  });

  it('reports every contradictory pair', () => {
    expect(findConflicts(['sunny', 'cloudy', 'rainy'])).toHaveLength(2);
  });
});

describe('classifyWeather', () => {
  it('classifies a dry low-cloud day as sunny and clear', () => {
    expect(classifyWeather(base)).toEqual(new Set(['sunny', 'clear']));
  });

  it.each([
    [29, ['sunny', 'clear']],
    [30, ['partly_cloudy']],
    [69, ['partly_cloudy']],
    [70, ['cloudy']],
  ])('cloud cover %i%% -> %j', (cloudCover, expected) => {
    expect(classifyWeather({ ...base, cloudCover })).toEqual(new Set(expected));
  });

  it.each([
    [0.09, undefined],
    [0.1, 'drizzle'],
    [0.99, 'drizzle'],
    [1, 'rainy'],
  ])('precipitation %f mm -> %s', (precipitation, expected) => {
    const result = classifyWeather({ ...base, cloudCover: 90, precipitation });
    expect(result.has('drizzle')).toBe(expected === 'drizzle');
    expect(result.has('rainy')).toBe(expected === 'rainy');
  });

  it('uses WMO codes to detect precipitation type', () => {
    const cloudy = { ...base, cloudCover: 95 };
    expect(classifyWeather({ ...cloudy, weatherCode: 51 }).has('drizzle')).toBe(
      true,
    );
    expect(classifyWeather({ ...cloudy, weatherCode: 63 }).has('rainy')).toBe(
      true,
    );
    expect(classifyWeather({ ...cloudy, weatherCode: 95 }).has('rainy')).toBe(
      true,
    );
    expect(classifyWeather({ ...cloudy, weatherCode: 73 }).has('snowy')).toBe(
      true,
    );
  });

  it('never reports sunny/clear while it is precipitating, even with low cloud cover', () => {
    const result = classifyWeather({
      ...base,
      cloudCover: 10,
      weatherCode: 80,
    });
    expect(result.has('rainy')).toBe(true);
    expect(result.has('sunny')).toBe(false);
    expect(result.has('clear')).toBe(false);
  });

  it('reports a single precipitation type', () => {
    const result = classifyWeather({
      ...base,
      cloudCover: 95,
      weatherCode: 73,
      precipitation: 3,
    });
    expect(result.has('snowy')).toBe(true);
    expect(result.has('rainy')).toBe(false);
  });

  it('flags windy from 30 km/h and combines with other conditions', () => {
    expect(classifyWeather({ ...base, windSpeed: 29.9 }).has('windy')).toBe(
      false,
    );
    const windy = classifyWeather({ ...base, windSpeed: 30 });
    expect(windy.has('windy')).toBe(true);
    expect(windy.has('sunny')).toBe(true);
  });

  it('matches the real Open-Meteo reading used to design the thresholds (99% cloud, 0.1 mm, code 51)', () => {
    const result = classifyWeather({
      cloudCover: 99,
      precipitation: 0.1,
      windSpeed: 9.6,
      weatherCode: 51,
    });
    expect(result).toEqual(new Set(['drizzle', 'cloudy']));
  });
});

describe('evaluateConditions', () => {
  it('is compatible when every desired condition is met (AND)', () => {
    const result = evaluateConditions(['sunny', 'clear'], base);
    expect(result.compatible).toBe(true);
    expect(result.unmet).toEqual([]);
  });

  it('is incompatible when any desired condition is not met and lists them', () => {
    const result = evaluateConditions(['sunny', 'windy'], base);
    expect(result.compatible).toBe(false);
    expect(result.unmet).toEqual(['windy']);
  });

  it('describes the observed weather in the summary', () => {
    const result = evaluateConditions(['sunny'], {
      cloudCover: 90,
      precipitation: 4.2,
      windSpeed: 12,
      weatherCode: 63,
    });
    expect(result.compatible).toBe(false);
    expect(result.summary).toContain('lluvia');
    expect(result.summary).toContain('4.2 mm');
  });
});

describe('toVisitWeatherData', () => {
  it('returns the data when every field is present', () => {
    expect(
      toVisitWeatherData({
        cloudCover: 1,
        precipitation: 0,
        windSpeed: 2,
        weatherCode: 0,
      }),
    ).toEqual({
      cloudCover: 1,
      precipitation: 0,
      windSpeed: 2,
      weatherCode: 0,
    });
  });

  it('returns null when any field is missing (zero is a valid value)', () => {
    expect(
      toVisitWeatherData({
        cloudCover: null,
        precipitation: 0,
        windSpeed: 2,
        weatherCode: 0,
      }),
    ).toBeNull();
    expect(
      toVisitWeatherData({
        cloudCover: 0,
        precipitation: 0,
        windSpeed: 0,
        weatherCode: null,
      }),
    ).toBeNull();
  });
});
