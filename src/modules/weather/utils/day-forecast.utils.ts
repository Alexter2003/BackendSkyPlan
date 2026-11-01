import type {
  DayForecast,
  WeatherPort,
} from '../interfaces/weather-port.interface.js';

/**
 * Pronóstico de una sola fecha. Devuelve null si el proveedor no tiene datos
 * para ella (fuera de la ventana de pronóstico o consulta fallida).
 */
export async function getDayForecast(
  weather: WeatherPort,
  latitude: number,
  longitude: number,
  date: Date,
): Promise<DayForecast | null> {
  const forecasts = await weather.getForecastRange(
    latitude,
    longitude,
    date,
    date,
  );
  return forecasts.get(date.toISOString().slice(0, 10)) ?? null;
}
