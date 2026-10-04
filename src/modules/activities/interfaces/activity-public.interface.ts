import type { ActivityType } from '@prisma/client';

export interface ActivityState {
  id: number;
  name: string;
}

export interface ActivityWeatherCondition {
  id: number;
  name: string;
}

// Forma devuelta a los clientes. `date` sale de la visita (la actividad ya no
// tiene fecha propia); `startTime`/`endTime` se serializan como "HH:mm".
export interface ActivityPublic {
  id: number;
  visitId: number;
  name: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  type: ActivityType;
  state: ActivityState;
  isViable: boolean | null;
  viabilityCheckedAt: Date | null;
  completedAt: Date | null;
  weatherConditions: ActivityWeatherCondition[];
}
