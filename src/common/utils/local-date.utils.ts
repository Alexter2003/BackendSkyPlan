// Desfase de Guatemala (UTC-6, sin horario de verano), la zona de los crons y
// el criterio de "hoy" del proyecto cuando la visita no trae el suyo.
export const GUATEMALA_UTC_OFFSET_SECONDS = -6 * 60 * 60;

/** Fecha de hoy en hora de Guatemala, como medianoche UTC (igual que `Visit.date`). */
export function localToday(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + GUATEMALA_UTC_OFFSET_SECONDS * 1000);
  local.setUTCHours(0, 0, 0, 0);
  return local;
}
