import type { HourlyForecast } from './hourly-forecast.interface.js';

export interface WeatherSnapshot {
  temperature: number; // °C
  precipitation: number; // mm
  humidity: number; // %
  atmosphericPressure: number; // hPa
  cloudCover: number; // %
  windSpeed: number; // km/h
  weatherCode: number; // código WMO
}

// Pronóstico de una fecha: el snapshot de las 12:00 locales (lo que ya
// guardaba la visita) y el detalle hora por hora. Cualquiera de los dos puede
// faltar si el proveedor no trajo datos completos.
export interface DayForecast {
  snapshot: WeatherSnapshot | null;
  hourly: HourlyForecast | null;
}

// Puerto que implementa cualquier proveedor de clima (Open-Meteo, Google
export interface WeatherPort {
  /**
   * Devuelve el snapshot climático para esa ubicación y fecha, o null si la
   * fecha está fuera del rango de pronóstico del proveedor o si la consulta
   * falla. Nunca lanza: la decisión de qué hacer sin clima es del dominio
   * (VisitsService), no de este puerto.
   */
  getSnapshot(
    latitude: number,
    longitude: number,
    date: Date,
  ): Promise<WeatherSnapshot | null>;

  /**
   * Igual que `getSnapshot`, pero para un rango de fechas en una sola consulta.
   * Clave del mapa: "YYYY-MM-DD". Las fechas sin dato utilizable simplemente
   * no aparecen en el mapa. Nunca lanza.
   */
  getSnapshotRange(
    latitude: number,
    longitude: number,
    startDate: Date,
    endDate: Date,
  ): Promise<Map<string, WeatherSnapshot>>;

  /**
   * Como `getSnapshotRange`, pero además del snapshot trae el pronóstico
   * horario de cada fecha. Una sola consulta al proveedor. Clave del mapa:
   * "YYYY-MM-DD". Nunca lanza.
   */
  getForecastRange(
    latitude: number,
    longitude: number,
    startDate: Date,
    endDate: Date,
  ): Promise<Map<string, DayForecast>>;
}

export const WEATHER_PORT = Symbol('WEATHER_PORT');
