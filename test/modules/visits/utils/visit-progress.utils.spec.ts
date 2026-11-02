import type { PrismaService } from '../../../../src/prisma/prisma.service.js';
import {
  getSingleVisitProgress,
  getVisitProgress,
  progressFromStates,
} from '../../../../src/modules/visits/utils/visit-progress.utils.js';

const PLANNED_ID = 1;
const COMPLETED_ID = 3;

function createPrisma(
  rows: { visitId: number; stateId: number; count: number }[],
) {
  return {
    state: {
      findMany: vi.fn().mockResolvedValue([
        { id: PLANNED_ID, name: 'planned' },
        { id: COMPLETED_ID, name: 'completed' },
      ]),
    },
    activity: {
      groupBy: vi.fn().mockResolvedValue(
        rows.map((row) => ({
          visitId: row.visitId,
          stateId: row.stateId,
          _count: { _all: row.count },
        })),
      ),
    },
  };
}

describe('progressFromStates', () => {
  it('counts planned and completed, and ignores cancelled ones', () => {
    expect(
      progressFromStates([
        'completed',
        'completed',
        'planned',
        'cancelled',
        'cancelled_by_system',
      ]),
    ).toEqual({ completed: 2, total: 3 });
  });

  it('returns zeros without activities', () => {
    expect(progressFromStates([])).toEqual({ completed: 0, total: 0 });
  });
});

describe('getVisitProgress', () => {
  it('sums planned and completed per visit', async () => {
    const prisma = createPrisma([
      { visitId: 10, stateId: COMPLETED_ID, count: 2 },
      { visitId: 10, stateId: PLANNED_ID, count: 1 },
    ]);

    const result = await getVisitProgress(
      prisma as unknown as PrismaService,
      [10],
    );

    expect(result.get(10)).toEqual({ completed: 2, total: 3 });
  });

  it('gives zeros to a visit without activities', async () => {
    const prisma = createPrisma([]);

    const result = await getVisitProgress(
      prisma as unknown as PrismaService,
      [10],
    );

    expect(result.get(10)).toEqual({ completed: 0, total: 0 });
  });

  it('resolves several visits in one grouped query', async () => {
    const prisma = createPrisma([
      { visitId: 10, stateId: COMPLETED_ID, count: 1 },
      { visitId: 11, stateId: PLANNED_ID, count: 4 },
    ]);

    const result = await getVisitProgress(
      prisma as unknown as PrismaService,
      [10, 11, 12],
    );

    expect(result.get(10)).toEqual({ completed: 1, total: 1 });
    expect(result.get(11)).toEqual({ completed: 0, total: 4 });
    expect(result.get(12)).toEqual({ completed: 0, total: 0 });
    expect(prisma.activity.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.state.findMany).toHaveBeenCalledTimes(1);
  });

  it('only counts active activities in planned or completed states', async () => {
    const prisma = createPrisma([]);

    await getVisitProgress(prisma as unknown as PrismaService, [10]);

    expect(prisma.activity.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['visitId', 'stateId'],
        where: {
          visitId: { in: [10] },
          isActive: true,
          stateId: { in: [PLANNED_ID, COMPLETED_ID] },
        },
      }),
    );
  });

  it('does not query anything for an empty list', async () => {
    const prisma = createPrisma([]);

    const result = await getVisitProgress(
      prisma as unknown as PrismaService,
      [],
    );

    expect(result.size).toBe(0);
    expect(prisma.state.findMany).not.toHaveBeenCalled();
    expect(prisma.activity.groupBy).not.toHaveBeenCalled();
  });
});

describe('getSingleVisitProgress', () => {
  it('returns the progress of one visit', async () => {
    const prisma = createPrisma([
      { visitId: 7, stateId: COMPLETED_ID, count: 1 },
    ]);

    await expect(
      getSingleVisitProgress(prisma as unknown as PrismaService, 7),
    ).resolves.toEqual({ completed: 1, total: 1 });
  });
});
