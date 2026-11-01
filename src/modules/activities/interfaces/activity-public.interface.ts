import type { ActivityType } from '@prisma/client';
import type { ProbabilityBand } from '../constants/activity-probability.constants.js';

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
  // Idoneidad del clima para la franja de la actividad (0-100); null si aún
  // no hay pronóstico horario. No es una probabilidad meteorológica.
  probability: number | null;
  probabilityBand: ProbabilityBand | null;
  completedAt: Date | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  weatherConditions: ActivityWeatherCondition[];
}
