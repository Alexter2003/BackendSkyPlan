// Umbrales de la probabilidad de realización. Son la única fuente de verdad:
// cambiar una regla de negocio de probabilidad o de cancelación automática es
// cambiar un valor aquí.

// Una actividad OUTDOOR se cancela por sistema si su probabilidad es menor.
export const CANCEL_THRESHOLD = 30;

// La cancelación por sistema solo se considera cuando falta este tiempo (o
// menos) para el inicio de la actividad.
export const CANCEL_WINDOW_MINUTES = 60;

// Si no se pudo refrescar el pronóstico, el guardado se acepta únicamente si
// se actualizó hace menos de este tiempo.
export const STORED_FORECAST_MAX_AGE_MINUTES = 180;

// Bandas (semáforo) que se devuelven al cliente.
export const BAND_GREEN_MIN = 70;
export const BAND_YELLOW_MIN = 40;

// Una actividad INDOOR vale 100, salvo que haya clima severo (nieve o viento
// fuerte) durante su franja: entonces este es su máximo.
export const INDOOR_SEVERE_CAP = 70;

export const PROBABILITY_BAND = {
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED',
} as const;

export type ProbabilityBand =
  (typeof PROBABILITY_BAND)[keyof typeof PROBABILITY_BAND];
