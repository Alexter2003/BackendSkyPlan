import { OpenMeteoService } from '../../../src/modules/weather/open-meteo.service.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const completeHourly = {
  hourly: {
    time: Array.from(
      { length: 24 },
      (_, hour) => `2026-09-28T${String(hour).padStart(2, '0')}:00`,
    ),
    temperature_2m: Array.from({ length: 24 }, () => 20),
    relative_humidity_2m: Array.from({ length: 24 }, () => 70),
    precipitation: Array.from({ length: 24 }, () => 0),
    pressure_msl: Array.from({ length: 24 }, () => 1013),
    cloud_cover: Array.from({ length: 24 }, () => 50),
    weather_code: Array.from({ length: 24 }, () => 3),
    wind_speed_10m: Array.from({ length: 24 }, () => 5),
  },
};
// Índice objetivo (mediodía) con valores distintos, para verificar que se
// lee el índice correcto y no cualquiera.
completeHourly.hourly.temperature_2m[12] = 22.4;
completeHourly.hourly.relative_humidity_2m[12] = 71;
completeHourly.hourly.precipitation[12] = 0.2;
completeHourly.hourly.pressure_msl[12] = 1013.4;
completeHourly.hourly.cloud_cover[12] = 85;
completeHourly.hourly.weather_code[12] = 61;
completeHourly.hourly.wind_speed_10m[12] = 12.5;

describe('OpenMeteoService', () => {
  let service: OpenMeteoService;
  const fetchMock = vi.fn();

  beforeEach(() => {
    service = new OpenMeteoService();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns the snapshot from the target-hour index without touching other hours', async () => {
    fetchMock.mockResolvedValue(jsonResponse(completeHourly));

    const result = await service.getSnapshot(
      14.5586,
      -90.7295,
      new Date('2026-09-28T00:00:00Z'),
    );

    expect(result).toEqual({
      temperature: 22.4,
      humidity: 71,
      precipitation: 0.2,
      atmosphericPressure: 1013.4,
      cloudCover: 85,
      weatherCode: 61,
      windSpeed: 12.5,
    });
  });

  it('builds the request against the Open-Meteo forecast endpoint with the expected params', async () => {
    fetchMock.mockResolvedValue(jsonResponse(completeHourly));

    await service.getSnapshot(
      14.5586,
      -90.7295,
      new Date('2026-09-28T00:00:00Z'),
    );

    const calledUrl = fetchMock.mock.calls[0][0] as URL;
    expect(calledUrl.origin + calledUrl.pathname).toBe(
      'https://api.open-meteo.com/v1/forecast',
    );
    expect(calledUrl.searchParams.get('latitude')).toBe('14.5586');
    expect(calledUrl.searchParams.get('longitude')).toBe('-90.7295');
    expect(calledUrl.searchParams.get('start_date')).toBe('2026-09-28');
    expect(calledUrl.searchParams.get('end_date')).toBe('2026-09-28');
  });

  it('returns null without calling fetch when the date is beyond the forecast range', async () => {
    const result = await service.getSnapshot(
      14.5586,
      -90.7295,
      new Date('2026-12-24T00:00:00Z'),
    );

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the provider responds with a non-ok status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));

    const result = await service.getSnapshot(
      14.5586,
      -90.7295,
      new Date('2026-09-28T00:00:00Z'),
    );

    expect(result).toBeNull();
  });

  it('returns null when the hourly payload is missing fields', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ hourly: undefined }));

    const result = await service.getSnapshot(
      14.5586,
      -90.7295,
      new Date('2026-09-28T00:00:00Z'),
    );

    expect(result).toBeNull();
  });

  it('returns null instead of throwing when the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await service.getSnapshot(
      14.5586,
      -90.7295,
      new Date('2026-09-28T00:00:00Z'),
    );

    expect(result).toBeNull();
  });

  it('requests cloud cover, weather code and wind speed from the provider', async () => {
    fetchMock.mockResolvedValue(jsonResponse(completeHourly));

    await service.getSnapshot(
      14.5586,
      -90.7295,
      new Date('2026-09-28T00:00:00Z'),
    );

    const calledUrl = fetchMock.mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get('hourly')).toContain('cloud_cover');
    expect(calledUrl.searchParams.get('hourly')).toContain('weather_code');
    expect(calledUrl.searchParams.get('hourly')).toContain('wind_speed_10m');
  });

  describe('getSnapshotRange', () => {
    const multiDayHourly = {
      hourly: {
        time: ['2026-09-28T12:00', '2026-09-29T12:00', '2026-09-30T12:00'],
        temperature_2m: [22.4, 23.1, 21.8],
        relative_humidity_2m: [71, 68, 74],
        precipitation: [0.2, 0, 1.1],
        pressure_msl: [1013.4, 1012.9, 1011.5],
        cloud_cover: [85, 40, 10],
        weather_code: [61, 2, 0],
        wind_speed_10m: [12.5, 8, 31],
      },
    };

    it('returns one entry per requested day keyed by date', async () => {
      fetchMock.mockResolvedValue(jsonResponse(multiDayHourly));

      const result = await service.getSnapshotRange(
        14.5586,
        -90.7295,
        new Date('2026-09-28T00:00:00Z'),
        new Date('2026-09-30T00:00:00Z'),
      );

      expect(result.size).toBe(3);
      expect(result.get('2026-09-29')).toEqual({
        temperature: 23.1,
        humidity: 68,
        precipitation: 0,
        atmosphericPressure: 1012.9,
        cloudCover: 40,
        weatherCode: 2,
        windSpeed: 8,
      });
    });

    it('sends a single request spanning the full range', async () => {
      fetchMock.mockResolvedValue(jsonResponse(multiDayHourly));

      await service.getSnapshotRange(
        14.5586,
        -90.7295,
        new Date('2026-09-28T00:00:00Z'),
        new Date('2026-09-30T00:00:00Z'),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const calledUrl = fetchMock.mock.calls[0][0] as URL;
      expect(calledUrl.searchParams.get('start_date')).toBe('2026-09-28');
      expect(calledUrl.searchParams.get('end_date')).toBe('2026-09-30');
    });

    it('omits a day whose hourly values are incomplete instead of failing the whole range', async () => {
      const partial = {
        hourly: {
          time: ['2026-09-28T12:00', '2026-09-29T12:00'],
          temperature_2m: [22.4, null],
          relative_humidity_2m: [71, 68],
          precipitation: [0.2, 0],
          pressure_msl: [1013.4, 1012.9],
          cloud_cover: [85, 40],
          weather_code: [61, 2],
          wind_speed_10m: [12.5, 8],
        },
      };
      fetchMock.mockResolvedValue(jsonResponse(partial));

      const result = await service.getSnapshotRange(
        14.5586,
        -90.7295,
        new Date('2026-09-28T00:00:00Z'),
        new Date('2026-09-29T00:00:00Z'),
      );

      expect(result.size).toBe(1);
      expect(result.has('2026-09-29')).toBe(false);
    });

    it('clips the range to the forecast window without failing the whole call', async () => {
      fetchMock.mockResolvedValue(jsonResponse(multiDayHourly));

      await service.getSnapshotRange(
        14.5586,
        -90.7295,
        new Date('2026-09-28T00:00:00Z'),
        new Date('2026-12-24T00:00:00Z'),
      );

      const calledUrl = fetchMock.mock.calls[0][0] as URL;
      expect(calledUrl.searchParams.get('end_date')).toBe('2026-09-30');
    });

    it('returns an empty map without calling fetch when the whole range is out of bounds', async () => {
      const result = await service.getSnapshotRange(
        14.5586,
        -90.7295,
        new Date('2026-12-24T00:00:00Z'),
        new Date('2026-12-26T00:00:00Z'),
      );

      expect(result.size).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
