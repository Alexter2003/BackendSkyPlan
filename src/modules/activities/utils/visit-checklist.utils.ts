import { VisitStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { ACTIVITY_STATE } from './activities.utils.js';

// Bloquea la fila de la visita hasta que termine la transacción. Dos checks
// simultáneos sobre actividades de la misma visita no se ven entre sí (cada
// uno cuenta una pendiente) y ninguno la cerraría; con el bloqueo se
// serializan y el segundo ya ve el resultado del primero. Prisma no expone
// FOR UPDATE, por eso es SQL directo.
export async function lockVisit(
  tx: Prisma.TransactionClient,
  visitId: number,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Visit" WHERE "id" = ${visitId} FOR UPDATE`;
}

async function readVisitStatus(
  tx: Prisma.TransactionClient,
  visitId: number,
): Promise<VisitStatus> {
  const visit = await tx.visit.findUniqueOrThrow({
    where: { id: visitId },
    select: { status: true },
  });
  return visit.status;
}

// Cierra la visita cuando ya no queda ninguna actividad activa `planned` y hay
// al menos una `completed`. La condición `status: PLANNED` del update hace que
// una visita ya finalizada o cancelada nunca cambie. Devuelve el estado final.
export async function syncVisitCompletion(
  tx: Prisma.TransactionClient,
  visitId: number,
): Promise<VisitStatus> {
  const countByState = (state: string): Promise<number> =>
    tx.activity.count({
      where: { visitId, isActive: true, state: { name: state } },
    });

  const planned = await countByState(ACTIVITY_STATE.PLANNED);
  const completed = await countByState(ACTIVITY_STATE.COMPLETED);

  if (planned === 0 && completed >= 1) {
    await tx.visit.updateMany({
      where: { id: visitId, status: VisitStatus.PLANNED },
      data: { status: VisitStatus.COMPLETED },
    });
  }

  return readVisitStatus(tx, visitId);
}

// Reabre una visita finalizada (sola o a mano) cuando se deshace una de sus
// actividades completadas. Una visita cancelada o planificada no cambia.
export async function reopenVisitIfCompleted(
  tx: Prisma.TransactionClient,
  visitId: number,
): Promise<VisitStatus> {
  await tx.visit.updateMany({
    where: { id: visitId, status: VisitStatus.COMPLETED },
    data: { status: VisitStatus.PLANNED },
  });

  return readVisitStatus(tx, visitId);
}
