import { VisitStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  lockVisit,
  reopenVisitIfCompleted,
  syncVisitCompletion,
} from '../../../../src/modules/activities/utils/visit-checklist.utils.js';

interface TxState {
  planned: number;
  completed: number;
  status: VisitStatus;
}

function createTx(initial: TxState) {
  const state = { ...initial };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    activity: {
      count: vi.fn(async ({ where }: { where: { state: { name: string } } }) =>
        where.state.name === 'planned' ? state.planned : state.completed,
      ),
    },
    visit: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { status: VisitStatus };
          data: { status: VisitStatus };
        }) => {
          if (state.status === where.status) {
            state.status = data.status;
            return { count: 1 };
          }
          return { count: 0 };
        },
      ),
      findUniqueOrThrow: vi.fn(async () => ({ status: state.status })),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, raw: tx, state };
}

describe('syncVisitCompletion', () => {
  it('completes the visit when nothing is planned and something is completed', async () => {
    const { tx, raw } = createTx({
      planned: 0,
      completed: 2,
      status: VisitStatus.PLANNED,
    });

    await expect(syncVisitCompletion(tx, 10)).resolves.toBe(
      VisitStatus.COMPLETED,
    );
    expect(raw.visit.updateMany).toHaveBeenCalledWith({
      where: { id: 10, status: VisitStatus.PLANNED },
      data: { status: VisitStatus.COMPLETED },
    });
  });

  it('does not complete the visit while activities are still planned', async () => {
    const { tx, raw } = createTx({
      planned: 1,
      completed: 2,
      status: VisitStatus.PLANNED,
    });

    await expect(syncVisitCompletion(tx, 10)).resolves.toBe(
      VisitStatus.PLANNED,
    );
    expect(raw.visit.updateMany).not.toHaveBeenCalled();
  });

  it('does not complete the visit when everything was cancelled (nothing completed)', async () => {
    const { tx, raw } = createTx({
      planned: 0,
      completed: 0,
      status: VisitStatus.PLANNED,
    });

    await expect(syncVisitCompletion(tx, 10)).resolves.toBe(
      VisitStatus.PLANNED,
    );
    expect(raw.visit.updateMany).not.toHaveBeenCalled();
  });

  it.each([VisitStatus.COMPLETED, VisitStatus.CANCELLED])(
    'leaves a %s visit untouched',
    async (status) => {
      const { tx, state } = createTx({ planned: 0, completed: 1, status });

      await expect(syncVisitCompletion(tx, 10)).resolves.toBe(status);
      expect(state.status).toBe(status);
    },
  );

  it('only counts active activities of the visit by state name', async () => {
    const { tx, raw } = createTx({
      planned: 0,
      completed: 1,
      status: VisitStatus.PLANNED,
    });

    await syncVisitCompletion(tx, 10);

    expect(raw.activity.count).toHaveBeenCalledWith({
      where: { visitId: 10, isActive: true, state: { name: 'planned' } },
    });
    expect(raw.activity.count).toHaveBeenCalledWith({
      where: { visitId: 10, isActive: true, state: { name: 'completed' } },
    });
  });
});

describe('reopenVisitIfCompleted', () => {
  it('moves a COMPLETED visit back to PLANNED', async () => {
    const { tx } = createTx({
      planned: 1,
      completed: 1,
      status: VisitStatus.COMPLETED,
    });

    await expect(reopenVisitIfCompleted(tx, 10)).resolves.toBe(
      VisitStatus.PLANNED,
    );
  });

  it.each([VisitStatus.PLANNED, VisitStatus.CANCELLED])(
    'does not change a %s visit',
    async (status) => {
      const { tx, state } = createTx({ planned: 1, completed: 1, status });

      await expect(reopenVisitIfCompleted(tx, 10)).resolves.toBe(status);
      expect(state.status).toBe(status);
    },
  );
});

describe('lockVisit', () => {
  it('takes a row lock on the visit with FOR UPDATE', async () => {
    const { tx, raw } = createTx({
      planned: 0,
      completed: 0,
      status: VisitStatus.PLANNED,
    });

    await lockVisit(tx, 10);

    expect(raw.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = raw.$queryRaw.mock.calls[0] as [
      string[],
      ...unknown[],
    ];
    expect(strings.join('?')).toContain('FOR UPDATE');
    expect(strings.join('?')).toContain('"Visit"');
    expect(values).toEqual([10]);
  });
});
