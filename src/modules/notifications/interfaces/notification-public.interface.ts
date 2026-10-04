import type { NotificationType } from '@prisma/client';

export interface NotificationPublic {
  id: number;
  activityId: number;
  visitId: number;
  type: NotificationType;
  title: string;
  message: string;
  readAt: Date | null;
  createdAt: Date;
}

// Evento emitido por WebSocket al cliente cuando cambia la viabilidad de una
// actividad. Mismo contenido que la notificación persistida, más el estado
// actual de viabilidad para que la app pueda actualizar la UI sin otra
// llamada.
export interface ActivityViabilityEvent {
  notificationId: number;
  activityId: number;
  visitId: number;
  activityName: string;
  type: NotificationType;
  isViable: boolean;
  title: string;
  message: string;
  createdAt: Date;
}

export const ACTIVITY_VIABILITY_EVENT = 'activity.viability_changed';
