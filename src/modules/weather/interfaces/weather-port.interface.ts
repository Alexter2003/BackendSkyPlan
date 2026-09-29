export interface WeatherSnapshot {
  temperature: number; // °C
  precipitation: number; // mm
  humidity: number; // %
  atmosphericPressure: number; // hPa
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
}

export const WEATHER_PORT = Symbol('WEATHER_PORT');
