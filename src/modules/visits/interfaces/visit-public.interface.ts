import type { VisitStatus } from '@prisma/client';

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
  weatherUpdate: Date | null;
  createdAt: Date;
}

export interface VisitActivityState {
  id: number;
  name: string;
}

export interface VisitActivity {
  id: number;
  name: string;
  description: string;
  date: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  state: VisitActivityState;
}

export interface VisitDetail extends VisitPublic {
  activities: VisitActivity[];
}
