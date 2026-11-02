import type { PrismaService } from '../../../prisma/prisma.service.js';
import { ACTIVITY_STATE } from '../../activities/utils/activities.utils.js';
import type { VisitProgress } from '../interfaces/visit-public.interface.js';

export function emptyProgress(): VisitProgress {
  return { completed: 0, total: 0 };
}

// Progreso a partir de actividades ya cargadas (detalle de una visita): solo
// las planificadas y las completadas entran en el total.
export function progressFromStates(stateNames: string[]): VisitProgress {
  const progress = emptyProgress();
  for (const name of stateNames) {
    if (name === ACTIVITY_STATE.COMPLETED) {
      progress.completed += 1;
      progress.total += 1;
    } else if (name === ACTIVITY_STATE.PLANNED) {
      progress.total += 1;
    }
  }
  return progress;
}

// Progreso de varias visitas con dos consultas, sin cargar sus actividades:
// los ids de los estados relevantes y un conteo agrupado por visita y estado.
export async function getVisitProgress(
  prisma: PrismaService,
  visitIds: number[],
): Promise<Map<number, VisitProgress>> {
  const progressByVisit = new Map<number, VisitProgress>(
    visitIds.map((id) => [id, emptyProgress()]),
  );
  if (visitIds.length === 0) {
    return progressByVisit;
  }

  const states = await prisma.state.findMany({
    where: { name: { in: [ACTIVITY_STATE.PLANNED, ACTIVITY_STATE.COMPLETED] } },
  });
  const completedStateId = states.find(
    (state) => state.name === ACTIVITY_STATE.COMPLETED,
  )?.id;

  const rows = await prisma.activity.groupBy({
    by: ['visitId', 'stateId'],
    where: {
      visitId: { in: visitIds },
      isActive: true,
      stateId: { in: states.map((state) => state.id) },
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    const progress = progressByVisit.get(row.visitId);
    if (!progress) {
      continue;
    }
    progress.total += row._count._all;
    if (row.stateId === completedStateId) {
      progress.completed += row._count._all;
    }
  }

  return progressByVisit;
}

export async function getSingleVisitProgress(
  prisma: PrismaService,
  visitId: number,
): Promise<VisitProgress> {
  const progress = await getVisitProgress(prisma, [visitId]);
  return progress.get(visitId) ?? emptyProgress();
}
