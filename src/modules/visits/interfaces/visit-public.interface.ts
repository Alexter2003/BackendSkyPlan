import type { VisitStatus } from '@prisma/client';
import type { ActivityPublic } from '../../activities/interfaces/activity-public.interface.js';

// Forma devuelta a los clientes. `latitude`/`longitude` se convierten de
// Decimal a number; `date` se serializa como "YYYY-MM-DD", no como ISO
// completo.
export interface VisitPublic {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  date: string;
  status: VisitStatus;
  temperature: number | null;
  precipitation: number | null;
  humidity: number | null;
  atmosphericPressure: number | null;
  cloudCover: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  weatherUpdate: Date | null;
  createdAt: Date;
}

export interface VisitDetail extends VisitPublic {
  activities: ActivityPublic[];
}
