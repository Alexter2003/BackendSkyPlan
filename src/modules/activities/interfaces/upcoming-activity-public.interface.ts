import type { VisitStatus } from '@prisma/client';
import type { HourlyForecastHour } from '../../weather/interfaces/hourly-forecast.interface.js';
import type { ActivityPublic } from './activity-public.interface.js';

export interface UpcomingActivityVisit {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  date: string;
  status: VisitStatus;
}

// Actividad del listado de próximas: la forma normal más su ubicación y el
// clima proyectado de las horas de su franja (null si aún no hay pronóstico).
export interface UpcomingActivityPublic extends ActivityPublic {
  visit: UpcomingActivityVisit;
  forecast: HourlyForecastHour[] | null;
}

export interface UpcomingActivitiesPage {
  items: UpcomingActivityPublic[];
  page: number;
  limit: number;
  total: number;
}
