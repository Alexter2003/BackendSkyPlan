// Pronóstico de las 24 horas de la fecha de una visita, en hora local de la
// ubicación (Open-Meteo con `timezone=auto`). Se guarda como JSON en
// `Visit.hourlyForecast`.
export interface HourlyForecastHour {
  time: string; // "YYYY-MM-DDTHH:00", hora local
  weatherCode: number; // WMO
  precipitation: number; // mm
  cloudCover: number; // %
  windSpeed: number; // km/h
  precipitationProbability: number; // %
}

export interface HourlyForecast {
  // Desfase de la ubicación respecto a UTC; sirve para calcular su "ahora"
  // local sin una base de datos de zonas horarias.
  utcOffsetSeconds: number;
  hours: HourlyForecastHour[];
}
