import { ActivitiesAutoCancelCron } from '../../../src/modules/activities/activities-auto-cancel.cron.js';
import type { ActivityAutoCancelService } from '../../../src/modules/activities/activity-auto-cancel.service.js';

describe('ActivitiesAutoCancelCron', () => {
  const result = { scanned: 0, inWindow: 0, cancelled: 0, skipped: 0 };
  let run: ReturnType<typeof vi.fn>;
  let cron: ActivitiesAutoCancelCron;

  beforeEach(() => {
    run = vi.fn().mockResolvedValue(result);
    cron = new ActivitiesAutoCancelCron({
      run,
    } as unknown as ActivityAutoCancelService);
  });

  it('delegates to the auto-cancel service', async () => {
    await cron.cancelUnviableActivities();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('skips a run while the previous one is still in progress', async () => {
    let finish: (value: typeof result) => void = () => undefined;
    run.mockReturnValueOnce(
      new Promise<typeof result>((resolve) => {
        finish = resolve;
      }),
    );

    const first = cron.cancelUnviableActivities();
    await cron.cancelUnviableActivities();
    finish(result);
    await first;

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never throws, so a failure does not stop the schedule, and allows the next run', async () => {
    run.mockRejectedValueOnce(new Error('boom'));

    await expect(cron.cancelUnviableActivities()).resolves.toBeUndefined();
    await cron.cancelUnviableActivities();

    expect(run).toHaveBeenCalledTimes(2);
  });
});
